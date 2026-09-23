import { META_UPGRADES, type MetaId, metaCost } from '../game/meta';
import { type RecordFlags, type SaveData } from '../game/save';
import { type Card, PASSIVES } from '../game/upgrades';
import { RUN_LENGTH } from '../game/waves';
import { type World } from '../game/world';
import { MAX_WEAPON_LEVEL, SYNERGIES, WEAPONS, WEAPON_IDS, type WeaponId } from '../weapons/defs';
import { formatTime } from './hud';
import { icon, metaIcon, passiveIcon, weaponIcon } from './icons';
import { stats as statLines } from './statLines';

type Handler = (arg: string) => void;

const FOCUSABLE = '[data-action]:not([disabled])';

/** A framed panel with a title strip (chamfered arcade frame). */
function frame(title: string, body: string, cls = '', extra = ''): string {
  return `<section class="frame ${cls}"><header class="frame-head"><span>${title}</span>${extra}</header><div class="frame-body">${body}</div></section>`;
}

function btn(action: string, label: string, opts: { arg?: string; cls?: string; primary?: boolean; disabled?: boolean; icon?: string } = {}): string {
  return `<button class="btn ${opts.cls ?? ''}" data-action="${action}"${opts.arg !== undefined ? ` data-arg="${opts.arg}"` : ''}` +
    `${opts.primary ? ' data-primary' : ''}${opts.disabled ? ' disabled' : ''}>` +
    `<span class="lbl">${opts.icon ? icon(opts.icon) : ''}${label}</span></button>`;
}

function toggles(save: SaveData): string {
  const s = save.settings;
  const chip = (k: 'sfx' | 'music' | 'shake', label: string) =>
    `<button class="chip${s[k] ? ' on' : ''}" data-action="toggle" data-arg="${k}"><i></i>${label}</button>`;
  return `<div class="toggles">${chip('sfx', 'SFX')}${chip('music', 'MUSIC')}${chip('shake', 'SHAKE')}</div>`;
}

/**
 * Full-screen overlays (menus and modals). Buttons declare `data-action`
 * and an optional `data-arg`; one delegated listener routes the clicks.
 * Arrow keys move focus spatially between buttons, arcade style.
 */
