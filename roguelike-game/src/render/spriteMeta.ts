/**
 * Sprite metadata: how a PNG (single image or spritesheet) should be sliced,
 * sized, animated and oriented. Pure functions only, so it is unit-testable.
 *
 * Every PNG may have an optional sidecar JSON with the same name
 * (e.g. `enemies/swarmer.png` + `enemies/swarmer.json`) holding a SpriteMeta.
 */

/**
 * How the sprite is oriented at draw time:
 * - `face`: rotate to the direction of travel (top-down art).
 * - `flip`: mirror horizontally when moving left (side-view pixel art).
 * - `spin`: rotate continuously.
 * - `none`: always drawn upright.
 */
export type SpriteRotation = 'face' | 'flip' | 'spin' | 'none';

export interface SpriteMeta {
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  /** Animation speed in frames per second. */
  fps?: number;
  /** Multiplier on the size the game would otherwise draw the sprite at. */
  scale?: number;
  rotation?: SpriteRotation;
  /** Direction the artwork faces, in degrees (0 = right, -90 = up). */
  angle?: number;
  /** Nearest-neighbour scaling for pixel art. Defaults to true for frames <= 64 px. */
  pixelated?: boolean;
}

export interface SpriteManifestEntry {
  /** URL relative to the page (no leading slash so any base path works). */
  url: string;
  meta?: SpriteMeta;
}

/** key (e.g. "enemies/swarmer") -> entry */
export type SpriteManifest = Record<string, SpriteManifestEntry>;

export interface ResolvedSpriteMeta {
  frameW: number;
  frameH: number;
  frames: number;
  cols: number;
  fps: number;
  scale: number;
  rotation: SpriteRotation;
  /** Artwork facing in radians. */
  angle: number;
  pixelated: boolean;
}

/** Sprite keys the game looks for, with their default orientation. */
export const SPRITE_KEYS = {
  'player/player': 'face',
  'enemies/swarmer': 'flip',
  'enemies/grunt': 'flip',
  'enemies/tank': 'flip',
  'enemies/spitter': 'flip',
  'enemies/elite': 'flip',
  'enemies/boss': 'flip',
  'weapons/wand': 'face',
  'weapons/dagger': 'spin',
  'weapons/orb': 'spin',
  'weapons/enemy-bullet': 'none',
  'effects/explosion': 'none',
  'effects/gem': 'none',
} as const satisfies Record<string, SpriteRotation>;

export type SpriteKey = keyof typeof SPRITE_KEYS;

const posInt = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : undefined;
const posNum = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined;
const ROTATIONS: readonly SpriteRotation[] = ['face', 'flip', 'spin', 'none'];

/**
 * Works out frame layout for an image of `imgW` x `imgH` pixels.
 * Without explicit frame sizes, a horizontal strip of square frames
 * (width an exact multiple >= 2 of the height) is detected automatically.
 */
export function resolveSpriteMeta(
  key: string, imgW: number, imgH: number, meta: SpriteMeta = {},
): ResolvedSpriteMeta {
  let frameW = posInt(meta.frameWidth);
  let frameH = posInt(meta.frameHeight);
  if (!frameW && !frameH) {
    const strip = imgH > 0 && imgW >= imgH * 2 && imgW % imgH === 0;
    frameW = strip ? imgH : imgW;
    frameH = imgH;
  } else {
    frameW = Math.min(frameW ?? frameH!, imgW);
    frameH = Math.min(frameH ?? frameW, imgH);
  }
  frameW = Math.max(1, frameW);
  frameH = Math.max(1, frameH);
  const cols = Math.max(1, Math.floor(imgW / frameW));
  const rows = Math.max(1, Math.floor(imgH / frameH));
  const frames = Math.min(posInt(meta.frames) ?? cols * rows, cols * rows);
  const fallbackRotation = (SPRITE_KEYS as Record<string, SpriteRotation>)[key] ?? 'none';
  return {
    frameW,
    frameH,
    frames,
    cols,
    fps: posNum(meta.fps) ?? 10,
    scale: posNum(meta.scale) ?? 1,
    rotation: meta.rotation && ROTATIONS.includes(meta.rotation) ? meta.rotation : fallbackRotation,
    angle: ((typeof meta.angle === 'number' && Number.isFinite(meta.angle) ? meta.angle : 0) * Math.PI) / 180,
    pixelated: typeof meta.pixelated === 'boolean' ? meta.pixelated : Math.max(frameW, frameH) <= 64,
  };
}

/** Frame index for animation time `t` (seconds) with a per-entity phase offset. */
export function frameAt(m: Pick<ResolvedSpriteMeta, 'frames' | 'fps'>, t: number, phase = 0): number {
  if (m.frames <= 1) return 0;
  const f = Math.floor(t * m.fps + phase) % m.frames;
  return f < 0 ? f + m.frames : f;
}
