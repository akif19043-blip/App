import { describe, expect, it } from 'vitest';
import { frameAt, resolveSpriteMeta } from '../src/render/spriteMeta';

describe('resolveSpriteMeta', () => {
  it('treats a single image as one frame', () => {
    const m = resolveSpriteMeta('enemies/tank', 48, 40);
    expect(m).toMatchObject({ frameW: 48, frameH: 40, frames: 1, cols: 1, fps: 10, scale: 1, pixelated: true });
  });

  it('auto-detects a horizontal strip of square frames', () => {
    const m = resolveSpriteMeta('effects/explosion', 192, 32);
    expect(m).toMatchObject({ frameW: 32, frameH: 32, frames: 6, cols: 6 });
    // Not an exact multiple: stays a single frame.
    expect(resolveSpriteMeta('x/y', 100, 32).frames).toBe(1);
  });

  it('honours explicit grid layouts and frame counts', () => {
    const m = resolveSpriteMeta('enemies/boss', 256, 128, { frameWidth: 64, frameHeight: 64, frames: 7, fps: 12 });
    expect(m).toMatchObject({ frameW: 64, frameH: 64, cols: 4, frames: 7, fps: 12 });
    // Frame count can't exceed what fits in the image.
    expect(resolveSpriteMeta('enemies/boss', 128, 64, { frameWidth: 64, frames: 99 }).frames).toBe(2);
  });

  it('picks the default orientation per sprite key', () => {
    expect(resolveSpriteMeta('player/player', 32, 32).rotation).toBe('face');
    expect(resolveSpriteMeta('enemies/swarmer', 32, 32).rotation).toBe('flip');
    expect(resolveSpriteMeta('weapons/orb', 32, 32).rotation).toBe('spin');
    expect(resolveSpriteMeta('unknown/thing', 32, 32).rotation).toBe('none');
    expect(resolveSpriteMeta('enemies/swarmer', 32, 32, { rotation: 'face' }).rotation).toBe('face');
  });

  it('converts angles and defaults pixelation by frame size', () => {
    expect(resolveSpriteMeta('player/player', 64, 64, { angle: -90 }).angle).toBeCloseTo(-Math.PI / 2);
    expect(resolveSpriteMeta('player/player', 128, 128).pixelated).toBe(false);
    expect(resolveSpriteMeta('player/player', 128, 128, { pixelated: true }).pixelated).toBe(true);
  });

  it('ignores garbage metadata', () => {
    const m = resolveSpriteMeta('enemies/grunt', 64, 16, {
      frameWidth: -5, fps: Number.NaN, scale: 0, rotation: 'sideways' as never, angle: Infinity,
    } as never);
    expect(m).toMatchObject({ frameW: 16, frames: 4, fps: 10, scale: 1, rotation: 'flip', angle: 0 });
  });
});

describe('frameAt', () => {
  it('loops through frames at the given fps with a phase offset', () => {
    const m = { frames: 4, fps: 10 };
    expect(frameAt(m, 0)).toBe(0);
    expect(frameAt(m, 0.1)).toBe(1);
    expect(frameAt(m, 0.45)).toBe(0);
    expect(frameAt(m, 0, 2)).toBe(2);
    expect(frameAt({ frames: 1, fps: 10 }, 123)).toBe(0);
    expect(frameAt(m, -0.1)).toBe(3);
  });
});