export class Screens {
  readonly root: HTMLDivElement;
  private handlers: Record<string, Handler> = {};
  /** When the current screen appeared; card picks are ignored briefly to prevent accidental taps. */
  private shownAt = 0;
  private current = '';
  onClickSound: () => void = () => {};
  onHoverSound: () => void = () => {};

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
    let hovered: Element | null = null;
    this.root.addEventListener('pointerover', (e) => {
      const t = (e.target as HTMLElement).closest(FOCUSABLE);
      if (t && t !== hovered) this.onHoverSound();
      hovered = t;
    });
    window.addEventListener('keydown', (e) => this.navigate(e));
  }

  private locked(action: string): boolean {
    return action === 'pick' && performance.now() - this.shownAt < 350;
  }

  /** Spatial focus navigation with the arrow keys. */
  private navigate(e: KeyboardEvent): void {
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const d = dirs[e.code];
    if (!d || this.root.classList.contains('hidden')) return;
    const items = [...this.root.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return;
    const cur = document.activeElement as HTMLElement | null;
    if (!cur || !items.includes(cur)) {
      (this.root.querySelector<HTMLElement>('[data-primary]') ?? items[0]).focus();
      this.onHoverSound();
      return;
    }
    const a = cur.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const it of items) {
      if (it === cur) continue;
      const b = it.getBoundingClientRect();
      const dx = b.left + b.width / 2 - ax;
      const dy = b.top + b.height / 2 - ay;
      const along = dx * d[0] + dy * d[1];
      if (along <= 2) continue;
      const across = Math.abs(dx * d[1]) + Math.abs(dy * d[0]);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    if (best) {
      best.focus();
      this.onHoverSound();
    }
  }

  private show(html: string, cls: string, handlers: Record<string, Handler>, key: string): void {
    this.handlers = handlers;
    // Re-rendering the same screen (e.g. after buying) should not replay the intro animation.
    const rerender = key === this.current;
    this.root.className = `overlay ${cls}${rerender ? ' still' : ''}`;
    this.current = key;
    const focusedArg = (document.activeElement as HTMLElement | null)?.dataset?.arg;
    const focusedAction = (document.activeElement as HTMLElement | null)?.dataset?.action;
    this.root.innerHTML = html;
    this.shownAt = performance.now();
    // Keep keyboard focus on the same button across re-renders.
    const same = focusedAction
      ? this.root.querySelector<HTMLElement>(`[data-action="${focusedAction}"]${focusedArg !== undefined ? `[data-arg="${focusedArg}"]` : ''}`)
      : null;
    const target = rerender && same ? same : this.root.querySelector<HTMLElement>('[data-primary]');
    target?.focus({ preventScroll: true });
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

  // ------------------------------------------------------------------ menu

  menu(save: SaveData, startWeapon: WeaponId, h: { play: Handler; shop: Handler; toggle: Handler; weapon: Handler }): void {
    const top = save.top.length
      ? save.top
          .map((r, i) => `<tr><td class="rank r${i + 1}">${i + 1}</td><td>${r.score.toLocaleString()}</td><td>${formatTime(r.time)}</td><td>${r.kills.toLocaleString()}</td><td>${r.level}</td><td>${r.victory ? icon('trophy') : ''}</td></tr>`)
          .join('')
      : '<tr><td colspan="6" class="dim empty-row">No runs yet. Go make history.</td></tr>';
    const weapons = WEAPON_IDS.map((id) => {
      const d = WEAPONS[id];
      return `<button class="wpick${id === startWeapon ? ' on' : ''}" style="--c:${d.color}" data-action="weapon" data-arg="${id}" title="${d.desc}">` +
        `<span class="wbadge">${weaponIcon(id)}</span><span class="wname">${d.name}</span></button>`;
    }).join('');
    const sel = WEAPONS[startWeapon];
    const main = `
      <div class="menu-buttons">
        ${btn('play', 'START RUN', { primary: true, cls: 'primary big', icon: 'play' })}
        ${btn('shop', `ARMORY <em class="gold">${icon('coin')}${save.gold.toLocaleString()}</em>`, { icon: 'might' })}
      </div>
      ${toggles(save)}
      <div class="objective">
        <div><b>${RUN_LENGTH / 60}:00</b><span>survive</span></div>
        <div><b>${icon('skull')}</b><span>slay the Overmind</span></div>
      </div>`;
    const loadout = `<div class="wpicks">${weapons}</div><p class="wdesc" style="--c:${sel.color}">${sel.desc}</p>`;
    const records = `
      <div class="records">
        <div><b>${save.best.score.toLocaleString()}</b><span>BEST SCORE</span></div>
        <div><b>${formatTime(save.best.time)}</b><span>LONGEST RUN</span></div>
        <div><b>${save.best.kills.toLocaleString()}</b><span>MOST KILLS</span></div>
        <div><b>${save.victories}</b><span>VICTORIES</span></div>
      </div>
      <table class="top"><thead><tr><th>#</th><th>SCORE</th><th>TIME</th><th>KILLS</th><th>LV</th><th></th></tr></thead><tbody>${top}</tbody></table>`;
    this.show(
      `<div class="menu-layout">
        <div class="logo" aria-label="Neon Swarm">
          <div class="logo-neon" data-text="NEON">NEON</div>
          <div class="logo-swarm" data-text="SWARM">SWARM</div>
          <div class="logo-tag">SURVIVE <i></i> EVOLVE <i></i> OVERCOME</div>
        </div>
        <div class="menu-grid">
          ${frame('MAIN', main, 'f-main')}
          <div class="menu-col">
            ${frame('LOADOUT', loadout, 'f-loadout')}
            ${frame('HALL OF FAME', records, 'f-records')}
          </div>
        </div>
        <p class="help desktop-only"><kbd>WASD</kbd> MOVE <kbd>ESC</kbd> PAUSE <kbd>1-3</kbd> PICK <kbd>R</kbd> REROLL <kbd>M</kbd> MUSIC <kbd>F3</kbd> STATS</p>
        <p class="help touch-only">DRAG ANYWHERE TO MOVE · WEAPONS FIRE AUTOMATICALLY</p>
      </div>`,
      'menu-screen',
      h,
      'menu',
    );
  }

  /** `feedback` flashes the tile that was just bought (or shakes it if unaffordable). */
  shop(save: SaveData, h: { buy: Handler; back: Handler }, feedback?: { id: MetaId; ok: boolean }): void {
    const items = META_UPGRADES.map((m) => {
      const rank = save.meta[m.id] ?? 0;
      const maxed = rank >= m.maxRank;
      const cost = metaCost(m.id, rank);
      const afford = !maxed && save.gold >= cost;
      const pips = Array.from({ length: m.maxRank }, (_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      const fb = feedback?.id === m.id ? (feedback.ok ? ' bought' : ' denied') : '';
      return `<div class="shopitem${maxed ? ' maxed' : ''}${fb}">
        <div class="sbadge">${metaIcon(m.id)}</div>
        <div class="sbody"><div class="sname">${m.name}</div><div class="sdesc">${m.desc}</div><div class="pips">${pips}<span>${rank}/${m.maxRank}</span></div></div>
        <button class="btn small buy${afford ? ' primary' : ''}" data-action="buy" data-arg="${m.id}" ${maxed ? 'disabled' : ''}>
          <span class="lbl">${maxed ? 'MAXED' : `${icon('coin')}${cost.toLocaleString()}`}</span>
        </button>
      </div>`;
    }).join('');
    this.show(
      `<div class="shop-layout">
        ${frame('ARMORY', `<p class="shop-sub">Permanent upgrades. Gold is banked after every run.</p><div class="shopgrid">${items}</div>
          <div class="row">${btn('back', 'BACK', { primary: true })}</div>`,
          'f-shop', `<span class="gold wallet">${icon('coin')}${save.gold.toLocaleString()}</span>`)}
      </div>`,
      'menu-screen',
      h,
      'shop',
    );
  }

  // ------------------------------------------------------------------ in game

  levelUp(cards: readonly Card[], w: World, h: { pick: Handler; reroll: Handler }): void {
    const html = cards.map((c, i) => {
      const isNew = (c.kind === 'weapon' || c.kind === 'passive') && c.level === 1;
      let tag = '';
      if (c.kind === 'weapon' || c.kind === 'passive') {
        tag = isNew ? '<span class="tag new">NEW</span>' : `<span class="tag">Lv.${c.level - 1} <b>›</b> Lv.${c.level}</span>`;
      }
      const ic = c.kind === 'weapon' ? weaponIcon(c.id) : c.kind === 'passive' ? passiveIcon(c.id) : icon(c.kind === 'heal' ? 'regen' : 'coin');
      const kind = c.kind === 'weapon' ? 'WEAPON' : c.kind === 'passive' ? 'PASSIVE' : 'BONUS';
      const maxNote = c.kind === 'weapon' && c.level === MAX_WEAPON_LEVEL ? '<span class="maxnote">MAX LEVEL</span>' : '';
      return `<button class="card ${c.rarity}" style="--c:${c.color}" data-action="pick" data-arg="${i}" ${i === 0 ? 'data-primary' : ''}>
        <span class="ribbon">${kind}${c.rarity !== 'common' ? ` · ${c.rarity.toUpperCase()}` : ''}</span>
        <span class="key">${i + 1}</span>
        <span class="cbadge">${ic}</span>
        <span class="ctitle">${c.title}</span>
        ${tag}
        <span class="cdesc">${c.desc}</span>${maxNote}
      </button>`;
    }).join('');
    const extra = w.pendingLevelUps > 1 ? `<div class="pending">+${w.pendingLevelUps - 1} MORE</div>` : '';
    this.show(
      `<div class="levelup">
        <div class="lvhead"><h2 class="lvtitle">LEVEL UP</h2><div class="lvsub">LV ${w.level} · CHOOSE AN UPGRADE</div>${extra}</div>
        <div class="cards">${html}</div>
        ${btn('reroll', `REROLL <em>${w.rerolls}</em>`, { cls: 'small', disabled: w.rerolls <= 0, icon: 'reroll' })}
      </div>`,
      'modal',
      h,
      `levelup${Math.random()}`,
    );
  }

  pause(w: World, save: SaveData, h: { resume: Handler; quit: Handler; toggle: Handler }): void {
    this.show(
      `<div class="modal-layout">
        ${frame('PAUSED', `${buildHtml(w)}
          <div class="row">${btn('resume', 'RESUME', { primary: true, cls: 'primary', icon: 'play' })}${btn('quit', 'QUIT RUN')}</div>
          ${toggles(save)}`, 'f-pause', `<span class="dim">${formatTime(w.time)} · LV ${w.level}</span>`)}
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
    const body = `
      <p class="endline">${victory ? 'The Overmind is dust. The swarm is broken.' : `Slain by <b>${w.lastHitBy || 'the swarm'}</b>.`}</p>
      <div class="endstats">
        <div class="big"><span>SCORE</span><b>${score.toLocaleString()}</b>${badge(records.score)}</div>
        <div><span>SURVIVED</span><b>${formatTime(w.time)}</b>${badge(records.time)}</div>
        <div><span>KILLS</span><b>${w.kills.toLocaleString()}</b>${badge(records.kills)}</div>
        <div><span>LEVEL</span><b>${w.level}</b>${badge(records.level)}</div>
        <div><span>DAMAGE</span><b>${Math.round(w.damageDealt).toLocaleString()}</b></div>
        <div><span>GOLD</span><b class="gold">+${w.gold.toLocaleString()}</b></div>
      </div>
      ${buildHtml(w)}
      <p class="dim bank">${icon('coin')} ${save.gold.toLocaleString()} banked. Spend it in the Armory.</p>
      <div class="row">${btn('retry', 'PLAY AGAIN', { primary: true, cls: 'primary big', icon: 'reroll' })}${btn('menu', 'MENU')}</div>`;
    this.show(
      `<div class="modal-layout">${frame(victory ? 'VICTORY' : 'GAME OVER', body, `f-end ${victory ? 'win' : 'lose'}`)}</div>`,
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
      const max = x.level >= MAX_WEAPON_LEVEL;
      return `<div class="slot${max ? ' max' : ''}" style="--c:${d.color}" title="${d.name}">${weaponIcon(x.id)}<span class="lv">${max ? 'MAX' : `Lv.${x.level}`}</span></div>`;
    })
    .join('');
  const passives = PASSIVES.filter((p) => w.passives[p.id])
    .map((p) => `<div class="slot small" style="--c:${p.color}" title="${p.name}">${passiveIcon(p.id)}<span class="lv">Lv.${w.passives[p.id]}</span></div>`)
    .join('');
  const syn = SYNERGIES.filter((s) => w.synergies.has(s.id))
    .map((s) => `<div class="syn">${icon('lightning')}<b>${s.name}</b> ${s.desc}</div>`)
    .join('');
  const st = statLines(w.stats).map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  return `<div class="build"><div class="slots">${weapons}</div>${passives ? `<div class="slots passives">${passives}</div>` : ''}${syn}<div class="bstats">${st}</div></div>`;
}
