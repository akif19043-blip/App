import { MapSchema, Schema, type } from '@colyseus/schema';
import { PlayerRaidState, RaidPhase } from '@deadline/shared';

/**
 * Colyseus state schema.
 *
 * Only what every client needs to render the world lives here; per-player
 * secrets (inventory contents, assigned extractions, container loot before it
 * is opened) are sent as targeted messages instead, so a modified client cannot
 * read them out of the shared state.
 */

export class PlayerState extends Schema {
  @type('string') sessionId = '';
  @type('string') userId = '';
  @type('string') username = '';

  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotationY = 0;
  @type('float32') pitch = 0;
  @type('float32') vx = 0;
  @type('float32') vz = 0;

  @type('float32') health = 100;
  @type('float32') armor = 0;
  @type('float32') stamina = 100;

  @type('string') raidState: PlayerRaidState = PlayerRaidState.Deploying;
  @type('boolean') sprinting = false;
  @type('boolean') crouching = false;
  @type('boolean') ads = false;
  @type('boolean') reloading = false;
  @type('boolean') isBot = false;
  @type('boolean') connected = true;

  @type('string') currentWeaponId = '';
  @type('uint16') ammoInMag = 0;
  @type('uint16') reserveAmmo = 0;

  @type('uint16') kills = 0;
  @type('uint16') aiKills = 0;
  @type('float32') damageDealt = 0;

  @type('float32') extractionProgress = 0;
  @type('string') extractionPointId = '';

  /** Last input sequence the server has simulated, for client reconciliation. */
  @type('uint32') lastProcessedInput = 0;
}

export class AIState extends Schema {
  @type('string') id = '';
  @type('string') archetype = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotationY = 0;
  @type('float32') health = 0;
  @type('float32') maxHealth = 0;
  @type('string') behaviour = 'idle';
  @type('boolean') alive = true;
}

export class ContainerState extends Schema {
  @type('string') id = '';
  @type('string') containerType = '';
  @type('float32') x = 0;
  @type('float32') y = 0;
  @type('float32') z = 0;
  @type('float32') rotationY = 0;
  @type('boolean') opened = false;
  @type('boolean') empty = false;
  @type('string') lockedRoomId = '';
  @type('string') poiId = '';
  /** Set for corpses so the client can draw a body instead of a crate. */
  @type('string') ownerName = '';
}

export class RaidState extends Schema {
  @type('string') phase: RaidPhase = RaidPhase.Waiting;
  @type('string') mapId = 'sector_zero';
  @type('uint32') seed = 0;
  /** Seconds left in the raid. */
  @type('float32') timeRemaining = 0;
  @type('float32') elapsed = 0;
  /** Seconds left on the pre-raid countdown. */
  @type('float32') countdown = 0;
  @type('uint8') alivePlayers = 0;

  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: AIState }) enemies = new MapSchema<AIState>();
  @type({ map: ContainerState }) containers = new MapSchema<ContainerState>();
}
