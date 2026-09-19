'use client';

import { useState, type RefObject } from 'react';
import { INVENTORY, getItem, type SerializedInventory } from '@deadline/shared';
import { formatCredits, rarityColor } from '@deadline/ui';
import type { GameClient } from '@/game/gameClient';
import type { HudSnapshot } from '@/game/store';

/**
 * In-raid grid inventory.
 *
 * The raid does not pause while this is open — the world keeps simulating
 * behind it, which is the whole point of an extraction shooter's inventory.
 * Drag a stack to move it; drag it onto the secure container to protect it.
 */
export function InventoryOverlay({
  client,
  hud,
  onClose,
}: {
  client: RefObject<GameClient | null>;
  hud: HudSnapshot;
  onClose: () => void;
}) {
  const [dragging, setDragging] = useState<{ entryId: string; from: 'backpack' | 'secure' } | null>(
    null,
  );

  const backpack = hud.inventory.backpack;
  const secure = hud.inventory.secure;

  const onDrop = (container: 'backpack' | 'secure', x: number, y: number): void => {
    if (!dragging) return;
    client.current?.moveItem(dragging.entryId, container, x, y, false);
    setDragging(null);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-void/70 px-6">
      <div className="dl-panel dl-cut w-full max-w-4xl">
        <header className="flex items-center justify-between border-b border-edge px-5 py-3">
          <h2 className="dl-heading text-lg">Inventory</h2>
          <div className="flex items-center gap-4">
            <span className="text-[10px] tracking-[0.25em] text-caution">
              {formatCredits(hud.backpackValue)} CR
            </span>
            <button
              type="button"
              onClick={onClose}
              className="dl-heading border border-edge px-3 py-1 text-xs text-muted hover:text-ink"
            >
              Close (TAB)
            </button>
          </div>
        </header>

        <div className="grid gap-6 p-5 lg:grid-cols-[2fr_1fr]">
          <section>
            <h3 className="dl-heading mb-2 text-xs text-muted">
              BACKPACK — {INVENTORY.backpackWidth}×{INVENTORY.backpackHeight}
            </h3>
            <Grid
              inventory={backpack}
              width={INVENTORY.backpackWidth}
              height={INVENTORY.backpackHeight}
              onDragStart={(entryId) => setDragging({ entryId, from: 'backpack' })}
              onDrop={(x, y) => onDrop('backpack', x, y)}
              onUse={(entryId) => client.current?.useItem(entryId)}
              onDropItem={(entryId) => client.current?.dropItem(entryId)}
            />
          </section>

          <section>
            <h3 className="dl-heading mb-2 text-xs text-uncommon">
              SECURE — {INVENTORY.secureWidth}×{INVENTORY.secureHeight}
            </h3>
            <Grid
              inventory={secure}
              width={INVENTORY.secureWidth}
              height={INVENTORY.secureHeight}
              accent="border-uncommon/40"
              onDragStart={(entryId) => setDragging({ entryId, from: 'secure' })}
              onDrop={(x, y) => onDrop('secure', x, y)}
              onUse={(entryId) => client.current?.useItem(entryId)}
              onDropItem={(entryId) => client.current?.dropItem(entryId)}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Anything in the secure container survives your death. Everything else stays on your
              body for whoever finds it.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

const CELL = 42;

function Grid({
  inventory,
  width,
  height,
  accent = 'border-edge',
  onDragStart,
  onDrop,
  onUse,
  onDropItem,
}: {
  inventory: SerializedInventory | null;
  width: number;
  height: number;
  accent?: string;
  onDragStart: (entryId: string) => void;
  onDrop: (x: number, y: number) => void;
  onUse: (entryId: string) => void;
  onDropItem: (entryId: string) => void;
}) {
  return (
    <div
      className={`relative border ${accent} bg-void/60`}
      style={{ width: width * CELL, height: height * CELL }}
    >
      {/* Empty cells: the drop targets. */}
      {Array.from({ length: width * height }, (_, index) => {
        const x = index % width;
        const y = Math.floor(index / width);
        return (
          <div
            key={index}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => onDrop(x, y)}
            className="absolute border border-edge/40"
            style={{ left: x * CELL, top: y * CELL, width: CELL, height: CELL }}
          />
        );
      })}

      {inventory?.entries.map((entry) => {
        const definition = getItem(entry.itemId);
        if (!definition) return null;
        const w = entry.rotated ? definition.height : definition.width;
        const h = entry.rotated ? definition.width : definition.height;
        return (
          <div
            key={entry.id}
            draggable
            onDragStart={() => onDragStart(entry.id)}
            onDoubleClick={() => onUse(entry.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              onDropItem(entry.id);
            }}
            title={`${definition.name} — double-click to use, right-click to drop`}
            className="absolute cursor-grab border-l-2 bg-raised px-1 py-0.5 text-[9px] leading-tight"
            style={{
              left: entry.x * CELL + 1,
              top: entry.y * CELL + 1,
              width: w * CELL - 2,
              height: h * CELL - 2,
              borderLeftColor: rarityColor(definition.rarity),
              borderTop: '1px solid var(--color-edge)',
              borderRight: '1px solid var(--color-edge)',
              borderBottom: '1px solid var(--color-edge)',
            }}
          >
            <span className="block truncate">{definition.name}</span>
            {entry.quantity > 1 && (
              <span className="absolute right-1 bottom-0.5 font-mono text-[9px] text-muted">
                ×{entry.quantity}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
