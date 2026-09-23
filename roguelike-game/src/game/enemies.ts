/** Enemy archetypes. Numbers are at t = 0; waves scale HP and damage over time. */
export type EnemyKind = 'swarmer' | 'grunt' | 'tank' | 'spitter' | 'elite' | 'boss';
export type EnemyShape = 'tri' | 'diamond' | 'hex' | 'square' | 'star' | 'crown';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  xp: number;
  color: string;
  shape: EnemyShape;
  /** 0 = full knockback, 1 = immovable. */
  kbResist: number;
  goldChance: number;
  ranged?: { range: number; cooldown: number; bulletSpeed: number; bulletDamage: number };
}

export const ENEMIES: Readonly<Record<EnemyKind, EnemyDef>> = {
  swarmer: { kind: 'swarmer', name: 'Swarmer', hp: 7, speed: 150, radius: 9, damage: 5, xp: 1, color: '#ff4fa3', shape: 'tri', kbResist: 0, goldChance: 0.01 },
  grunt: { kind: 'grunt', name: 'Drone', hp: 18, speed: 95, radius: 13, damage: 8, xp: 2, color: '#9d6bff', shape: 'diamond', kbResist: 0.1, goldChance: 0.02 },
  tank: { kind: 'tank', name: 'Bulwark', hp: 110, speed: 55, radius: 24, damage: 13, xp: 8, color: '#ff9e3d', shape: 'hex', kbResist: 0.85, goldChance: 0.08 },
  spitter: {
    kind: 'spitter', name: 'Spitter', hp: 26, speed: 85, radius: 14, damage: 6, xp: 4, color: '#5dff7a', shape: 'square', kbResist: 0.2, goldChance: 0.04,
    ranged: { range: 330, cooldown: 2.4, bulletSpeed: 230, bulletDamage: 9 },
  },
  elite: { kind: 'elite', name: 'Elite', hp: 650, speed: 105, radius: 30, damage: 18, xp: 60, color: '#ffe14d', shape: 'star', kbResist: 0.9, goldChance: 1 },
  boss: {
    kind: 'boss', name: 'Boss', hp: 2400, speed: 80, radius: 52, damage: 35, xp: 400, color: '#ff3355', shape: 'crown', kbResist: 1, goldChance: 1,
    ranged: { range: 700, cooldown: 2.6, bulletSpeed: 210, bulletDamage: 14 },
  },
};

export const MAX_ENEMY_RADIUS = ENEMIES.boss.radius * 1.5;
