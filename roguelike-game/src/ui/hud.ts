import { xpProgress } from '../game/progression';
import { PASSIVES } from '../game/upgrades';
import { WaveDirector } from '../game/waves';
import { type World } from '../game/world';
import { MAX_WEAPONS, MAX_WEAPON_LEVEL, SYNERGIES, WEAPONS } from '../weapons/defs';

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * In-game heads-up display. DOM writes are diffed against cached values so
 * a 60 FPS update costs next to nothing when nothing changed.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly level: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLDivElement;
  private readonly timer: HTMLDivElement;
  private readonly wave: HTMLDivElement;
  private readonly kills: HTMLSpanElement;
  private readonly gold: HTMLSpanElement;
  private readonly slots: HTMLDivElement;
  private readonly passives: HTMLDivElement;
  private readonly synergies: HTMLDivElement;
  private readonly bossWrap: HTMLDivElement;
  private readonly bossName: HTMLDivElement;
  private readonly bossFill: HTMLDivElement;
  private readonly banner: HTMLDivElement;
  readonly pauseBtn: HTMLButtonElement;
  private readonly cache = new Map<string, string | number>();
  private bannerTimer = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    const xp = el('div', 'xpbar', this.root);
    this.xpFill = el('div', 'xpfill', xp);
    this.level = el('div', 'xplevel', xp);

    const left = el('div', 'hud-left', this.root);
    const hp = el('div', 'hpbar', left);
    this.hpFill = el('div', 'hpfill', hp);
    this.hpText = el('div', 'hptext', hp);
    this.slots = el('div', 'slots', left);
    this.passives = el('div', 'passives', left);
    this.synergies = el('div', 'synergies', left);

    const center = el('div', 'hud-center', this.root);
    this.timer = el('div', 'timer', center);
    this.wave = el('div', 'wave', center);
    this.bossWrap = el('div', 'bossbar hidden', center);
    this.bossName = el('div', 'bossname', this.bossWrap);
    const bb = el('div', 'bosstrack', this.bossWrap);
    this.bossFill = el('div', 'bossfill', bb);

    const right = el('div', 'hud-right', this.root);
    const k = el('div', 'stat', right);
    k.innerHTML = '<span class="ico">☠</span>';
    this.kills = el('span', '', k);
    const g = el('div', 'stat gold', right);
    g.innerHTML = '<span class="ico">¤</span>';
    this.gold = el('span', '', g);
    this.pauseBtn = el('button', 'pausebtn', right);
    this.pauseBtn.textContent = 'Ⅱ';
    this.pauseBtn.setAttribute('aria-label', 'Pause');

    this.banner = el('div', 'banner', parent);
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  private set(key: string, value: string | number, apply: () => void): void {
    if (this.cache.get(key) === value) return;
    this.cache.set(key, value);
    apply();
  }

  reset(): void {
    this.cache.clear();
    this.banner.classList.remove('on');
  }

  update(w: World, dt: number): void {
    const prog = xpProgress(w.xp);
    this.set('xp', Math.round(prog * 400), () => { this.xpFill.style.transform = `scaleX(${prog})`; });
    this.set('lvl', w.level, () => { this.level.textContent = `LV ${w.level}`; });
    const hp = Math.max(0, Math.ceil(w.player.hp));
    const max = Math.round(w.stats.maxHp);
    this.set('hp', `${hp}/${max}`, () => {
      this.hpFill.style.transform = `scaleX(${hp / max})`;
      this.hpText.textContent = `${hp} / ${max}`;
      this.hpFill.classList.toggle('low', hp / max < 0.3);
    });
    this.set('time', Math.floor(w.time), () => { this.timer.textContent = formatTime(w.time); });
    this.set('wave', WaveDirector.waveAt(w.time), () => { this.wave.textContent = `WAVE ${WaveDirector.waveAt(w.time)}`; });
    this.set('kills', w.kills, () => { this.kills.textContent = String(w.kills); });
    this.set('gold', w.gold, () => { this.gold.textContent = String(w.gold); });

    const slotsKey = w.weapons.map((x) => `${x.id}${x.level}`).join(',');
    this.set('slots', slotsKey, () => {
      let html = '';
      for (let i = 0; i < MAX_WEAPONS; i++) {
        const wi = w.weapons[i];
        if (!wi) {
          html += '<div class="slot empty"></div>';
          continue;
        }
        const d = WEAPONS[wi.id];
        const max = wi.level >= MAX_WEAPON_LEVEL;
        html += `<div class="slot${max ? ' max' : ''}" style="--c:${d.color}" title="${d.name}">` +
          `<span class="glyph">${d.icon}</span><span class="lv">${max ? 'MAX' : wi.level}</span></div>`;
      }
      this.slots.innerHTML = html;
    });
    const pasKey = JSON.stringify(w.passives);
    this.set('passives', pasKey, () => {
      this.passives.innerHTML = PASSIVES.filter((p) => w.passives[p.id])
        .map((p) => `<div class="pas" title="${p.name}">${p.icon}<b>${w.passives[p.id]}</b></div>`)
        .join('');
    });
    const synKey = [...w.synergies].join(',');
    this.set('syn', synKey, () => {
      this.synergies.innerHTML = SYNERGIES.filter((s) => w.synergies.has(s.id))
        .map((s) => `<div class="syn" title="${s.desc}">⚡ ${s.name}</div>`)
        .join('');
    });

    const boss = w.bosses.find((b) => b.active);
    this.set('boss', boss ? boss.uid : 0, () => {
      this.bossWrap.classList.toggle('hidden', !boss);
      if (boss) this.bossName.textContent = boss.name;
    });
    if (boss) {
      const f = Math.max(0, boss.hp / boss.maxHp);
      this.set('bosshp', Math.round(f * 500), () => { this.bossFill.style.transform = `scaleX(${f})`; });
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('on');
    }
  }

  announce(title: string, subtitle: string, color: string): void {
    this.banner.innerHTML = `<div class="b-title">${title}</div><div class="b-sub">${subtitle}</div>`;
    this.banner.style.setProperty('--c', color);
    this.banner.classList.remove('on');
    // Force reflow so the CSS animation restarts.
    void this.banner.offsetWidth;
    this.banner.classList.add('on');
    this.bannerTimer = 2.6;
  }
}
