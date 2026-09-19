import { describe, expect, it } from 'vitest';
import {
  ContainerType,
  DEFAULT_GAME_CONFIG,
  MOVEMENT,
  PlayerRaidState,
  RaidPhase,
  Rarity,
  RiskLevel,
  SECTOR_ZERO,
  aggregatePerks,
  buyPrice,
  calculateRaidXp,
  getItem,
  levelForXp,
  levelProgress,
  makeRng,
  sellPrice,
  validatePurchase,
  validateSale,
  xpForLevel,
  InputMessageSchema,
  PickupMessageSchema,
  JoinOptionsSchema,
  MissionType,
  type MissionDefinition,
  type MissionProgress,
} from '@deadline/shared';
import { CollisionWorld } from './collision.js';
import { createMovementState, maxLegalDistance, stepMovement } from './movement.js';
import { lootValue, rollAILoot, rollContainer } from './lootRoll.js';
import { checkExtractionEligibility, stepExtraction } from './extraction.js';
import { applyRaidToMissions, raidProgressFor } from './missionProgress.js';
import { pickSafeSpawn } from './spawn.js';
import { findOpenLane } from './testing/openGround.js';

const world = new CollisionWorld(SECTOR_ZERO);
// The map is generated; walk tests start from a verified clear lane.
const lane = findOpenLane(30, SECTOR_ZERO, world);

describe('movement', () => {
  const baseInput = {
    forward: 1, right: 0, yaw: lane.yaw, sprint: false, crouch: false, ads: false, dt: 1 / 60,
  };
  const startState = () => createMovementState(lane.position.x, lane.position.z);

  it('accelerates forward and never exceeds walk speed', () => {
    const state = startState();
    for (let i = 0; i < 120; i += 1) stepMovement(state, baseInput, world);
    const speed = Math.hypot(state.vx, state.vz);
    expect(speed).toBeLessThanOrEqual(MOVEMENT.walkSpeed + 0.01);
    expect(speed).toBeGreaterThan(MOVEMENT.walkSpeed * 0.95);
  });

  it('sprinting drains stamina and is faster', () => {
    const state = startState();
    for (let i = 0; i < 100; i += 1) stepMovement(state, { ...baseInput, sprint: true }, world);
    expect(state.stamina).toBeLessThan(MOVEMENT.maxStamina);
    expect(Math.hypot(state.vx, state.vz)).toBeGreaterThan(MOVEMENT.walkSpeed);
  });

  it('stamina regenerates only after the idle delay', () => {
    const state = startState();
    for (let i = 0; i < 120; i += 1) stepMovement(state, { ...baseInput, sprint: true }, world);
    const drained = state.stamina;
    // Immediately after sprinting, regeneration is still on cooldown.
    stepMovement(state, { ...baseInput, forward: 0, dt: 0.2 }, world);
    expect(state.stamina).toBeCloseTo(drained, 3);
    for (let i = 0; i < 60; i += 1) {
      stepMovement(state, { ...baseInput, forward: 0, dt: 1 / 30 }, world);
    }
    expect(state.stamina).toBeGreaterThan(drained);
  });

  it('cannot sprint once stamina is exhausted', () => {
    const state = startState();
    state.stamina = 0;
    stepMovement(state, { ...baseInput, sprint: true }, world);
    expect(state.sprinting).toBe(false);
  });

  it('keeps the player inside the map bounds', () => {
    const state = createMovementState(SECTOR_ZERO.halfSize - 5, 0);
    for (let i = 0; i < 600; i += 1) {
      stepMovement(state, { ...baseInput, forward: 0, right: 1, sprint: true }, world);
    }
    expect(state.x).toBeLessThanOrEqual(SECTOR_ZERO.halfSize);
  });

  it('never tunnels into a solid obstacle', () => {
    const building = SECTOR_ZERO.obstacles.find((o) => o.kind === 'building')!;
    const centerX = (building.box.minX + building.box.maxX) / 2;
    const centerZ = (building.box.minZ + building.box.maxZ) / 2;
    const state = createMovementState(centerX, centerZ - 30);
    for (let i = 0; i < 600; i += 1) {
      stepMovement(state, { ...baseInput, yaw: Math.PI, sprint: true }, world);
    }
    expect(world.isInsideSolid(state.x, 1, state.z)).toBe(false);
  });

  it('bounds the anti-cheat travel budget', () => {
    expect(maxLegalDistance(1 / 60)).toBeLessThan(MOVEMENT.sprintSpeed);
    expect(maxLegalDistance(10)).toBeLessThan(MOVEMENT.sprintSpeed * 0.25 + 2);
  });
});

