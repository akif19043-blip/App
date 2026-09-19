import { XP_REWARDS } from './config.js';

/**
 * XP curve. Level 1 is the starting level; `xpForLevel(2)` is the amount of
 * total XP required to reach level 2, and so on. The curve is progressive:
 * each level costs ~48% more than the previous one, rounded to hundreds.
 */
export const MAX_LEVEL = 60;

const LEVEL_THRESHOLDS: readonly number[] = (() => {
  const thresholds: number[] = [0, 0]; // index 0 unused, level 1 starts at 0 XP
  let requirement = 1000;
  for (let level = 2; level <= MAX_LEVEL; level += 1) {
    thresholds.push(thresholds[level - 1]! + Math.round(requirement / 100) * 100);
    requirement *= 1.48;
  }
  return thresholds;
})();

/** Total XP needed to *have reached* `level`. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level >= MAX_LEVEL) return LEVEL_THRESHOLDS[MAX_LEVEL]!;
  return LEVEL_THRESHOLDS[level]!;
}

export function levelForXp(totalXp: number): number {
  for (let level = MAX_LEVEL; level >= 1; level -= 1) {
    if (totalXp >= xpForLevel(level)) return level;
  }
  return 1;
}

export interface LevelProgress {
  readonly level: number;
  readonly currentLevelXp: number;
  readonly nextLevelXp: number;
  readonly xpIntoLevel: number;
  readonly xpToNextLevel: number;
  readonly progress: number;
}

export function levelProgress(totalXp: number): LevelProgress {
  const level = levelForXp(totalXp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = level >= MAX_LEVEL ? currentLevelXp : xpForLevel(level + 1);
  const span = Math.max(1, nextLevelXp - currentLevelXp);
  const xpIntoLevel = totalXp - currentLevelXp;
  return {
    level,
    currentLevelXp,
    nextLevelXp,
    xpIntoLevel,
    xpToNextLevel: Math.max(0, nextLevelXp - totalXp),
    progress: level >= MAX_LEVEL ? 1 : Math.min(1, xpIntoLevel / span),
  };
}

export const PerkId = {
  Runner: 'runner',
  Scavenger: 'scavenger',
  Medic: 'medic',
  Armored: 'armored',
  FastHands: 'fast_hands',
} as const;
export type PerkId = (typeof PerkId)[keyof typeof PerkId];

export interface PerkDefinition {
  readonly id: PerkId;
  readonly name: string;
  readonly description: string;
  readonly unlockLevel: number;
  readonly effects: PerkEffects;
}

/**
 * Perks only ever adjust these multipliers/offsets. Gameplay systems read the
 * aggregated {@link PerkModifiers}, so adding a perk never touches combat code.
 */
export interface PerkEffects {
  readonly sprintSpeedMultiplier?: number;
  readonly healSpeedMultiplier?: number;
  readonly reloadSpeedMultiplier?: number;
  readonly startingArmorBonus?: number;
  /** Extra container rolls expressed as a probability of one additional roll. */
  readonly extraLootRollChance?: number;
}

export const PERK_DEFINITIONS: readonly PerkDefinition[] = [
  {
    id: PerkId.Runner,
    name: 'Runner',
    description: '+5% sprint speed. The deadline is closer than you think.',
    unlockLevel: 1,
    effects: { sprintSpeedMultiplier: 1.05 },
  },
  {
    id: PerkId.Scavenger,
    name: 'Scavenger',
    description: '+35% chance of an extra roll every time you open a container.',
    unlockLevel: 1,
    effects: { extraLootRollChance: 0.35 },
  },
  {
    id: PerkId.Medic,
    name: 'Medic',
    description: '+20% healing speed.',
    unlockLevel: 2,
    effects: { healSpeedMultiplier: 1.2 },
  },
  {
    id: PerkId.Armored,
    name: 'Armored',
    description: '+10 armour at deploy, even with an empty rig.',
    unlockLevel: 3,
    effects: { startingArmorBonus: 10 },
  },
  {
    id: PerkId.FastHands,
    name: 'Fast Hands',
    description: '+10% reload speed.',
    unlockLevel: 4,
    effects: { reloadSpeedMultiplier: 1.1 },
  },
];

const PERK_INDEX = new Map(PERK_DEFINITIONS.map((perk) => [perk.id, perk]));

export function getPerk(id: string): PerkDefinition | undefined {
  return PERK_INDEX.get(id as PerkId);
}

export interface PerkModifiers {
  readonly sprintSpeedMultiplier: number;
  readonly healSpeedMultiplier: number;
  readonly reloadSpeedMultiplier: number;
  readonly startingArmorBonus: number;
  readonly extraLootRollChance: number;
}

export const NEUTRAL_PERK_MODIFIERS: PerkModifiers = {
  sprintSpeedMultiplier: 1,
  healSpeedMultiplier: 1,
  reloadSpeedMultiplier: 1,
  startingArmorBonus: 0,
  extraLootRollChance: 0,
};

/** Collapse a list of perk ids into a single modifier bundle. */
export function aggregatePerks(perkIds: readonly string[]): PerkModifiers {
  let sprint = 1;
  let heal = 1;
  let reload = 1;
  let armor = 0;
  let extraLoot = 0;
  for (const id of perkIds) {
    const perk = getPerk(id);
    if (!perk) continue;
    const e = perk.effects;
    if (e.sprintSpeedMultiplier) sprint *= e.sprintSpeedMultiplier;
    if (e.healSpeedMultiplier) heal *= e.healSpeedMultiplier;
    if (e.reloadSpeedMultiplier) reload *= e.reloadSpeedMultiplier;
    if (e.startingArmorBonus) armor += e.startingArmorBonus;
    if (e.extraLootRollChance) extraLoot = Math.min(0.95, extraLoot + e.extraLootRollChance);
  }
  return {
    sprintSpeedMultiplier: sprint,
    healSpeedMultiplier: heal,
    reloadSpeedMultiplier: reload,
    startingArmorBonus: armor,
    extraLootRollChance: extraLoot,
  };
}

export interface RaidXpBreakdown {
  readonly extraction: number;
  readonly playerKills: number;
  readonly aiKills: number;
  readonly lootValue: number;
  readonly survival: number;
  readonly total: number;
}

export interface RaidXpInput {
  readonly extracted: boolean;
  readonly playerKills: number;
  readonly aiKills: number;
  /** Credit value of loot that actually made it out. */
  readonly extractedLootValue: number;
  readonly survivalSeconds: number;
  readonly xpMultiplier?: number;
}

/** Single source of truth for raid XP. Called server side only. */
export function calculateRaidXp(input: RaidXpInput): RaidXpBreakdown {
  const multiplier = input.xpMultiplier ?? 1;
  const extraction = input.extracted ? XP_REWARDS.extraction : 0;
  const playerKills = input.playerKills * XP_REWARDS.playerKill;
  const aiKills = input.aiKills * XP_REWARDS.aiKill;
  const lootValue = input.extracted
    ? Math.floor((input.extractedLootValue / 100) * XP_REWARDS.lootValuePer100)
    : 0;
  const survival = Math.floor((input.survivalSeconds / 60) * XP_REWARDS.survivalPerMinute);
  const rawTotal = extraction + playerKills + aiKills + lootValue + survival;
  return {
    extraction,
    playerKills,
    aiKills,
    lootValue,
    survival,
    total: Math.max(0, Math.round(rawTotal * multiplier)),
  };
}
