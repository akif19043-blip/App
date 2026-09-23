import './assets/fonts/fonts.css';
import './style.css';
import spriteManifest from 'virtual:sprite-manifest';
import { Synth } from './audio/synth';
import { Camera } from './engine/camera';
import { Input } from './engine/input';
import { GameLoop } from './engine/loop';
import { StateMachine } from './engine/stateMachine';
import { type MetaId } from './game/meta';
import { type SaveData, buyMeta, loadSave, recordRun, writeSave } from './game/save';
import { type Card, rollCards } from './game/upgrades';
import { World, type WorldEvents } from './game/world';
import { AssetLoader } from './render/assets';
import { Renderer } from './render/renderer';
import { Hud } from './ui/hud';
import { Screens } from './ui/screens';
import { WEAPON_IDS, type WeaponId } from './weapons/defs';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

/** Wires the simulation, renderer, audio, input and UI together. */
class App {
  private readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  private readonly uiRoot = document.getElementById('ui') as HTMLDivElement;
  private readonly assets = new AssetLoader();
  private readonly renderer = new Renderer(this.canvas, this.assets);
  private readonly input = new Input(this.canvas);
  private readonly synth = new Synth();
  private readonly camera = new Camera();
  private readonly hud = new Hud(this.uiRoot);
  private readonly screens = new Screens(this.uiRoot);
  private readonly sm = new StateMachine('menu');
  private readonly save: SaveData = loadSave(storage);
  private readonly loop = new GameLoop((dt) => this.update(dt), (a, dt) => this.render(a, dt));
  private world: World | null = null;
  private cards: Card[] = [];
  private startWeapon: WeaponId = 'wand';
  private debug = false;
  private clock = 0;
  private endDelay = 0;
  private readonly events: WorldEvents = {
    sfx: (name, intensity) => this.synth.play(name, intensity),
    shake: (amount) => this.camera.shake(amount),
    announce: (t, s, c) => this.hud.announce(t, s, c),
  };

