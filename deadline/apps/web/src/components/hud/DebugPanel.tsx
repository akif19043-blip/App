'use client';

import { useState, type RefObject } from 'react';
import { SECTOR_ZERO, WEAPON_DEFINITIONS } from '@deadline/shared';
import type { GameClient } from '@/game/gameClient';
import { useHud } from './useHud';

/**
 * Development-only debug panel (backtick to toggle).
 *
 * Every command is still validated by the server, and the server only accepts
 * them when ENABLE_DEBUG_TOOLS is on — which defaults to off in production.
 */
export function DebugPanel({ client }: { client: RefObject<GameClient | null> }) {
  const hud = useHud();
  const [weapon, setWeapon] = useState('ar12');

  if (!hud.debugEnabled) return null;

  return (
    <div className="pointer-events-auto absolute top-24 left-5 w-64 border border-caution/50 bg-void/95 p-3 text-xs">
      <h3 className="dl-heading mb-2 text-xs text-caution">DEBUG — DEV ONLY</h3>

      <div className="space-y-1.5">
        <Action onClick={() => client.current?.sendDebug('heal')}>Heal + full armour</Action>
        <Action onClick={() => client.current?.sendDebug('spawn_loot')}>Spawn loot crate</Action>
        <Action onClick={() => client.current?.sendDebug('spawn_enemy')}>Spawn guard</Action>
        <Action onClick={() => client.current?.sendDebug('set_timer', 70)}>Set timer 1:10</Action>
        <Action onClick={() => client.current?.sendDebug('kill_self')}>Kill self</Action>

        <div className="flex gap-1 pt-1">
          <select
            value={weapon}
            onChange={(event) => setWeapon(event.target.value)}
            className="flex-1 border border-edge bg-void px-1 py-1 text-[11px]"
          >
            {WEAPON_DEFINITIONS.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
          <Action onClick={() => client.current?.sendDebug('give_weapon', weapon)}>Give</Action>
        </div>

        <div className="pt-1">
          <div className="mb-1 text-[10px] tracking-[0.2em] text-muted">TELEPORT</div>
          <div className="grid grid-cols-2 gap-1">
            {SECTOR_ZERO.pois.slice(0, 6).map((poi) => (
              <Action
                key={poi.id}
                onClick={() =>
                  client.current?.sendDebug('teleport', undefined, poi.center.x, poi.center.z)
                }
              >
                {poi.name.split(' ')[0]}
              </Action>
            ))}
            {SECTOR_ZERO.extractions.map((point) => (
              <Action
                key={point.id}
                onClick={() =>
                  client.current?.sendDebug(
                    'teleport',
                    undefined,
                    point.position.x,
                    point.position.z,
                  )
                }
              >
                {point.name.split(' ')[0]}
              </Action>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 border-t border-edge pt-2 font-mono text-[10px] text-muted">
        <div>FPS {hud.fps} ({hud.quality})</div>
        <div>PING {hud.ping}ms</div>
        <div>PHASE {hud.phase}</div>
        <div>STATE {hud.raidState}</div>
      </div>
    </div>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full border border-edge px-2 py-1 text-left text-[11px] transition-colors hover:border-caution hover:text-caution"
    >
      {children}
    </button>
  );
}
