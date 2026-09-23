import { type PlayerStats } from '../game/stats';

const pct = (v: number) => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;

/** Human-readable stat summary for the pause and results screens. */
export function stats(s: Readonly<PlayerStats>): Array<[string, string]> {
  return [
    ['Max HP', String(Math.round(s.maxHp))],
    ['Damage', pct(s.might)],
    ['Cooldown', `${Math.round((s.cooldown - 1) * 100)}%`],
    ['Area', pct(s.area)],
    ['Speed', String(Math.round(s.moveSpeed))],
    ['Magnet', String(Math.round(s.magnet))],
    ['Armor', String(s.armor)],
    ['Regen', `${s.regen.toFixed(1)}/s`],
    ['Crit', `${Math.round(s.crit * 100)}%`],
    ['Projectiles', `+${s.amount}`],
  ];
}