describe('loot tables', () => {
  it('is deterministic for a given seed', () => {
    const a = rollContainer(ContainerType.MilitaryCrate, makeRng(1234));
    const b = rollContainer(ContainerType.MilitaryCrate, makeRng(1234));
    expect(a).toEqual(b);
  });

  it('always returns known item ids', () => {
    const rng = makeRng(7);
    for (const type of Object.values(ContainerType)) {
      if (type === ContainerType.Corpse) continue;
      for (let i = 0; i < 40; i += 1) {
        for (const entry of rollContainer(type, rng)) {
          expect(getItem(entry.itemId), `unknown item ${entry.itemId}`).toBeDefined();
          expect(entry.quantity).toBeGreaterThan(0);
        }
      }
    }
  });

  it('respects stack sizes', () => {
    const rng = makeRng(99);
    for (let i = 0; i < 200; i += 1) {
      for (const entry of rollContainer(ContainerType.CivilianCrate, rng)) {
        expect(entry.quantity).toBeLessThanOrEqual(getItem(entry.itemId)!.stackSize);
      }
    }
  });

  it('keeps civilian crates below rare on average and military crates above', () => {
    const rng = makeRng(2024);
    let civilianValue = 0;
    let militaryValue = 0;
    for (let i = 0; i < 400; i += 1) {
      civilianValue += lootValue(rollContainer(ContainerType.CivilianCrate, rng));
      militaryValue += lootValue(rollContainer(ContainerType.MilitaryCrate, rng));
    }
    expect(militaryValue).toBeGreaterThan(civilianValue * 2);
  });

  it('never rolls epic or legendary from a civilian crate', () => {
    const rng = makeRng(555);
    for (let i = 0; i < 500; i += 1) {
      for (const entry of rollContainer(ContainerType.CivilianCrate, rng)) {
        const rarity = getItem(entry.itemId)!.rarity;
        expect(rarity === Rarity.Epic || rarity === Rarity.Legendary).toBe(false);
      }
    }
  });

  it('scales rolls with risk and the global loot multiplier', () => {
    const low = rollContainer(ContainerType.MilitaryCrate, makeRng(4), { risk: RiskLevel.Low });
    const high = rollContainer(ContainerType.MilitaryCrate, makeRng(4), {
      risk: RiskLevel.VeryHigh,
      lootMultiplier: 2,
    });
    expect(high.length).toBeGreaterThanOrEqual(low.length);
  });

  it('only produces medical or electronics from a medical cabinet', () => {
    const rng = makeRng(11);
    for (let i = 0; i < 200; i += 1) {
      for (const entry of rollContainer(ContainerType.MedicalCabinet, rng)) {
        expect(['medical', 'electronics']).toContain(getItem(entry.itemId)!.category);
      }
    }
  });

  it('drops better loot from heavies than scavengers', () => {
    const rng = makeRng(31337);
    let scav = 0;
    let heavy = 0;
    for (let i = 0; i < 300; i += 1) {
      scav += lootValue(rollAILoot('scavenger', rng));
      heavy += lootValue(rollAILoot('heavy', rng));
    }
    expect(heavy).toBeGreaterThan(scav);
  });
});

