# DEADLINE

**Loot. Survive. Get Out.**

A browser-based multiplayer extraction shooter. Drop into Sector Zero — a
quarantined European industrial quarter — with whatever gear you can afford to
lose, fill your bag from the buildings and the bodies, and reach one of your
assigned exits before the ten-minute deadline. Everything you fail to extract
is gone.

This repository contains a **working vertical slice**: the whole loop runs, end
to end, against a real authoritative server.

```
LOGIN → MAIN MENU → LOADOUT → DEPLOY → multiplayer raid
      → loot / combat / AI → EXTRACT or DIE → POST MATCH
      → STASH → MARKET → next raid
```

---

## Table of contents

- [What actually works](#what-actually-works)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment configuration](#environment-configuration)
- [Supabase setup](#supabase-setup)
- [Development](#development)
- [Testing](#testing)
- [Build](#build)
- [Deployment](#deployment)
- [Gameplay reference](#gameplay-reference)
- [Known limitations](#known-limitations)
- [Roadmap](#roadmap)

---

## What actually works

Everything in this list is exercised by the automated tests
(`pnpm test` and `pnpm test:e2e`), not just implemented:

| Area | Status |
| --- | --- |
| Email/password auth (Supabase) + guest/demo mode | ✅ |
| Main menu, loadout, stash, market, missions, leaderboard, settings | ✅ |
| Colyseus authoritative rooms, JWT-validated joins | ✅ |
| Client-side prediction + server reconciliation + remote interpolation | ✅ |
| Server-authoritative fire rate, ammo, spread, hitscan, damage, armour | ✅ |
| AI enemies (3 archetypes) with vision, line of sight, noise and a real state machine | ✅ |
| AI Raider bots that loot, fight and extract through the same code paths as players | ✅ |
| Loot containers with per-district rarity tables, rolled server side | ✅ |
| Grid inventory (8×6 backpack, 2×2 secure container) | ✅ |
| Raid timer, danger phase, MIA on timeout | ✅ |
| Extraction with a hold timer and cancellation | ✅ |
| Death → lootable corpse; only the secure container comes home | ✅ |
| Persistent stash, credits, XP, levels, stats, raid history | ✅ |
| NPC market with server-validated transactions | ✅ |
| Campaign + daily missions with progress and rewards | ✅ |
| Weekly leaderboard with your own rank | ✅ |
| Mid-raid supply drop event | ✅ |
| Key-gated caches (Police Armory, Bunker Vault) | ✅ |
| Reconnect inside a grace window; MIA if you do not come back | ✅ |
| Adaptive render quality, synthesised audio, in-raid debug tools | ✅ |

See [Known limitations](#known-limitations) for what is deliberately *not* done.

---

## Architecture

```
┌──────────────────┐     HTTPS      ┌────────────────────┐
│  apps/web        │◀──────────────▶│  Supabase          │
│  Next.js + React │  auth, stash,  │  Postgres + Auth   │
│  Three.js client │  market, RLS   │  + RLS + RPCs      │
└────────┬─────────┘                └─────────▲──────────┘
         │ WebSocket (Colyseus)               │ service role
         ▼                                    │ (raid results only)
┌──────────────────────────────────────────────┴─────────┐
│  apps/game-server — authoritative simulation            │
│  movement · combat · AI · loot · extraction · match      │
└──────────────────────────────────────────────────────────┘
                         ▲
                         │ shared, deterministic
┌────────────────────────┴─────────────────────────────────┐
│  packages/shared      types, configs, catalogues, map     │
│  packages/game-core   movement, collision, combat, loot   │
│  packages/persistence Supabase + file adapters            │
│  packages/ui          design tokens and formatting        │
└──────────────────────────────────────────────────────────┘
```

The important property: **the client and the server run the same movement and
collision code** from `@deadline/game-core`, against the same map geometry from
`@deadline/shared`. That is what makes prediction and reconciliation agree
instead of fighting each other.

`docs/ARCHITECTURE.md` goes into detail — raid lifecycle, network protocol,
security model and persistence boundaries.

### Repository layout

```
apps/
  web/            Next.js app: menus, auth, and the Three.js game client
  game-server/    Colyseus authoritative server
packages/
  shared/         Types, enums, balance config, item/weapon/mission catalogues,
                  the Sector Zero map, and the zod network protocol
  game-core/      Deterministic simulation: collision, movement, combat maths,
                  grid inventory, loot rolls, AI, extraction, mission progress
  persistence/    The persistence port + Supabase and file-backed adapters
  ui/             Design tokens and formatting helpers
  config/         Shared tsconfig and ESLint presets
supabase/
  migrations/     Schema, RLS policies, transactional SQL functions
  seed/           Generated catalogue seed
docs/             Architecture notes
scripts/          Seed generation, end-to-end and screenshot runners
```

---

## Requirements

- **Node.js 20.11+** (22 LTS recommended)
- **pnpm 10+** (`corepack enable` is enough)
- A modern desktop browser with WebGL2 — Chrome, Edge, Firefox; Safari works
- *Optional:* a Supabase project. **Without one the game still runs** — see
  [demo mode](#demo-mode-no-supabase).

---

## Installation

```bash
pnpm install
cp .env.example .env
pnpm build:packages     # compile the workspace packages once
```

---

## Environment configuration

Everything is documented inline in [`.env.example`](.env.example). The values
you are most likely to change:

| Variable | Default | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | empty | Supabase project. Empty ⇒ demo mode. |
| `SUPABASE_SERVICE_ROLE_KEY` | empty | Server-only. Writes raid results. **Never expose it.** |
| `NEXT_PUBLIC_GAME_SERVER_URL` | `ws://localhost:2567` | Where the browser opens its raid socket. |
| `MATCH_DURATION_SECONDS` | `600` | Raid length. |
| `MAX_PLAYERS` | `8` | Humans per raid. |
| `ENABLE_BOTS` / `BOT_COUNT` | `true` / `4` | AI Raiders that backfill a lobby. |
| `ALLOW_DEMO_AUTH` | `true` in dev | Lets the game server accept unauthenticated demo joins. **Set `false` in production.** |
| `ENABLE_DEBUG_TOOLS` | dev only | The in-raid debug panel (backtick). |

Balance values (`LOOT_MULTIPLIER`, `XP_MULTIPLIER`, `EXTRACTION_TIME_SECONDS`,
`STARTING_CREDITS`, …) are all environment-overridable; the defaults live in
`packages/shared/src/config.ts`, and no gameplay file hardcodes a number.

### Demo mode (no Supabase)

If `NEXT_PUBLIC_SUPABASE_URL` is empty, both the web app and the game server
fall back to a **file-backed database** at `.deadline-demo/db.json`. Both
processes open the same file, so a raid you play really does update the stash,
stats, missions and leaderboard you see in the menus. Sign in with
**Guest access** on the login screen.

This is for local development and demos only — no concurrency across machines,
no row-level security, no migrations.

---

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Put the URL, anon key and service-role key into `.env`.
3. Apply the migrations and seed:

```bash
# With the Supabase CLI linked to your project:
supabase db push
psql "$DATABASE_URL" -f supabase/seed/catalog.sql

# Or locally:
supabase start
supabase db reset      # migrations + seed
```

### Database migrations

| File | Contents |
| --- | --- |
| `20250101000000_init.sql` | Tables, indexes, the new-user trigger |
| `20250101000100_rls.sql` | Row Level Security and the write guards |
| `20250101000200_functions.sql` | `deploy_loadout`, `finalize_raid`, `market_buy`, `market_sell`, `claim_mission`, leaderboard queries |

`supabase/seed/catalog.sql` is **generated** from the TypeScript catalogues.
After changing an item, weapon or mission, run:

```bash
pnpm db:seed:generate
```

---

## Development

Two processes. Run them in separate terminals, or together:

```bash
pnpm dev             # builds packages, then runs the server and the web app
```

Individually:

```bash
pnpm dev:server      # Colyseus on :2567  (health: http://localhost:2567/health)
pnpm dev:web         # Next.js on :3000
```

Then open <http://localhost:3000>, sign in (guest access works with no setup),
and press **DEPLOY**.

While iterating on the packages, keep a watch build running so the app picks
up changes:

```bash
pnpm --filter @deadline/shared dev
pnpm --filter @deadline/game-core dev
```

### Controls

| Key | Action |
| --- | --- |
| `W A S D` | Move |
| Mouse | Aim |
| `Shift` | Sprint (drains stamina) |
| `C` | Crouch |
| Left click | Fire |
| Right click | Aim down sights |
| `R` | Reload |
| `F` / `E` | Search a container |
| `Tab` | Inventory (the raid does **not** pause) |
| `1` / `2` | Primary / secondary weapon |
| `X` | Start extraction (inside one of your zones) |
| `` ` `` | Debug panel (development only) |
| `Esc` | Release the mouse |

---

## Testing

```bash
pnpm test        # unit + integration (builds packages first)
pnpm test:e2e    # full browser run: login → raid → loot → extract → stash
```

**Unit tests** (`packages/game-core`, 73 tests) cover damage and armour maths,
range falloff, hit zones, spread, hitscan against real map geometry, movement
and stamina, the anti-cheat travel budget, grid inventory placement, loot
tables, the XP curve, perk aggregation, market transactions, extraction
eligibility, mission progress and network message validation.

**Integration tests** (`apps/game-server`) boot the real server against a
throwaway database and drive a real Colyseus client through a raid: join,
deploy, move under server authority, get a teleport rejected, open a container,
take loot, fire a weapon, have the fire-rate validator reject a burst, extract,
and verify the raid was written to the database.

**End-to-end** (`scripts/e2e.mjs`) runs the built web app and a real Chromium
through the whole product flow and fails on console errors.

`scripts/screenshots.mjs` captures the game from each district — useful when
tuning lighting or HUD layout.

---

## Build

```bash
pnpm typecheck       # tsc --noEmit across every package
pnpm lint            # ESLint (no `any`, no unused code)
pnpm build           # packages → game server → Next.js production build
```

---

## Deployment

### Web app — Vercel

`apps/web/vercel.json` is set up for a monorepo build. Set the project root to
`apps/web`, and configure `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY` and `NEXT_PUBLIC_GAME_SERVER_URL` (use `wss://`).

### Game server — anything that keeps a WebSocket open

`apps/game-server/Dockerfile` builds a self-contained image:

```bash
docker build -f apps/game-server/Dockerfile -t deadline-game-server .
docker run -p 2567:2567 --env-file .env deadline-game-server
```

`fly.toml` and `railway.json` are ready to use. Both point at `/health`, which
returns `{"status":"ok"}`. **Do not** deploy the server behind a platform that
sleeps idle instances — a raid room must stay alive for its full ten minutes.

In production set `ALLOW_DEMO_AUTH=false` and `ENABLE_DEBUG_TOOLS=false`.
`NODE_ENV=production` already defaults both to off.

### Database — Supabase

Apply the migrations, then the generated seed. The service-role key belongs
**only** to the game server.

---

## Gameplay reference

**Sector Zero** is 400 m × 400 m, laid out as a street grid with seven
districts:

| District | Risk | Character |
| --- | --- | --- |
| Apartment Blocks | Low | Thin loot, thin risk — a decent place to start |
| Train Station | Medium | Long sightlines, freight containers |
| Old Hospital | Medium | Medical supplies, and whatever guards them |
| Market Street | Medium | The centre. Everyone crosses it |
| Police Station | High | Weapons and armour, behind a locked armoury |
| Warehouse District | High | Military crates, heavy company |
| Underground Bunker | Extreme | The best loot in the sector, and the worst odds |

Five weapons (PM-9, VX-7, AR-12, M14-X, Breach-8), three AI archetypes
(Scavenger, Guard, Heavy), five rarity tiers, and a supply drop at the five
minute mark that lands in a random high-risk district.

Adding content is data only: a new weapon is an entry in
`packages/shared/src/weapons.ts`, a new item in `items.ts`, a new mission in
`missions.ts`. No gameplay code changes.

---

## Known limitations

Stated plainly, because a vertical slice that pretends to be finished is worse
than one that does not:

- **No lag compensation.** Hits are resolved against the server's *current*
  entity positions, not a rewound snapshot. At high latency you must lead your
  shots. The architecture has the hooks (input sequence numbers, snapshot
  buffers); the rewind itself is not implemented.
- **No Rapier physics.** Collision is a deterministic swept-circle against
  axis-aligned boxes, shared by the client and the server. This was a
  deliberate choice: identical collision on both sides is worth more to
  prediction than a physics engine's feature set. There is no vaulting, no
  ragdolls and no dynamic objects.
- **Locked rooms are key-gated containers, not doors.** The Police Armory and
  Bunker Vault caches require their key to open; the doorway itself is not a
  dynamic collider.
- **Placeholder visuals and audio.** Geometry is generated boxes and capsules;
  all sound is synthesised with the Web Audio API. No third-party assets are
  bundled. `public/game/` documents the drop-in points.
- **No player-to-player market**, no insurance, no crafting. The economy is an
  NPC vendor. Insurance is modelled in the schema but not implemented.
- **Solo queue only.** The architecture carries no team concept yet; duo/trio
  needs a party id on the room join and friendly-fire rules.
- **No matchmaking service.** `joinOrCreate` picks any open room for the map.
  Skill-based matchmaking would need a queue service in front of Colyseus.
- **Single-region, single-process.** Horizontal scale needs the Colyseus Redis
  presence/driver (dependencies are compatible, wiring is not done).
- **The file-backed demo database is not production storage.** It exists so the
  game is playable with zero configuration.
- **Mobile is out of scope** for this slice. The layout is desktop-first and the
  controls assume a mouse and keyboard; the PWA manifest is in place for later.

---

## Roadmap

1. **Lag compensation** — rewind entity positions to the shooter's view time.
2. **Duos and trios** — party ids on join, friendly fire rules, squad HUD.
3. **Authored geometry** — replace the generated boxes with modelled districts
   and interiors, keeping the same `MapDefinition` contract.
4. **Insurance and crafting** — the schema already anticipates insurance.
5. **Horizontal scale** — Redis presence and driver, multiple regions.
6. **Player-to-player market** with listing fees and an audit trail.
7. **Mobile / PWA** — touch controls and an aggressive quality tier.
8. **Admin panel** — the `suspicious_events` and `market_transactions` tables
   already record what it would show.
