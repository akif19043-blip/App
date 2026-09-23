import { type ResolvedSpriteMeta, type SpriteKey, type SpriteManifest, resolveSpriteMeta } from './spriteMeta';

/**
 * A drawable sprite or spritesheet. Loaded PNGs and the procedural
 * fallback art both produce this shape, so the renderer has one code path.
 */
export interface SheetSprite extends ResolvedSpriteMeta {
  image: CanvasImageSource;
  /** White silhouette of `image` for hit flashes. */
  flash: CanvasImageSource;
  /**
   * Size in world units of the frame's longest side. Procedural sprites set
   * it; loaded PNGs leave it undefined and are fitted to the entity instead.
   */
  worldSize?: number;
}

/** Builds a white silhouette of an image (used for hit flashes). */
export function makeSilhouette(img: CanvasImageSource, w: number, h: number, color = '#ffffff'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  return c;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

/**
 * Loads user-supplied PNG sprites / spritesheets listed in the manifest
 * (generated from `public/assets/sprites` at build time). Missing or broken
 * files are simply skipped: the renderer then falls back to procedural art.
 */
export class AssetLoader {
  private readonly sprites = new Map<string, SheetSprite>();
  private readonly listeners: Array<() => void> = [];

  constructor(private readonly load_ = loadImage) {}

  get count(): number {
    return this.sprites.size;
  }

  get(key: SpriteKey): SheetSprite | undefined {
    return this.sprites.get(key);
  }

  has(key: SpriteKey): boolean {
    return this.sprites.has(key);
  }

  keys(): string[] {
    return [...this.sprites.keys()];
  }

  /** Called whenever sprites finish loading (the renderer rebuilds caches). */
  onChange(fn: () => void): void {
    this.listeners.push(fn);
  }

  async load(manifest: SpriteManifest): Promise<{ loaded: string[]; failed: string[] }> {
    const loaded: string[] = [];
    const failed: string[] = [];
    await Promise.all(
      Object.entries(manifest).map(async ([key, entry]) => {
        try {
          const img = await this.load_(entry.url);
          const meta = resolveSpriteMeta(key, img.naturalWidth, img.naturalHeight, entry.meta);
          this.sprites.set(key, {
            ...meta,
            image: img,
            flash: makeSilhouette(img, img.naturalWidth, img.naturalHeight),
          });
          loaded.push(key);
        } catch (err) {
          console.warn(`[assets] ${(err as Error).message}; using procedural art for "${key}"`);
          failed.push(key);
        }
      }),
    );
    if (loaded.length) for (const fn of this.listeners) fn();
    return { loaded: loaded.sort(), failed: failed.sort() };
  }
}
