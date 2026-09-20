'use client';

import { type RefObject } from 'react';
import { PlayerRaidState, RaidPhase } from '@deadline/shared';
import { formatClock, formatCredits } from '@deadline/ui';
import type { GameClient } from '@/game/gameClient';
import { DebugPanel } from './DebugPanel';
import { InventoryOverlay } from './InventoryOverlay';
import { LootWindow } from './LootWindow';
import { PostMatch } from './PostMatch';
import { useHud } from './useHud';

/**
 * The raid HUD.
 *
 * Reads a throttled snapshot of game state; it never drives the game loop.
 * Layout is deliberately sparse — health/armour bottom-left, ammo bottom-right,
 * the deadline dead centre-top, and everything else only when it matters.
 */
export function Hud({
  client,
  started,
  error,
  onReturnToMenu,
}: {
  client: RefObject<GameClient | null>;
  started: boolean;
  error: string | null;
  onReturnToMenu: () => void;
}) {
  // Tab and Escape are owned by the game's input controller, which mirrors the
  // resulting state into the HUD store — so there is exactly one source of
  // truth for whether the inventory is open.
  const hud = useHud();

  const dangerPhase = hud.phase === RaidPhase.FinalPhase;
  const alarm = hud.timeRemaining <= 60 && hud.timeRemaining > 0 && dangerPhase;
  const dead = hud.raidState === PlayerRaidState.Dead || hud.raidState === PlayerRaidState.MIA;

  if (error) {
    return (
      <Overlay>
        <p className="dl-heading text-2xl text-signal">CONNECTION LOST</p>
        <p className="mt-2 max-w-md text-center text-sm text-muted">{error}</p>
        <button
          type="button"
          onClick={onReturnToMenu}
          className="dl-heading mt-6 bg-signal px-6 py-2.5 text-sm font-semibold text-void"
        >
          Return to menu
        </button>
      </Overlay>
    );
  }

  if (hud.reconnecting) {
    return (
      <Overlay>
        <p className="dl-heading text-2xl text-caution">RECONNECTING</p>
        <p className="mt-2 text-sm tracking-[0.3em] text-muted">
          ATTEMPT {hud.reconnecting.attempt} / {hud.reconnecting.maxAttempts}
        </p>
        <p className="mt-4 max-w-sm text-center text-xs leading-relaxed text-muted">
          Your operator is still standing in Sector Zero. If you do not get back
          before the grace window closes, they are written off as MIA.
        </p>
      </Overlay>
    );
  }

  if (!started || !hud.connected) {
    return (
      <Overlay>
        <p className="dl-heading text-3xl">
          DEAD<span className="text-signal">LINE</span>
        </p>
        <p className="mt-3 text-sm tracking-[0.3em] text-muted">ESTABLISHING UPLINK…</p>
      </Overlay>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Low-health vignette */}
      {hud.health < 35 && (
        <div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle at 50% 50%, transparent 45%, rgba(255,68,56,${
              0.55 * (1 - hud.health / 35)
            }) 100%)`,
          }}
        />
      )}

      {alarm && <div className="dl-danger-pulse absolute inset-0 bg-signal/25" />}

      {/* ---- top centre: the deadline ---- */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 text-center">
        <div className="text-[10px] tracking-[0.4em] text-muted">DEADLINE</div>
        <div
          className={[
            'dl-heading text-4xl font-bold tabular-nums',
            dangerPhase ? 'text-signal' : 'text-ink',
          ].join(' ')}
        >
          {formatClock(hud.timeRemaining)}
        </div>
        {hud.phase === RaidPhase.Countdown && (
          <div className="dl-heading mt-1 text-lg text-caution">
            DEPLOYING IN {Math.ceil(hud.countdown)}
          </div>
        )}
      </div>

      {/* ---- top left: extractions ---- */}
      <div className="absolute top-5 left-5 space-y-1">
        <div className="text-[10px] tracking-[0.3em] text-muted">YOUR EXITS</div>
        {hud.assignedExtractions.map((exit) => (
          <div key={exit.id} className="flex items-baseline gap-2 text-xs">
            <span className="dl-heading text-uncommon">{exit.name}</span>
            <span className="font-mono text-muted">{Math.round(exit.distance)}m</span>
            <span className="font-mono text-[10px] text-muted">
              {String(Math.round(exit.bearing)).padStart(3, '0')}°
            </span>
          </div>
        ))}
      </div>

      {/* ---- top right: session info ---- */}
      <div className="absolute top-5 right-5 text-right text-[10px] tracking-[0.25em] text-muted">
        <div>ALIVE {hud.alivePlayers}</div>
        <div>KILLS {hud.kills} · AI {hud.aiKills}</div>
        <div data-hud="bag-value">BAG {formatCredits(hud.backpackValue)} CR</div>
        <div className="mt-1 font-mono">
          {hud.fps} FPS · {hud.ping}MS
        </div>
      </div>

      {/* ---- kill feed ---- */}
      <div className="absolute top-24 right-5 space-y-1 text-right">
        {hud.killFeed.map((entry) => (
          <div key={entry.id} className="dl-heading text-xs text-muted">
            {entry.text}
          </div>
        ))}
      </div>

      {/* ---- announcements ---- */}
      <div className="absolute top-32 left-1/2 w-full max-w-lg -translate-x-1/2 space-y-1 text-center">
        {hud.announcements.map((announcement) => (
          <div
            key={announcement.id}
            className={[
              'dl-heading text-lg',
              announcement.tone === 'danger'
                ? 'text-signal'
                : announcement.tone === 'warning'
                  ? 'text-caution'
                  : 'text-ink',
            ].join(' ')}
          >
            {announcement.text}
          </div>
        ))}
      </div>

      {/* ---- crosshair + hit marker ---- */}
      <Crosshair hud={hud} />

      {/* ---- damage direction indicators ---- */}
      {hud.damageIndicators.map((indicator) => (
        <div
          key={indicator.id}
          className="absolute top-1/2 left-1/2 h-40 w-40 origin-center"
          style={{ transform: `translate(-50%, -50%) rotate(${(indicator.angle * 180) / Math.PI}deg)` }}
        >
          <div className="mx-auto h-0 w-0 border-x-8 border-b-[14px] border-x-transparent border-b-signal opacity-80" />
        </div>
      ))}

      {/* ---- compass ---- */}
      <Compass heading={hud.compassHeading} />

      {/* ---- extraction progress ---- */}
      {hud.raidState === PlayerRaidState.Extracting && (
        <div className="absolute bottom-40 left-1/2 w-72 -translate-x-1/2 text-center">
          <div className="dl-heading text-xl text-uncommon">EXTRACTING</div>
          <div className="dl-heading text-3xl tabular-nums">
            {(5 * (1 - hud.extractionProgress)).toFixed(1)}
          </div>
          <div className="mt-2 h-1 w-full bg-edge">
            <div
              className="h-full bg-uncommon transition-[width] duration-100"
              style={{ width: `${Math.round(hud.extractionProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ---- interaction prompt ---- */}
      {hud.prompt && !hud.lootOffer && (
        <div className="absolute bottom-48 left-1/2 -translate-x-1/2 text-center">
          <span className="dl-heading border border-edge bg-void/80 px-4 py-1.5 text-sm">
            <span className="text-caution">F</span>{' '}
            {hud.prompt.locked ? 'LOCKED — KEY REQUIRED' : hud.prompt.label}
          </span>
        </div>
      )}

      {/* ---- extraction available prompt ---- */}
      {hud.raidState === PlayerRaidState.Alive &&
        hud.assignedExtractions.some((exit) => exit.distance < 7) && (
          <div className="absolute bottom-56 left-1/2 -translate-x-1/2 text-center">
            <span className="dl-heading border border-uncommon bg-void/80 px-4 py-1.5 text-sm text-uncommon">
              <span className="text-caution">X</span> HOLD POSITION TO EXTRACT
            </span>
          </div>
        )}

      {/* ---- bottom left: vitals ---- */}
      <div className="absolute bottom-6 left-6 w-64">
        <Bar label="HEALTH" value={hud.health} max={100} tone="bg-signal" />
        <Bar label="ARMOR" value={hud.armor} max={100} tone="bg-rare" />
        <Bar label="STAMINA" value={hud.stamina} max={100} tone="bg-uncommon" />
      </div>

      {/* ---- bottom right: weapon ---- */}
      <div className="absolute right-6 bottom-6 text-right">
        <div className="dl-heading text-lg text-muted" data-hud="weapon-name">
          {hud.weaponName}
        </div>
        <div className="dl-heading text-4xl tabular-nums">
          <span
            data-hud="ammo-mag"
            className={hud.ammoInMag === 0 ? 'text-signal' : 'text-ink'}
          >
            {hud.ammoInMag}
          </span>
          <span className="text-lg text-muted" data-hud="ammo-reserve">
            {' '}
            / {hud.reserveAmmo}
          </span>
        </div>
        {hud.reloading && <div className="dl-heading text-sm text-caution">RELOADING…</div>}
      </div>

      {/* ---- overlays ---- */}
      {hud.lootOffer && <LootWindow client={client} offer={hud.lootOffer} />}
      {hud.inventoryOpen && (
        <InventoryOverlay
          client={client}
          hud={hud}
          onClose={() => client.current?.setInventoryOpen(false)}
        />
      )}
      {hud.showDebugPanel && <DebugPanel client={client} />}
      {(hud.summary || dead || hud.phase === RaidPhase.Ended) && (
        <PostMatch hud={hud} onReturnToMenu={onReturnToMenu} />
      )}
    </div>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-void/90">
      {children}
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: string;
}) {
  const ratio = Math.max(0, Math.min(1, value / max));
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[9px] tracking-[0.25em] text-muted">
        <span>{label}</span>
        <span className="font-mono tabular-nums">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 w-full bg-edge">
        <div
          className={`h-full ${tone} transition-[width] duration-150`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function Crosshair({ hud }: { hud: ReturnType<typeof useHud> }) {
  const showHitMarker = Date.now() - hud.hitMarkerAt < 180;
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="relative h-6 w-6">
        <span className="absolute top-1/2 left-1/2 h-[2px] w-[2px] -translate-x-1/2 -translate-y-1/2 bg-ink/80" />
        {showHitMarker && (
          <span
            className={[
              'absolute inset-0 rotate-45',
              hud.headshotMarker ? 'text-signal' : 'text-ink',
            ].join(' ')}
          >
            <span className="absolute top-1/2 left-0 h-[2px] w-2 -translate-y-1/2 bg-current" />
            <span className="absolute top-1/2 right-0 h-[2px] w-2 -translate-y-1/2 bg-current" />
            <span className="absolute top-0 left-1/2 h-2 w-[2px] -translate-x-1/2 bg-current" />
            <span className="absolute bottom-0 left-1/2 h-2 w-[2px] -translate-x-1/2 bg-current" />
          </span>
        )}
      </div>
    </div>
  );
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function Compass({ heading }: { heading: number }) {
  return (
    <div className="absolute top-20 left-1/2 flex w-80 -translate-x-1/2 justify-between overflow-hidden border-y border-edge/60 px-2 py-1">
      {CARDINALS.map((cardinal, index) => {
        const bearing = index * 45;
        let delta = bearing - heading;
        while (delta > 180) delta -= 360;
        while (delta < -180) delta += 360;
        const visible = Math.abs(delta) < 70;
        return (
          <span
            key={cardinal}
            className="dl-heading text-xs transition-opacity"
            style={{
              opacity: visible ? 1 - Math.abs(delta) / 90 : 0,
              transform: `translateX(${-delta * 1.6}px)`,
              color: cardinal === 'N' ? 'var(--color-signal)' : 'var(--color-muted)',
            }}
          >
            {cardinal}
          </span>
        );
      })}
    </div>
  );
}
