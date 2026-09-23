import { META_UPGRADES, metaCost } from '../game/meta';
import { type RecordFlags, type SaveData } from '../game/save';
import { stats as statLines } from './statLines';
import { type Card, PASSIVES } from '../game/upgrades';
import { type World } from '../game/world';
import { RUN_LENGTH } from '../game/waves';
import { SYNERGIES, WEAPONS, WEAPON_IDS, type WeaponId } from '../weapons/defs';
import { formatTime } from './hud';

type Handler = (arg: string) => void;

/**
 * Full-screen overlays (menus and modals). Buttons declare `data-action`
 * and an optional `data-arg`; one delegated listener routes the clicks.
 */
export class Screens {
  readonly root: HTMLDivElement;
  private handlers: Record<string, Handler> = {};
  /** When the current screen appeared; card picks are ignored briefly to prevent accidental taps. */
  private shownAt = 0;
  onClickSound: () => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'overlay hidden';
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!t || t.hasAttribute('disabled')) return;
      const action = t.dataset.action!;
      const fn = this.handlers[action];
      if (fn && !this.locked(action)) {
        this.onClickSound();
        fn(t.dataset.arg ?? '');
      }
    });
  }

  private current = '';

  private show(html: string, cls: string, handlers: Record<string, Handler>, key: string): void {
    this.handlers = handlers;
    // Re-rendering the same screen (e.g. after buying) should not replay the intro animation.
    this.root.className = `overlay ${cls}${key === this.current ? ' still' : ''}`;
    this.current = key;
    this.root.innerHTML = html;
    this.shownAt = performance.now();
    const primary = this.root.querySelector<HTMLElement>('[data-primary]');
    primary?.focus({ preventScroll: true });
  }

  hide(): void {
    this.root.className = 'overlay hidden';
    this.root.innerHTML = '';
    this.handlers = {};
    this.current = '';
  }

  /** Invokes a handler by name (used for keyboard shortcuts). */
  trigger(action: string, arg = ''): boolean {
    const fn = this.handlers[action];
    if (!fn || this.locked(action)) return false;
    fn(arg);
    return true;
  }

  private locked(action: string): boolean {
    return action === 'pick' && performance.now() - this.shownAt < 350;
  }

  // ------------------------------------------------------------------ menu

  menu(save: SaveData, startWeapon: WeaponId, h: { play: Handler; shop: Handler; toggle: Handler; weapon: Handler }): void {
    const s = save.settings;
    const top = save.top.length
      ? save.top
          .map((r, i) => `<tr><td>${i + 1}</td><td>${r.score.toLocaleString()}</td><td>${formatTime(r.time)}</td><td>${r.kills}</td><td>${r.level}</td><td>${r.victory ? '★' : ''}</td></tr>`)
          .join('')
      : '<tr><td colspan="6" class="dim">No runs yet. Go make history.</td></tr>';
    const weapons = WEAPON_IDS.map((id) => {
      const d = WEAPONS[id];
      return `<button class="wpick${id === startWeapon ? ' on' : ''}" style="--c:${d.color}" data-action="weapon" data-arg="${id}" title="${d.desc}">` +
        `<span class="glyph">${d.icon}</span><span>${d.name}</span></button>`;
    }).join('');
    this.show(
      `<div class="panel menu">
        <h1 class="title"><span>NEON</span><span>SWARM</span></h1>
        <p class="tagline">Survive ${RUN_LENGTH / 60} minutes. Kill the Overmind. Weapons fire on their own.</p>
        <div class="label">Starting weapon</div>
        <div class="wpicks">${weapons}</div>
        <div class="row">
          <button class="btn primary big" data-action="play" data-primary>▶ PLAY</button>
          <button class="btn" data-action="shop">UPGRADES <span class="gold">¤ ${save.gold}</span></button>
        </div>
        <div class="records">
          <div><b>${save.best.score.toLocaleString()}</b><span>best score</span></div>
          <div><b>${formatTime(save.best.time)}</b><span>longest run</span></div>
          <div><b>${save.best.kills}</b><span>most kills</span></div>
          <div><b>${save.victories}</b><span>victories</span></div>
        </div>
        <table class="top"><thead><tr><th>#</th><th>Score</th><th>Time</th><th>Kills</th><th>Lv</th><th></th></tr></thead><tbody>${top}</tbody></table>
        <div class="row toggles">
          <button class="chip${s.sfx ? ' on' : ''}" data-action="toggle" data-arg="sfx">SFX</button>
          <button class="chip${s.music ? ' on' : ''}" data-action="toggle" data-arg="music">MUSIC</button>
          <button class="chip${s.shake ? ' on' : ''}" data-action="toggle" data-arg="shake">SHAKE</button>
        </div>
        <p class="help desktop-only">WASD / Arrows move · Esc pause · 1-3 pick card · R reroll · F stats</p>
        <p class="help touch-only">Drag anywhere to move · weapons fire automatically</p>
      </div>`,
      'menu-screen',
      h,
      'menu',
    );
  }

  shop(save: SaveData, h: { buy: Handler; back: Handler }): void {
    const items = META_UPGRADES.map((m) => {
      const rank = save.meta[m.id] ?? 0;
      const maxed = rank >= m.maxRank;
      const cost = metaCost(m.id, rank);
      const afford = !maxed && save.gold >= cost;
      const pips = Array.from({ length: m.maxRank }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      return `<div class="shopitem${maxed ? ' maxed' : ''}">
        <div class="sicon">${m.icon}</div>
        <div class="sbody"><div class="sname">${m.name}</div><div class="sdesc">${m.desc}</div><div class="pips">${pips}</div></div>
        <button class="btn small${afford ? ' primary' : ''}" data-action="buy" data-arg="${m.id}" ${maxed || !afford ? 'disabled' : ''}>
          ${maxed ? 'MAX' : `¤ ${cost}`}
        </button>
      </div>`;
    }).join('');
    this.show(
      `<div class="panel shop">
        <h2>PERMANENT UPGRADES</h2>
        <p class="gold big-gold">¤ ${save.gold}</p>
        <div class="shopgrid">${items}</div>
        <button class="btn" data-action="back" data-primary>◀ BACK</button>
      </div>`,
      'menu-screen',
      h,
      'shop',
    );
  }

  // ------------------------------------------------------------------ in game

  levelUp(cards: readonly Card[], w: World, h: { pick: Handler; reroll: Handler }): void {
    const html = cards.map((c, i) => {
      const isNew = c.kind === 'weapon' && c.level === 1;
      const tag = c.kind === 'heal' || c.kind === 'gold' ? '' : isNew ? '<span class="tag new">NEW!</span>' : `<span class="tag">LV ${c.level}</span>`;
      return `<button class="card ${c.rarity}" style="--c:${c.color}" data-action="pick" data-arg="${i}" ${i === 0 ? 'data-primary' : ''}>
        <span class="key">${i + 1}</span>
        <span class="cicon">${c.icon}</span>
        <span class="ctitle">${c.title}</span>${tag}
        <span class="cdesc">${c.desc}</span>
        <span class="ckind">${c.kind === 'weapon' ? 'WEAPON' : c.kind === 'passive' ? 'PASSIVE' : 'BONUS'}</span>
      </button>`;
    }).join('');
    const extra = w.pendingLevelUps > 1 ? `<div class="pending">+${w.pendingLevelUps - 1} more</div>` : '';
    this.show(
      `<div class="levelup">
        <h2 class="lvtitle">LEVEL UP!</h2>${extra}
        <div class="cards">${html}</div>
        <button class="btn small" data-action="reroll" ${w.rerolls > 0 ? '' : 'disabled'}>↻ REROLL (${w.rerolls})</button>
      </div>`,
      'modal',
      h,
      `levelup${Math.random()}`,
    );
  }

  pause(w: World, save: SaveData, h: { resume: Handler; quit: Handler; toggle: Handler }): void {
    const s = save.settings;
    this.show(
      `<div class="panel pause">
        <h2>PAUSED</h2>
        ${buildHtml(w)}
        <div class="row">
          <button class="btn primary" data-action="resume" data-primary>▶ RESUME</button>
          <button class="btn" data-action="quit">QUIT RUN</button>
        </div>
        <div class="row toggles">
          <button class="chip${s.sfx ? ' on' : ''}" data-action="toggle" data-arg="sfx">SFX</button>
          <button class="chip${s.music ? ' on' : ''}" data-action="toggle" data-arg="music">MUSIC</button>
          <button class="chip${s.shake ? ' on' : ''}" data-action="toggle" data-arg="shake">SHAKE</button>
        </div>
      </div>`,
      'modal',
      h,
      'pause',
    );
  }

  end(
    w: World, victory: boolean, score: number, records: RecordFlags, save: SaveData,
    h: { retry: Handler; menu: Handler },
  ): void {
    const badge = (on: boolean) => (on ? '<span class="rec">NEW RECORD</span>' : '');
    this.show(
      `<div class="panel end ${victory ? 'win' : 'lose'}">
        <h2 class="endtitle">${victory ? 'VICTORY' : 'GAME OVER'}</h2>
        <p class="tagline">${victory ? 'The Overmind is dust. The swarm is broken.' : `Slain by ${w.lastHitBy || 'the swarm'}.`}</p>
        <div class="endstats">
          <div><span>Score</span><b>${score.toLocaleString()}</b>${badge(records.score)}</div>
          <div><span>Survived</span><b>${formatTime(w.time)}</b>${badge(records.time)}</div>
          <div><span>Kills</span><b>${w.kills}</b>${badge(records.kills)}</div>
          <div><span>Level</span><b>${w.level}</b>${badge(records.level)}</div>
          <div><span>Damage</span><b>${Math.round(w.damageDealt).toLocaleString()}</b></div>
          <div><span>Gold earned</span><b class="gold">+${w.gold} ¤</b></div>
        </div>
        ${buildHtml(w)}
        <p class="dim">Bank: ¤ ${save.gold} — spend it on permanent upgrades.</p>
        <div class="row">
          <button class="btn primary big" data-action="retry" data-primary>↻ PLAY AGAIN</button>
          <button class="btn" data-action="menu">MENU</button>
        </div>
      </div>`,
      'modal',
      h,
      'end',
    );
  }
}

/** Current weapons, passives, synergies and key stats. */
function buildHtml(w: World): string {
  const weapons = w.weapons
    .map((x) => {
      const d = WEAPONS[x.id];
      return `<div class="bw" style="--c:${d.color}"><span class="glyph">${d.icon}</span>${d.name}<b>${x.level}</b></div>`;
    })
    .join('');
  const passives = PASSIVES.filter((p) => w.passives[p.id])
    .map((p) => `<div class="bp">${p.icon} ${p.name} <b>${w.passives[p.id]}</b></div>`)
    .join('');
  const syn = SYNERGIES.filter((s) => w.synergies.has(s.id))
    .map((s) => `<div class="syn">⚡ ${s.name}: ${s.desc}</div>`)
    .join('');
  const st = statLines(w.stats).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  return `<div class="build"><div class="bweapons">${weapons}</div><div class="bpassives">${passives}</div>${syn}<div class="bstats">${st}</div></div>`;
}