  constructor() {
    this.synth.setSfx(this.save.settings.sfx);
    this.synth.setMusic(this.save.settings.music);
    this.screens.onClickSound = () => this.synth.play('click');
    this.screens.onHoverSound = () => this.synth.play('hover');

    // Optional PNG art from public/assets/sprites replaces the procedural look.
    void this.assets.load(spriteManifest).then(({ loaded, failed }) => {
      if (loaded.length) console.info(`[assets] sprites: ${loaded.join(', ')}`);
      if (failed.length) console.warn(`[assets] failed: ${failed.join(', ')}`);
    });
    // Canvas text only uses a web font once it has loaded, so warm it up.
    void document.fonts?.load('700 16px "Chakra Petch"').catch(() => {});
    this.hud.pauseBtn.addEventListener('click', () => this.pause());

    this.sm
      .on('menu', { enter: () => this.showMenu() })
      .on('shop', { enter: () => this.showShop() })
      .on('playing', {
        enter: () => {
          this.screens.hide();
          this.hud.show(true);
          this.synth.intensity = 1;
        },
      })
      .on('levelup', { enter: () => this.showLevelUp() })
      .on('paused', { enter: () => this.showPause() })
      .on('gameover', { enter: () => this.showEnd(false) })
      .on('victory', { enter: () => this.showEnd(true) });

    // Audio can only start after a user gesture.
    const unlock = () => {
      this.synth.unlock();
      this.synth.startMusic();
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pause();
      this.synth.suspend(document.hidden);
    });
    this.resize();
    this.showMenu();
    this.loop.start();
  }

  private resize(): void {
    this.renderer.resize();
    this.camera.zoom = this.renderer.zoomFor();
    this.camera.viewW = this.renderer.width / this.camera.zoom;
    this.camera.viewH = this.renderer.height / this.camera.zoom;
  }

  private persist(): void {
    writeSave(storage, this.save);
  }

  // ---------------------------------------------------------------- flow

  private newRun(): void {
    this.world = new World(this.events, this.save.meta, undefined, this.startWeapon);
    this.cards = [];
    this.endDelay = 0;
    this.hud.reset();
    this.camera.x = this.world.player.x;
    this.camera.y = this.world.player.y;
    this.input.releaseJoy();
    const stress = Number(new URLSearchParams(location.search).get('stress'));
    if (stress > 0) this.world.stressTest(Math.min(stress, 2500));
    this.sm.go('playing');
    this.hud.announce('SURVIVE', 'Weapons fire automatically — just move', '#5ef2ff');
  }

  private pause(): void {
    if (this.sm.state === 'playing' && this.world?.status === 'running') this.sm.go('paused');
  }

  private toMenu(): void {
    this.world = null;
    this.hud.show(false);
    this.synth.intensity = 0;
    this.sm.go('menu');
  }

  private toggleSetting(key: string): void {
    const s = this.save.settings;
    if (key === 'sfx') this.synth.setSfx((s.sfx = !s.sfx));
    else if (key === 'music') this.synth.setMusic((s.music = !s.music));
    else if (key === 'shake') s.shake = !s.shake;
    this.persist();
  }

  private showMenu(): void {
    this.hud.show(false);
    this.screens.menu(this.save, this.startWeapon, {
      play: () => this.newRun(),
      shop: () => this.sm.go('shop'),
      toggle: (k) => {
        this.toggleSetting(k);
        this.showMenu();
      },
      weapon: (id) => {
        if ((WEAPON_IDS as string[]).includes(id)) this.startWeapon = id as WeaponId;
        this.showMenu();
      },
    });
  }

  private showShop(feedback?: { id: MetaId; ok: boolean }): void {
    this.screens.shop(this.save, {
      buy: (id) => {
        const ok = buyMeta(this.save, id as MetaId);
        this.synth.play(ok ? 'buy' : 'denied');
        if (ok) this.persist();
        this.showShop({ id: id as MetaId, ok });
      },
      back: () => this.sm.go('menu'),
    }, feedback);
  }

  private showLevelUp(): void {
    const w = this.world!;
    this.input.releaseJoy();
    this.cards = rollCards(w.loadout(), w.rng);
    this.screens.levelUp(this.cards, w, {
      pick: (i) => this.pickCard(Number(i)),
      reroll: () => {
        if (w.rerolls <= 0) return;
        w.rerolls--;
        this.synth.play('select');
        this.showLevelUp();
      },
    });
  }

  private pickCard(i: number): void {
    const w = this.world;
    const card = this.cards[i];
    if (!w || !card || this.sm.state !== 'levelup') return;
    w.applyCard(card);
    if (w.pendingLevelUps > 0) this.sm.go('levelup');
    else this.sm.go('playing');
  }

  private showPause(): void {
    this.input.releaseJoy();
    this.screens.pause(this.world!, this.save, {
      resume: () => this.sm.go('playing'),
      quit: () => {
        // Quitting still banks the gold you picked up.
        this.bankRun(false);
        this.toMenu();
      },
      toggle: (k) => {
        this.toggleSetting(k);
        this.showPause();
      },
    });
  }

  private lastRecord = { score: 0, records: { score: false, time: false, kills: false, level: false } };

  private bankRun(victory: boolean): void {
    const w = this.world!;
    this.lastRecord = recordRun(this.save, { time: w.time, kills: w.kills, level: w.level, gold: w.gold, victory });
    this.persist();
  }

  private showEnd(victory: boolean): void {
    const w = this.world!;
    this.bankRun(victory);
    this.hud.show(false);
    this.synth.intensity = 0;
    this.screens.end(w, victory, this.lastRecord.score, this.lastRecord.records, this.save, {
      retry: () => this.newRun(),
      menu: () => this.toMenu(),
    });
  }

  // ---------------------------------------------------------------- loop

  private handleKeys(): void {
    for (const code of this.input.consumePresses()) {
      const st = this.sm.state;
      if (code === 'F3') this.debug = !this.debug;
      if (code === 'KeyM') this.toggleSetting('music');
      if (code === 'Escape' || code === 'KeyP') {
        if (st === 'playing') this.pause();
        else if (st === 'paused') this.sm.go('playing');
        else if (st === 'shop') this.sm.go('menu');
      }
      if (st === 'levelup') {
        const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(code.replace('Numpad', 'Digit'));
        if (idx >= 0) this.screens.trigger('pick', String(idx));
        if (code === 'KeyR') this.screens.trigger('reroll');
      }
      if (code === 'Enter' || code === 'Space') {
        if (st === 'menu') this.screens.trigger('play');
        else if (st === 'gameover' || st === 'victory') this.screens.trigger('retry');
      }
    }
  }

  private update(dt: number): void {
    this.handleKeys();
    const w = this.world;
    this.camera.update(dt, this.save.settings.shake);
    if (!w) return;
    if (this.sm.state === 'playing') {
      this.input.axis(w.moveInput);
      w.viewW = this.camera.viewW;
      w.viewH = this.camera.viewH;
      w.update(dt);
      if (w.status === 'running' && w.pendingLevelUps > 0) {
        this.synth.play('levelup');
        this.sm.go('levelup');
      } else if (w.status === 'won') {
        this.sm.go('victory');
      } else if (w.status === 'dead') {
        // Let the death explosion play before the results screen.
        w.tickEffects(dt);
        this.endDelay += dt;
        if (this.endDelay > 1.6) this.sm.go('gameover');
      }
    } else if (this.sm.state === 'gameover' || this.sm.state === 'victory') {
      w.tickEffects(dt);
    }
  }

  private render(alpha: number, frameDt: number): void {
    this.clock += frameDt;
    const w = this.world;
    const cam = this.camera;
    if (w) {
      // Lock the camera to the interpolated player position for smooth motion.
      const p = w.player;
      const a = this.sm.state === 'playing' && w.status === 'running' ? alpha : 1;
      cam.x = p.px + (p.x - p.px) * a;
      cam.y = p.py + (p.y - p.py) * a;
      this.hud.update(w, frameDt);
    } else {
      cam.x = 0;
      cam.y = 0;
      if (this.sm.state === 'menu' || this.sm.state === 'shop') cam.update(0, false);
    }
    const running = this.sm.state === 'playing' && w?.status === 'running';
    const debug = this.debug
      ? `FPS ${this.loop.fps.toFixed(0)}\nentities ${w ? w.entityCount() : 0}\nenemies ${w?.enemies.count ?? 0}  projectiles ${w?.projectiles.count ?? 0}\nparticles ${w?.particles.count ?? 0}  pickups ${w?.pickups.count ?? 0}`
      : null;
    this.renderer.render(w, cam, running ? alpha : 1, this.clock, debug);
  }
}

const app = new App();
// Handy for debugging and automated play-testing in development builds.
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;
