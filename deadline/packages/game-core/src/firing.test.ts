import { describe, expect, it } from 'vitest';
import { requireWeaponDefinition, shotIntervalSeconds } from '@deadline/shared';
import { createTriggerState, pullTrigger } from './firing.js';

const pistol = requireWeaponDefinition('pm9'); // semi-automatic, 400 RPM
const rifle = requireWeaponDefinition('ar12'); // automatic, 600 RPM

describe('trigger gating', () => {
  it('fires a semi-automatic weapon once per trigger pull', () => {
    const state = createTriggerState();
    let now = 1_000;

    expect(pullTrigger(state, { weapon: pistol, firing: true, now })).toBe(true);

    // Holding the button down must not fire again, however long we wait.
    for (let i = 0; i < 20; i += 1) {
      now += 100;
      expect(pullTrigger(state, { weapon: pistol, firing: true, now })).toBe(false);
    }

    // Release and pull again: that is a new shot.
    now += 50;
    expect(pullTrigger(state, { weapon: pistol, firing: false, now })).toBe(false);
    now += 50;
    expect(pullTrigger(state, { weapon: pistol, firing: true, now })).toBe(true);
  });

  it('keeps firing an automatic weapon while the trigger is held', () => {
    const state = createTriggerState();
    const interval = shotIntervalSeconds(rifle) * 1000;
    let now = 1_000;
    let shots = 0;

    for (let i = 0; i < 40; i += 1) {
      if (pullTrigger(state, { weapon: rifle, firing: true, now })) shots += 1;
      now += interval / 2; // poll twice per cycle, like a 120 Hz frame loop
    }
    // Half the polls fall inside the cooldown, so roughly half should fire.
    expect(shots).toBeGreaterThan(15);
    expect(shots).toBeLessThanOrEqual(21);
  });

  it('never exceeds the weapon cyclic rate', () => {
    const state = createTriggerState();
    const interval = shotIntervalSeconds(rifle) * 1000;
    let now = 1_000;
    let shots = 0;

    // Poll every millisecond for one second: at 600 RPM that is 10 shots.
    for (let i = 0; i < 1_000; i += 1) {
      if (pullTrigger(state, { weapon: rifle, firing: true, now })) shots += 1;
      now += 1;
    }
    expect(shots).toBeLessThanOrEqual(Math.ceil(1_000 / interval) + 1);
    expect(shots).toBeGreaterThanOrEqual(Math.floor(1_000 / interval));
  });

  it('resets the recoil ramp after the trigger has been released for a beat', () => {
    const state = createTriggerState();
    let now = 1_000;
    for (let i = 0; i < 6; i += 1) {
      pullTrigger(state, { weapon: rifle, firing: true, now });
      now += 110;
    }
    expect(state.consecutiveShots).toBeGreaterThan(1);

    pullTrigger(state, { weapon: rifle, firing: false, now });
    expect(state.consecutiveShots).toBeGreaterThan(1); // too soon to reset

    now += 500;
    pullTrigger(state, { weapon: rifle, firing: false, now });
    expect(state.consecutiveShots).toBe(0);
  });

  it('fires on the very first frame the trigger is pulled', () => {
    const state = createTriggerState();
    expect(pullTrigger(state, { weapon: rifle, firing: true, now: 0 })).toBe(true);
  });
});