describe('xp and levelling', () => {
  it('matches the designed curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(1000);
    expect(xpForLevel(3) - xpForLevel(2)).toBe(1500);
    expect(xpForLevel(4) - xpForLevel(3)).toBe(2200);
  });

  it('is monotonic and progressive', () => {
    for (let level = 2; level < 30; level += 1) {
      const stepA = xpForLevel(level) - xpForLevel(level - 1);
      const stepB = xpForLevel(level + 1) - xpForLevel(level);
      expect(stepB).toBeGreaterThan(stepA);
    }
  });

  it('maps xp back to a level', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(999)).toBe(1);
    expect(levelForXp(1000)).toBe(2);
    expect(levelForXp(2499)).toBe(2);
    expect(levelForXp(2500)).toBe(3);
  });

  it('reports progress inside the current level', () => {
    const progress = levelProgress(1750);
    expect(progress.level).toBe(2);
    expect(progress.xpIntoLevel).toBe(750);
    expect(progress.xpToNextLevel).toBe(750);
    expect(progress.progress).toBeCloseTo(0.5, 2);
  });

  it('awards raid xp only for loot that made it out', () => {
    const extracted = calculateRaidXp({
      extracted: true, playerKills: 1, aiKills: 4, extractedLootValue: 10_000, survivalSeconds: 300,
    });
    const died = calculateRaidXp({
      extracted: false, playerKills: 1, aiKills: 4, extractedLootValue: 10_000, survivalSeconds: 300,
    });
    expect(extracted.extraction).toBe(500);
    expect(extracted.playerKills).toBe(300);
    expect(extracted.aiKills).toBe(300);
    expect(extracted.lootValue).toBe(400);
    expect(died.extraction).toBe(0);
    expect(died.lootValue).toBe(0);
    expect(extracted.total).toBeGreaterThan(died.total);
  });

  it('applies the configured xp multiplier', () => {
    const base = calculateRaidXp({
      extracted: true, playerKills: 0, aiKills: 0, extractedLootValue: 0, survivalSeconds: 0,
    });
    const doubled = calculateRaidXp({
      extracted: true, playerKills: 0, aiKills: 0, extractedLootValue: 0, survivalSeconds: 0,
      xpMultiplier: 2,
    });
    expect(doubled.total).toBe(base.total * 2);
  });
});

describe('perks', () => {
  it('aggregates multipliers and offsets', () => {
    const mods = aggregatePerks(['runner', 'armored']);
    expect(mods.sprintSpeedMultiplier).toBeCloseTo(1.05, 5);
    expect(mods.startingArmorBonus).toBe(10);
    expect(mods.reloadSpeedMultiplier).toBe(1);
  });

  it('ignores unknown perk ids', () => {
    const mods = aggregatePerks(['nope', 'fast_hands']);
    expect(mods.reloadSpeedMultiplier).toBeCloseTo(1.1, 5);
  });
});

