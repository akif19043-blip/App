# Neon Swarm

A roguelike auto-shooter in the style of Vampire Survivors and Brotato, built with
**Vite + TypeScript + Canvas 2D**. It runs without any art files: every creature is
drawn procedurally, and every sound is synthesised with the Web Audio API. You can swap
in PNG sprites whenever you like by dropping them into `public/assets/sprites/`; see
[Custom sprites](#custom-sprites).

Survive 10 minutes against growing swarms, then destroy **The Overmind** to win.
Your weapons fire on their own, so all you do is move, collect XP, and choose upgrades.

## Running it

```bash
cd roguelike-game
npm install
npm run dev        # http://localhost:5173 (also exposed on your LAN for phones)
npm test           # Vitest unit + simulation tests
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Controls

| Input | Action |
|---|---|
| WASD / Arrow keys | Move |
| Touch: drag anywhere | Floating virtual joystick |
| 1 / 2 / 3 or click/tap | Pick a level-up card |
| R | Reroll cards (limited) |
| Esc / P / Ⅱ button | Pause |
| M | Toggle music |
| F3 | FPS / entity-count overlay (hidden by default) |
| Arrow keys in menus | Move focus between buttons |
| Enter | Play / play again |

## Gameplay

- **Enemies** spawn off-screen and home in on you, with separation steering so swarms spread out:
  - *Swarmer*: fast, fragile, weaves as it moves.
  - *Drone*: the basic enemy.
  - *Bulwark*: slow and tanky, and mostly shrugs off knockback.
  - *Spitter*: keeps its distance and shoots at you.
  - *Elite*: arrives every 45 s. It dashes at you and drops a treasure core worth a free upgrade.
  - *Bosses* at 3:00 and 6:30, and **The Overmind** at 10:00. Bosses dash and fire radial bullet bursts, and the Overmind also summons swarmers. Each has its own health bar and an arrow at the screen edge when it is off-screen.
  - Timed **swarm rings** surround you.
- **XP gems** are pulled towards you once they enter your pickup radius. Collecting them in quick succession raises the pickup sound's pitch like a combo. Enemies can also drop gold, repair kits, and a rare *vacuum* that pulls in every gem on the map.
- **Levelling up** pauses the game and offers three cards: a new weapon, a weapon level, or a passive stat.
- **Weapons** (up to 4 at once, each upgrades to level 8):
  - *Magic Wand*: bursts of bolts at the nearest enemies.
  - *Spinning Orbs*: orbit you and hit anything they touch, with a per-enemy hit cooldown.
  - *Chain Lightning*: strikes random on-screen enemies and damages everything in a blast radius.
  - *Ricochet Daggers*: bounce between enemies they haven't hit yet.
  - *Nova Field*: a pulsing aura that damages and slows enemies around you.
- **Synergies** unlock when both weapons in a pair reach level 3:
  - Wand + Daggers: *Arcane Ricochet*, wand bolts bounce.
  - Orbs + Lightning: *Storm Orbs*, orb hits can call down lightning.
  - Orbs + Nova: *Nova Core*, bigger and stronger orbs.
  - Daggers + Lightning: *Thunder Blades*, bounces release sparks.
- **12 passives:** Might, Haste, Speed, Max HP, Magnet, Area, Multishot, Regen, Armor, Crit, XP gain, Projectile speed.
- **Meta-progression:** gold is banked at the end of every run, including runs you quit. Spend it in the main-menu shop on permanent Max HP, Speed, Magnet radius, Damage, Armor, XP gain, Gold gain, and Rerolls. High scores, a top-5 run table, and settings are saved in `localStorage`.

## Look & feel

- **Fonts:** *Press Start 2P* for titles, numbers and badges, and *Chakra Petch* for body text and damage numbers. Both are Google Fonts under the SIL OFL, self-hosted in `src/assets/fonts/` so the game works offline and never flashes a fallback font.
- **UI:** menus use chamfered arcade frames with CRT scanlines. Buttons have hover and focus states and a hover blip sound, and arrow keys move focus between them.
- **HUD:**
  - a slim XP strip across the top edge
  - a compact HP bar showing the numbers, with a trailing bar for damage just taken
  - framed weapon slots with `Lv.1`–`Lv.8` badges and passive slots below them
- **Procedural creatures** (the fallback art):
  - Swarmers are six-legged bugs.
  - Drones are one-eyed jellies with tentacles.
  - Bulwarks are armoured beetles.
  - Spitters are three-eyed slugs.
  - Elites are spiked beasts.
  - Bosses are many-armed horrors.

  Each one has 4 animation frames, turns to face where it is going, and has a dark ink outline plus a drop shadow so overlapping enemies stay separate.
- **Readability in big swarms:**
  - A dark halo and a pulsing ring mark the player, with a mini HP bar under the ship.
  - Rapid hits on one enemy add up into one growing damage number, and area hits on a packed group fold into a single number.
  - At most 24 damage numbers show at once; crits always show.
  - Hit flashes keep each creature's outline, so a flashing crowd doesn't merge into one white blob.

## Custom sprites

Put PNGs in `public/assets/sprites/{player,enemies,weapons,effects}/`. For example,
`enemies/swarmer.png` replaces the Swarmer's procedural art, and anything you don't
provide keeps the procedural look. A small Vite plugin (`vite/spriteManifest.ts`) scans the
folder at dev/build time into `virtual:sprite-manifest`. The `AssetLoader`
(`src/render/assets.ts`) loads every listed PNG and builds its white hit-flash version,
so the browser never probes for files that aren't there. Horizontal strips of square
frames are detected as spritesheets automatically; an optional sidecar `.json` sets the
frame grid, fps, scale, rotation mode (`face` / `flip` / `spin` / `none`), which way the
art faces, and pixel-art scaling. `public/assets/README.md` lists every file name and
option.

## Architecture

```
src/
  engine/     loop (fixed timestep), spatialGrid, pool, stateMachine, input, camera, math, rng
  entities/   Player, Enemy, Projectile/EnemyBullet, Pickup, particles/floaters/effects
  weapons/    defs (data + level steps + synergies), damage math, per-weapon behaviors
  game/       World simulation, waves/director, enemies, upgrades (cards), progression (XP),
              stats, meta shop, save/load
  render/     Canvas 2D renderer, AssetLoader + sprite metadata, procedural creature sheets
  assets/     self-hosted fonts
  audio/      Web Audio synthesiser (SFX + procedural chiptune)
  ui/         DOM HUD, screens (menu, armory, level-up, pause, game over / victory), SVG icon set
  main.ts     App: wires everything together around the state machine
vite/         sprite-manifest plugin (scans public/assets/sprites)
public/assets/sprites/   optional PNG overrides
```

- **State machine:** `menu ⇄ shop`, `menu → playing ⇄ paused`, `playing ⇄ levelup` (level-ups can chain), then `playing → gameover | victory → playing | menu`. Illegal transitions throw.
- **Fixed-timestep loop:** physics always steps at exactly 1/60 s, using an accumulator with a spiral-of-death clamp. Rendering interpolates the player, enemies, and bullets between steps, so motion stays smooth on 120/144 Hz displays.
- **The simulation is headless.** `World` never touches the DOM, canvas, or audio; it reports events through a small interface. That lets the tests run whole minutes of gameplay in Node.
- **Object pools:** every entity type is preallocated: 2,600 enemies, 2,000 projectiles, 1,200 enemy bullets, 2,500 pickups, 6,000 particles, plus floaters and effects (over 14,000 in total). Dead objects are swap-compacted once per tick, so the hot loop never allocates. When the gem pool is full, new XP merges into existing gems instead of being lost.
- **Spatial grid:** a uniform 64-unit grid over the arena is rebuilt every tick with a counting sort into flat `Int32Array`s. Projectile hits, orb and aura contact, lightning blasts, enemy separation, nearest-target search and player contact all query it, never scanning every enemy.
- **Rendering:** every entity is drawn through one `drawSheet` path, whether it is a loaded PNG or a procedural spritesheet. Procedural sheets are rasterised once, with a separate hit-flash version, at the current zoom × devicePixelRatio. Visible enemies are collected in one culling pass, and the shadow and body passes reuse that list. Particles are batched by palette colour and drawn with additive blending.
- **Performance:** in Node, one simulation step with about 1,500–2,500 live enemies plus weapons and effects averages about 1 ms, over 4,000 live entities in total. In a Chromium stress test with about 1,750 enemies (3,000 entities), each frame spends about 1 ms in the simulation and about 4 ms issuing draw calls, well within the 16.6 ms budget for 60 FPS. Open the game with `?stress=2500` to flood the arena, and press **F3** to show the overlay.

## Tests

`npm test` runs 88 Vitest tests:

- `math`: circle/circle, circle/rect and point tests, separation normals.
- `spatialGrid`: checked against brute force on 3,000 random circles, plus buffer-overflow and reuse cases.
- `pool`: no growth or loss when compacting.
- `damage`: might scaling, crit rolls, armor mitigation, knockback resistance, cooldown floor, DPS, weapon level scaling, player-stat resolution, synergy activation.
- `progression`: the XP curve, multi-level rollover, and score.
- `upgrades`: card rolls, slot limits, maxed items, fallback cards.
- `save`: meta costs and effects, corrupt-save recovery, buying, records and the top-5 table.
- `waves`: pacing curves and the boss, elite and cap schedule.
- `stateMachine`: legal and illegal transitions.
- `world`: integration tests for collisions, drops, vacuum and level-up, armor and i-frames, ricochet, pierce, orb cooldown, lightning AoE, off-screen spawning, upgrades, synergies, victory and meta stats.
- `simulation`: a bot plays 4 minutes headlessly, and the result must be deterministic for a given seed.
- `damageNumbers`: merging hits on one enemy, folding area hits, the on-screen cap, and ignoring recycled numbers.
- `spriteMeta`: spritesheet strip detection, frame grids, default orientations, invalid metadata.
- `spriteManifest`: folder scanning, sidecar JSON, and invalid or missing files.
