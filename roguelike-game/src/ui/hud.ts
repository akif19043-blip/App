import { xpProgress } from '../game/progression';
import { PASSIVES } from '../game/upgrades';
import { WaveDirector } from '../game/waves';
import { type World } from '../game/world';
import { MAX_WEAPONS, MAX_WEAPON_LEVEL, SYNERGIES, WEAPONS } from '../weapons/defs';
import { icon, passiveIcon, weaponIcon } from './icons';

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
 *
 * Layout: full-width XP strip on the top edge; top-left HP + weapon and
 * passive slots; top-centre timer and boss bar; top-right kills / gold / pause.
 */
export class Hud {
  readonly root: HTMLDivElement;
  private readonly xpFill: HTMLDivElement;
  private readonly level: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpGhost: HTMLDivElement;
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
  private ghost = 1;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud hidden', parent);
    const xp = el('div', 'xpbar', this.root);
    this.xpFill = el('div', 'xpfill', xp);
    this.level = el('div', 'xplevel', this.root);

    const left = el('div', 'hud-left', this.root);
    const hpRow = el('div', 'hprow', left);
    hpRow.innerHTML = icon('heart', 'ico hp-ico');
    const hp = el('div', 'hpbar', hpRow);
    this.hpGhost = el('div', 'hpghost', hp);
    this.hpFill = el('div', 'hpfill', hp);
    this.hpText = el('div', 'hptext', hpRow);
    this.slots = el('div', 'slots', left);
    this.passives = el('div', 'slots passives', left);
    this.synergies = el('div', 'synergies', left);

    const center = el('div', 'hud-center', this.root);
    this.timer = el('div', 'timer', center);
    this.wave = el('div', 'wave', center);
    this.bossWrap = el('div', 'bossbar hidden', center);
    this.bossName = el('div', 'bossname', this.bossWrap);
    const bb = el('div', 'bosstrack', this.bossWrap);
    this.bossFill = el('div', 'bossfill', bb);

    const right = el('div', 'hud-right', this.root);
    const k = el('div', 'chip-stat', right);
    k.innerHTML = icon('skull');
    this.kills = el('span', '', k);
    const g = el('div', 'chip-stat gold', right);
    g.innerHTML = icon('coin');
    this.gold = el('span', '', g);
    this.pauseBtn = el('button', 'pausebtn', right);
    this.pauseBtn.innerHTML = icon('pause');
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
    this.ghost = 1;
    this.banner.classList.remove('on');
  }

  update(w: World, dt: number): void {
    const prog = xpProgress(w.xp);
    this.set('xp', Math.round(prog * 500), () => { this.xpFill.style.transform = `scaleX(${prog})`; });
    this.set('lvl', w.level, () => {
      this.level.textContent = `LV ${w.level}`;
      this.level.classList.remove('bump');
      void this.level.offsetWidth;
      this.level.classList.add('bump');
    });

    const hp = Math.max(0, Math.ceil(w.player.hp));
    const max = Math.round(w.stats.maxHp);
    const frac = hp / max;
    this.set('hp', `${hp}/${max}`, () => {
      this.hpFill.style.transform = `scaleX(${frac})`;
      this.hpText.innerHTML = `<b>${hp}</b><span>/${max}</span>`;
      this.hpFill.classList.toggle('low', frac < 0.3);
    });
    // The "ghost" bar trails behind to show how much you just lost.
    this.ghost = this.ghost > frac ? Math.max(frac, this.ghost - dt * 0.6) : frac;
    this.set('ghost', Math.round(this.ghost * 300), () => { this.hpGhost.style.transform = `scaleX(${this.ghost})`; });

    this.set('time', Math.floor(w.time), () => { this.timer.textContent = formatTime(w.time); });
    this.set('wave', WaveDirector.waveAt(w.time), () => { this.wave.textContent = `WAVE ${WaveDirector.waveAt(w.time)}`; });
    this.set('kills', w.kills, () => { this.kills.textContent = w.kills.toLocaleString(); });
    this.set('gold', w.gold, () => { this.gold.textContent = w.gold.toLocaleString(); });

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
          `${weaponIcon(wi.id)}<span class="lv">${max ? 'MAX' : `Lv.${wi.level}`}</span></div>`;
      }
      this.slots.innerHTML = html;
    });
    const pasKey = PASSIVES.map((p) => w.passives[p.id] ?? 0).join('');
    this.set('passives', pasKey, () => {
      this.passives.innerHTML = PASSIVES.filter((p) => w.passives[p.id])
        .map((p) => {
          const rank = w.passives[p.id]!;
          const max = rank >= p.maxRank;
          return `<div class="slot small${max ? ' max' : ''}" style="--c:${p.color}" title="${p.name}: ${p.desc}">` +
            `${passiveIcon(p.id)}<span class="lv">${max ? 'MAX' : `Lv.${rank}`}</span></div>`;
        })
        .join('');
    });
    const synKey = [...w.synergies].join(',');
    this.set('syn', synKey, () => {
      this.synergies.innerHTML = SYNERGIES.filter((s) => w.synergies.has(s.id))
        .map((s) => `<div class="syn" title="${s.desc}">${icon('lightning', 'ico')}${s.name}</div>`)
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