describe('market transactions', () => {
  it('sells for less than it buys', () => {
    expect(sellPrice('medical_kit')).toBeLessThan(buyPrice('medical_kit'));
  });

  it('rejects a purchase the player cannot afford', () => {
    const result = validatePurchase(100, 'ar12', 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('insufficient_credits');
    expect(result.creditsAfter).toBe(100);
  });

  it('never allows a negative balance', () => {
    const result = validatePurchase(11_800, 'ar12', 1);
    expect(result.ok).toBe(true);
    expect(result.creditsAfter).toBe(0);
    expect(validatePurchase(result.creditsAfter, 'ar12', 1).ok).toBe(false);
  });

  it('rejects invalid quantities', () => {
    expect(validatePurchase(999_999, 'bandage', 0).ok).toBe(false);
    expect(validatePurchase(999_999, 'bandage', -3).ok).toBe(false);
    expect(validatePurchase(999_999, 'bandage', 1.5).ok).toBe(false);
    expect(validatePurchase(999_999, 'bandage', 1000).ok).toBe(false);
  });

  it('rejects unknown items on both sides', () => {
    expect(validatePurchase(999_999, 'nope', 1).ok).toBe(false);
    expect(validateSale(0, 'nope', 1).ok).toBe(false);
  });

  it('credits the player for a sale', () => {
    const result = validateSale(500, 'gold_watch', 2);
    expect(result.ok).toBe(true);
    expect(result.creditsAfter).toBe(500 + result.totalPrice);
    expect(result.totalPrice).toBe(sellPrice('gold_watch', 2));
  });
});

describe('extraction eligibility', () => {
  const point = SECTOR_ZERO.extractions[0]!;

  it('accepts a live player standing in an assigned zone', () => {
    const result = checkExtractionEligibility({
      position: point.position,
      playerState: PlayerRaidState.Alive,
      phase: RaidPhase.Active,
      extractionPointId: point.id,
      assignedPointIds: [point.id],
      allPoints: SECTOR_ZERO.extractions,
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an extraction the player was not assigned', () => {
    const other = SECTOR_ZERO.extractions[1]!;
    const result = checkExtractionEligibility({
      position: other.position,
      playerState: PlayerRaidState.Alive,
      phase: RaidPhase.Active,
      extractionPointId: other.id,
      assignedPointIds: [point.id],
      allPoints: SECTOR_ZERO.extractions,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('not_assigned');
  });

  it('rejects a player outside the radius', () => {
    const result = checkExtractionEligibility({
      position: { x: point.position.x + point.radius + 5, y: 0, z: point.position.z },
      playerState: PlayerRaidState.Alive,
      phase: RaidPhase.Active,
      extractionPointId: point.id,
      assignedPointIds: [point.id],
      allPoints: SECTOR_ZERO.extractions,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('out_of_range');
  });

  it('rejects dead players and inactive matches', () => {
    expect(
      checkExtractionEligibility({
        position: point.position,
        playerState: PlayerRaidState.Dead,
        phase: RaidPhase.Active,
        extractionPointId: point.id,
        assignedPointIds: [point.id],
        allPoints: SECTOR_ZERO.extractions,
      }).reason,
    ).toBe('not_alive');

    expect(
      checkExtractionEligibility({
        position: point.position,
        playerState: PlayerRaidState.Alive,
        phase: RaidPhase.Countdown,
        extractionPointId: point.id,
        assignedPointIds: [point.id],
        allPoints: SECTOR_ZERO.extractions,
      }).reason,
    ).toBe('match_not_active');
  });

  it('completes after the configured hold time', () => {
    const attempt = { pointId: point.id, elapsed: 0 };
    const duration = DEFAULT_GAME_CONFIG.extractionTimeSeconds;
    let result = stepExtraction(attempt, duration - 0.5, duration);
    expect(result.completed).toBe(false);
    expect(result.progress).toBeGreaterThan(0.8);
    result = stepExtraction(attempt, 0.5, duration);
    expect(result.completed).toBe(true);
    expect(result.progress).toBe(1);
    expect(result.remainingSeconds).toBe(0);
  });
});

function mission(
  type: MissionType,
  target: number,
  params?: MissionDefinition['params'],
): MissionDefinition {
  return {
    id: `test_${type}`,
    name: 'TEST',
    description: '',
    type,
    target,
    xpReward: 0,
    creditReward: 0,
    requiredLevel: 1,
    singleRaid: false,
    ...(params ? { params } : {}),
  };
}

describe('mission progress', () => {
  const context = {
    extracted: true,
    aiKills: 3,
    playerKills: 1,
    extractedLootValue: 7_500,
    extractedItems: { encrypted_drive: 1 },
    visitedPoiIds: ['bunker', 'market_street'],
  };

  it('scores each mission type from a raid', () => {
    expect(raidProgressFor(mission(MissionType.KillAI, 5), context)).toBe(3);
    expect(raidProgressFor(mission(MissionType.KillPlayers, 1), context)).toBe(1);
    expect(raidProgressFor(mission(MissionType.Extract, 1), context)).toBe(1);
    expect(raidProgressFor(mission(MissionType.LootValue, 5_000), context)).toBe(7_500);
    expect(
      raidProgressFor(mission(MissionType.CollectItem, 1, { itemId: 'encrypted_drive' }), context),
    ).toBe(1);
    expect(
      raidProgressFor(mission(MissionType.VisitLocation, 1, { poiId: 'bunker' }), context),
    ).toBe(1);
    expect(
      raidProgressFor(mission(MissionType.VisitLocation, 1, { poiId: 'hospital' }), context),
    ).toBe(0);
  });

  it('awards nothing that requires extraction when the player died', () => {
    const died = { ...context, extracted: false, extractedLootValue: 0, extractedItems: {} };
    expect(raidProgressFor(mission(MissionType.Extract, 1), died)).toBe(0);
    expect(raidProgressFor(mission(MissionType.LootValue, 1), died)).toBe(0);
    // AI kills still count — they are not extraction-gated.
    expect(raidProgressFor(mission(MissionType.KillAI, 5), died)).toBe(3);
  });

  it('accumulates across raids and clamps at the target', () => {
    const rows: MissionProgress[] = [
      { missionId: 'cleanup', progress: 3, target: 5, completed: false, claimedAt: null, daily: false, resetKey: null },
    ];
    const updates = applyRaidToMissions(rows, context);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.progress).toBe(5);
    expect(updates[0]!.completed).toBe(true);
    expect(updates[0]!.justCompleted).toBe(true);
  });

  it('does not re-complete a finished mission', () => {
    const rows: MissionProgress[] = [
      { missionId: 'cleanup', progress: 5, target: 5, completed: true, claimedAt: null, daily: false, resetKey: null },
    ];
    expect(applyRaidToMissions(rows, context)).toHaveLength(0);
  });

  it('treats single-raid missions as a high-water mark, not a sum', () => {
    const rows: MissionProgress[] = [
      { missionId: 'scavenger_run', progress: 4_000, target: 5_000, completed: false, claimedAt: null, daily: false, resetKey: null },
    ];
    const updates = applyRaidToMissions(rows, { ...context, extractedLootValue: 4_500 });
    expect(updates[0]!.progress).toBe(4_500);
    expect(updates[0]!.completed).toBe(false);
  });
});

describe('safe spawns', () => {
  it('picks a distant point when others are occupied', () => {
    const rng = makeRng(5);
    const first = SECTOR_ZERO.playerSpawns[0]!;
    const chosen = pickSafeSpawn(SECTOR_ZERO.playerSpawns, [first.position], rng);
    const gap = Math.hypot(
      chosen.position.x - first.position.x,
      chosen.position.z - first.position.z,
    );
    expect(gap).toBeGreaterThan(60);
  });

  it('returns a spawn even when every point is crowded', () => {
    const rng = makeRng(6);
    const occupied = SECTOR_ZERO.playerSpawns.map((spawn) => spawn.position);
    expect(pickSafeSpawn(SECTOR_ZERO.playerSpawns, occupied, rng)).toBeDefined();
  });
});

describe('network message validation', () => {
  it('accepts a well-formed input frame', () => {
    const parsed = InputMessageSchema.safeParse({
      seq: 1, dt: 0.016, forward: 1, right: 0, yaw: 0.5, pitch: 0.1,
      sprint: false, crouch: false, ads: false, px: 1, py: 0, pz: 2,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects out-of-range axes, NaN and oversized deltas', () => {
    const base = {
      seq: 1, dt: 0.016, forward: 0, right: 0, yaw: 0, pitch: 0,
      sprint: false, crouch: false, ads: false, px: 0, py: 0, pz: 0,
    };
    expect(InputMessageSchema.safeParse({ ...base, forward: 40 }).success).toBe(false);
    expect(InputMessageSchema.safeParse({ ...base, dt: 5 }).success).toBe(false);
    expect(InputMessageSchema.safeParse({ ...base, px: Number.NaN }).success).toBe(false);
    expect(InputMessageSchema.safeParse({ ...base, yaw: Number.POSITIVE_INFINITY }).success).toBe(false);
    expect(InputMessageSchema.safeParse({ ...base, seq: -1 }).success).toBe(false);
    expect(InputMessageSchema.safeParse({ ...base, pitch: 3 }).success).toBe(false);
  });

  it('rejects malformed pickup requests', () => {
    expect(PickupMessageSchema.safeParse({ containerId: '', worldItemId: 'a' }).success).toBe(false);
    expect(PickupMessageSchema.safeParse({ containerId: 'c', worldItemId: 'w', x: -1, y: 0 }).success).toBe(false);
    expect(PickupMessageSchema.safeParse({ containerId: 'c', worldItemId: 'w', x: 2, y: 2 }).success).toBe(true);
  });

  it('defaults the map id on join', () => {
    const parsed = JoinOptionsSchema.parse({});
    expect(parsed.mapId).toBe('sector_zero');
  });
});
