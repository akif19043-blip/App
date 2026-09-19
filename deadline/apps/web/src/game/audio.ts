/**
 * Placeholder audio.
 *
 * Every sound is synthesised with the Web Audio API rather than loaded from a
 * file, so the game ships with no audio assets and cannot crash on a missing
 * one. `AudioBus.play` is a no-op when the context is unavailable or blocked,
 * which keeps autoplay policies from breaking the raid.
 *
 * Swapping in real assets later means implementing the same `play(event)` API
 * on top of an <audio>/AudioBuffer loader.
 */
export type SoundEvent =
  | 'gunshot'
  | 'gunshot_distant'
  | 'reload'
  | 'footstep'
  | 'loot_pickup'
  | 'container_open'
  | 'ui_click'
  | 'hit'
  | 'hitmarker'
  | 'death'
  | 'extraction'
  | 'extraction_complete'
  | 'alarm';

export class AudioBus {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;
  private volume = 0.6;
  private noiseBuffer: AudioBuffer | null = null;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.value = this.volume;
  }

  /** Must be called from a user gesture on browsers with autoplay policies. */
  resume(): void {
    try {
      this.ensureContext();
      void this.context?.resume();
    } catch {
      // Audio is a nicety; never let it break the game.
    }
  }

  play(event: SoundEvent, options: { distance?: number } = {}): void {
    if (!this.enabled) return;
    try {
      const context = this.ensureContext();
      if (!context || context.state === 'suspended') return;
      const attenuation = options.distance ? Math.max(0.05, 1 - options.distance / 90) : 1;
      switch (event) {
        case 'gunshot':
          this.noiseBurst(0.12, 1800, 0.55 * attenuation);
          this.tone(110, 0.08, 0.2 * attenuation, 'square');
          break;
        case 'gunshot_distant':
          this.noiseBurst(0.22, 700, 0.18 * attenuation);
          break;
        case 'reload':
          this.tone(320, 0.05, 0.16, 'square');
          window.setTimeout(() => this.tone(220, 0.07, 0.14, 'square'), 140);
          break;
        case 'footstep':
          this.noiseBurst(0.05, 500, 0.08 * attenuation);
          break;
        case 'loot_pickup':
          this.tone(660, 0.07, 0.16, 'triangle');
          window.setTimeout(() => this.tone(880, 0.08, 0.13, 'triangle'), 60);
          break;
        case 'container_open':
          this.noiseBurst(0.18, 900, 0.14);
          break;
        case 'ui_click':
          this.tone(520, 0.035, 0.1, 'square');
          break;
        case 'hit':
          this.noiseBurst(0.08, 420, 0.3);
          this.tone(90, 0.12, 0.22, 'sawtooth');
          break;
        case 'hitmarker':
          this.tone(1200, 0.04, 0.12, 'square');
          break;
        case 'death':
          this.tone(150, 0.6, 0.3, 'sawtooth', 40);
          break;
        case 'extraction':
          this.tone(440, 0.1, 0.12, 'sine');
          break;
        case 'extraction_complete':
          [523, 659, 784].forEach((frequency, index) => {
            window.setTimeout(() => this.tone(frequency, 0.16, 0.16, 'sine'), index * 120);
          });
          break;
        case 'alarm':
          this.tone(680, 0.45, 0.18, 'sawtooth', 420);
          break;
        default:
          break;
      }
    } catch {
      // Ignore: audio must never throw into the render loop.
    }
  }

  dispose(): void {
    void this.context?.close();
    this.context = null;
    this.master = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    if (typeof window === 'undefined') return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.context = new Ctor();
    this.master = this.context.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.context.destination);
    return this.context;
  }

  private tone(
    frequency: number,
    duration: number,
    gain: number,
    type: OscillatorType,
    endFrequency?: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    if (endFrequency !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(20, endFrequency),
        context.currentTime + duration,
      );
    }
    envelope.gain.setValueAtTime(gain, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    oscillator.connect(envelope);
    envelope.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  private noiseBurst(duration: number, filterFrequency: number, gain: number): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    if (!this.noiseBuffer) {
      const length = context.sampleRate * 0.5;
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buffer;
    }
    const source = context.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(gain, context.currentTime);
    envelope.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(master);
    source.start();
    source.stop(context.currentTime + duration);
  }
}

export const audioBus = new AudioBus();
