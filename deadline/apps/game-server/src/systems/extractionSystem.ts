import {
  PlayerRaidState,
  type RaidPhase,
  ServerMessage,
  type ExtractionPoint,
  type GameConfig,
  type MapDefinition,
} from '@deadline/shared';
import {
  checkExtractionEligibility,
  extractionAtPosition,
  stepExtraction,
} from '@deadline/game-core';
import type { RaidPlayer } from '../rooms/raidPlayer.js';
import { isAlive } from '../rooms/raidPlayer.js';
import type { AntiCheat } from './antiCheat.js';

export interface ExtractionHost {
  readonly config: GameConfig;
  readonly map: MapDefinition;
  readonly antiCheat: AntiCheat;
  phase(): RaidPhase;
  sendTo(sessionId: string, type: string, payload: unknown): void;
  broadcast(type: string, payload: unknown): void;
  onExtracted(player: RaidPlayer): void;
}

/**
 * Extraction: stand in one of *your* assigned zones for the configured hold
 * time. Leaving the zone, dying or the raid ending all cancel it. The position
 * check runs every tick against the server's own copy of the player position.
 */
export class ExtractionSystem {
  private readonly host: ExtractionHost;

  constructor(host: ExtractionHost) {
    this.host = host;
  }

  /** Returns an error reason, or null when the attempt started. */
  start(player: RaidPlayer, extractionPointId: string): string | null {
    const eligibility = checkExtractionEligibility({
      position: { x: player.schema.x, y: player.schema.y, z: player.schema.z },
      playerState: player.schema.raidState,
      phase: this.host.phase(),
      extractionPointId,
      assignedPointIds: player.assignedExtractions,
      allPoints: this.host.map.extractions,
    });

    if (!eligibility.ok) {
      if (eligibility.reason === 'out_of_range' || eligibility.reason === 'not_assigned') {
        this.host.antiCheat.report(
          player.userId,
          'extraction_position',
          `point=${extractionPointId} reason=${eligibility.reason}`,
        );
      }
      return eligibility.reason ?? 'ineligible';
    }

    player.extraction = { pointId: extractionPointId, elapsed: 0 };
    player.schema.raidState = PlayerRaidState.Extracting;
    player.schema.extractionPointId = extractionPointId;
    player.schema.extractionProgress = 0;

    this.host.broadcast(ServerMessage.ExtractionStarted, {
      playerId: player.sessionId,
      extractionPointId,
      progress: 0,
      remainingSeconds: this.host.config.extractionTimeSeconds,
    });
    return null;
  }

  cancel(player: RaidPlayer, reason: string): void {
    if (!player.extraction) return;
    const pointId = player.extraction.pointId;
    player.extraction = null;
    player.schema.extractionProgress = 0;
    player.schema.extractionPointId = '';
    if (player.schema.raidState === PlayerRaidState.Extracting) {
      player.schema.raidState = PlayerRaidState.Alive;
    }
    this.host.sendTo(player.sessionId, ServerMessage.ExtractionCancelled, {
      playerId: player.sessionId,
      extractionPointId: pointId,
      progress: 0,
      remainingSeconds: this.host.config.extractionTimeSeconds,
      reason,
    });
  }

  /** The assigned extraction the player is currently standing in, if any. */
  zoneAt(player: RaidPlayer): ExtractionPoint | null {
    return extractionAtPosition(
      { x: player.schema.x, y: player.schema.y, z: player.schema.z },
      player.assignedExtractions,
      this.host.map.extractions,
    );
  }

  update(player: RaidPlayer, dt: number): void {
    if (!player.extraction) return;

    if (!isAlive(player)) {
      this.cancel(player, 'not_alive');
      return;
    }

    const eligibility = checkExtractionEligibility({
      position: { x: player.schema.x, y: player.schema.y, z: player.schema.z },
      playerState: player.schema.raidState,
      phase: this.host.phase(),
      extractionPointId: player.extraction.pointId,
      assignedPointIds: player.assignedExtractions,
      allPoints: this.host.map.extractions,
    });
    if (!eligibility.ok) {
      this.cancel(player, eligibility.reason ?? 'ineligible');
      return;
    }

    const result = stepExtraction(player.extraction, dt, this.host.config.extractionTimeSeconds);
    player.schema.extractionProgress = result.progress;

    this.host.sendTo(player.sessionId, ServerMessage.ExtractionStarted, {
      playerId: player.sessionId,
      extractionPointId: player.extraction.pointId,
      progress: result.progress,
      remainingSeconds: result.remainingSeconds,
    });

    if (result.completed) {
      player.extraction = null;
      player.schema.raidState = PlayerRaidState.Extracted;
      player.schema.extractionProgress = 1;
      this.host.broadcast(ServerMessage.ExtractionCompleted, {
        playerId: player.sessionId,
        extractionPointId: player.schema.extractionPointId,
        progress: 1,
        remainingSeconds: 0,
      });
      this.host.onExtracted(player);
    }
  }
}
