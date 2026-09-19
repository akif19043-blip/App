import type * as THREE from 'three';

/**
 * Adaptive render quality.
 *
 * Browser hardware ranges from a discrete GPU to a software rasteriser. Rather
 * than guessing, the client measures its own frame rate and steps the quality
 * down (and back up) until it holds the target. Each tier only changes settings
 * that are safe to toggle at runtime — resolution scale, shadows, weather —
 * never anything gameplay-visible.
 */
export type QualityTier = 'high' | 'medium' | 'low';

export interface QualityProfile {
  readonly tier: QualityTier;
  readonly pixelRatioCap: number;
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Fraction of the full rain particle budget to draw. */
  readonly weatherDensity: number;
}

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  high: { tier: 'high', pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, weatherDensity: 1 },
  medium: { tier: 'medium', pixelRatioCap: 1, shadows: true, shadowMapSize: 1024, weatherDensity: 0.6 },
  low: { tier: 'low', pixelRatioCap: 0.75, shadows: false, shadowMapSize: 512, weatherDensity: 0.25 },
};

const ORDER: readonly QualityTier[] = ['low', 'medium', 'high'];

export interface QualityHooks {
  onWeatherDensity(density: number): void;
}

export class AdaptiveQuality {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly sun: THREE.DirectionalLight;
  private readonly hooks: QualityHooks;
  private tier: QualityTier;
  private sampleWindow = 0;
  private sampleFrames = 0;
  private cooldown = 0;

  /** Frame rate we try to keep. */
  private readonly targetFps = 50;
  /** Below this we step down immediately. */
  private readonly floorFps = 32;

  constructor(
    renderer: THREE.WebGLRenderer,
    sun: THREE.DirectionalLight,
    hooks: QualityHooks,
    initial: QualityTier = 'high',
  ) {
    this.renderer = renderer;
    this.sun = sun;
    this.hooks = hooks;
    this.tier = initial;
    this.apply(QUALITY_PROFILES[initial]);
  }

  get current(): QualityTier {
    return this.tier;
  }

  /** Feed one frame. Returns the tier in effect afterwards. */
  update(dt: number): QualityTier {
    this.sampleWindow += dt;
    this.sampleFrames += 1;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.sampleWindow < 2) return this.tier;

    const fps = this.sampleFrames / this.sampleWindow;
    this.sampleWindow = 0;
    this.sampleFrames = 0;
    if (this.cooldown > 0) return this.tier;

    const index = ORDER.indexOf(this.tier);
    if (fps < this.floorFps && index > 0) {
      this.set(ORDER[index - 1] as QualityTier);
    } else if (fps > this.targetFps + 18 && index < ORDER.length - 1) {
      this.set(ORDER[index + 1] as QualityTier);
    }
    return this.tier;
  }

  set(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.cooldown = 6;
    this.apply(QUALITY_PROFILES[tier]);
  }

  private apply(profile: QualityProfile): void {
    const ratio = Math.min(
      typeof window === 'undefined' ? 1 : window.devicePixelRatio,
      profile.pixelRatioCap,
    );
    this.renderer.setPixelRatio(ratio);
    this.renderer.shadowMap.enabled = profile.shadows;
    this.sun.castShadow = profile.shadows;
    if (profile.shadows) {
      this.sun.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.hooks.onWeatherDensity(profile.weatherDensity);
  }
}
