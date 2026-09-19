# DEADLINE — Architecture

This document explains how the pieces fit together and, more importantly, *why*
the boundaries are where they are.

---

## 1. The three processes

| Process | Owns | Never does |
| --- | --- | --- |
| **Web client** (`apps/web`) | Rendering, input, prediction, menus | Decide damage, loot, credits or XP |
| **Game server** (`apps/game-server`) | The authoritative raid simulation | Store long-lived player data |
| **Supabase** | Persistent player data, auth, transactions | Real-time simulation |

The split matters. A raid is 10 minutes of 25 Hz simulation; writing that to
Postgres would be both slow and pointless. Conversely, a player's credits must
survive a server restart, so they can never live in room memory. The rule is:

> **Room memory is the truth during a raid. The database is the truth between raids.**

Everything else follows from that. Loot picked up mid-raid exists only in the
room until the player extracts; a raid that crashes mid-way leaves the stash
untouched, which is exactly the behaviour you want.

---

## 2. Shared, deterministic core

`packages/game-core` holds the simulation maths, and **both** the client and
the server import it:

- `collision.ts` — a uniform-grid broadphase over the map's axis-aligned boxes,
  plus ray/AABB and ray/cylinder intersection.
- `movement.ts` — `stepMovement(state, input, world, modifiers)`. One function,
  one input frame, one deterministic result.
- `combat.ts` — damage, armour, range falloff, hit zones, spread, recoil.
- `inventory.ts` — the grid container used by the backpack, the secure
  container and the stash.
- `lootRoll.ts`, `ai.ts`, `extraction.ts`, `missionProgress.ts`, `spawn.ts`.

`packages/shared` holds the data those functions operate on: the balance
config, the item/weapon/mission catalogues, the Sector Zero map, and the zod
network protocol.

**Why share instead of duplicating?** Client-side prediction only works if the
client's guess matches what the server will decide. If the two implement
movement separately they will drift, and the player will rubber-band. Sharing
the module makes drift impossible by construction.

### The map is generated, not authored

`packages/shared/src/map/sectorZero.ts` builds the map from a fixed seed: a
street grid of city blocks, district blueprints that set building size, height
and loot character, then loot slots, AI posts and spawn points placed against
the finished geometry. Because the seed is baked in, every client and the
server produce byte-identical geometry.

Replacing it with modelled geometry later only requires producing the same
`MapDefinition` shape.

---

## 3. Authentication

```
Browser ──signInWithPassword──▶ Supabase Auth
Browser ◀────── session (JWT) ──
Browser ──joinOrCreate({ accessToken })──▶ Game server
Game server ──auth.getUser(token)──▶ Supabase
Game server: userId := token.sub          ← never the client's claim
```

The client never tells the server who it is. `apps/game-server/src/auth.ts`
validates the access token against Supabase and takes the user id from the
result. A join without a valid token is refused.

The one exception is **demo mode**: when `ALLOW_DEMO_AUTH=true` (development
only) the server accepts a `demoUserId`. `NODE_ENV=production` defaults it off,
and the Docker image hardcodes `ALLOW_DEMO_AUTH=false`.

---

## 4. Raid lifecycle

### Room state machine

```
WAITING ──(enough players, or lobby timer)──▶ COUNTDOWN
COUNTDOWN ──(countdown hits 0)──▶ ACTIVE
ACTIVE ──(time left ≤ FINAL_PHASE_SECONDS)──▶ FINAL_PHASE
FINAL_PHASE ──(time left = 0)──▶ ENDED
ACTIVE|FINAL_PHASE ──(everyone resolved)──▶ ENDED
```

Transitions go through `MatchSystem.transition()`, which **rejects** illegal
moves rather than applying them. Bots are added when COUNTDOWN begins, and the
room is locked at the same moment.

### Player state machine

```
DEPLOYING ──(raid starts)──▶ ALIVE
ALIVE ──(enters an assigned zone, presses X)──▶ EXTRACTING
EXTRACTING ──(hold completes)──▶ EXTRACTED
EXTRACTING ──(leaves the zone / dies)──▶ ALIVE | DEAD
ALIVE|EXTRACTING ──(health ≤ 0)──▶ DEAD
ALIVE ──(timer expires, or disconnect grace elapses)──▶ MIA
```

### Deploy

1. `onAuth` resolves the real user.
2. `onJoin` calls `deployLoadout(userId, loadoutId)`, which **removes** the
   equipped gear from the stash inside a transaction. This is what puts gear at
   risk: it is already gone from your stash the moment you deploy.
3. `startRaid` opens a `raid_history` row.
4. The player is placed with `pickSafeSpawn`, which maximises distance to
   everyone already deployed.
5. Two of the map's three extraction points are assigned, per player.

### Resolve

Exactly one function writes a raid's outcome: `RaidRoom.resolvePlayer()`. It
runs on extraction, on death, on timer expiry, and on a disconnect that outlives
the grace period. It:

1. Computes what survived — the backpack **only on a successful extraction**,
   the secure container always.
2. Computes XP with `calculateRaidXp` (the single XP formula).
3. Folds the raid into mission progress with `applyRaidToMissions`.
4. Calls `finalizeRaid`, one SQL function, one transaction: raid row, loot
   manifest, stash writes, mission rows and their rewards, profile XP/level/
   credits, lifetime stats, leaderboard snapshot.
5. Sends the player their summary.

If the database write fails, the error is logged and the player still gets their
summary — the raid is over either way, and losing the client as well would be
strictly worse.

---

## 5. Network protocol

Transport is Colyseus over WebSocket. Two channels:

**Replicated state** (`RaidState`, 20 Hz patches) — the things every client
needs to draw the world: player transforms, vitals, weapon and ammo counts, AI
transforms and behaviour, container positions and whether they have been opened.

**Targeted messages** — everything that is either per-player or an event:

| Client → Server | Payload |
| --- | --- |
| `input` | seq, dt, movement axes, yaw/pitch, stance flags, predicted position |
| `fire` | seq, yaw, pitch |
| `reload`, `equip` | — / slot |
| `interact`, `pickup`, `drop`, `move_item`, `use_item` | container and entry ids |
| `start_extraction`, `cancel_extraction` | extraction point id |
| `ping`, `debug_command` | — |

| Server → Client | Purpose |
| --- | --- |
| `welcome` | session id, assigned extractions, server config |
| `reconcile` | authoritative position for an acknowledged input |
| `shot_fired` | tracer endpoints for every pellet |
| `damage_taken` / `damage_dealt` | HUD indicators and hit markers |
| `player_died`, `ai_died` | kill feed, corpse container id |
| `container_opened`, `loot_picked`, `inventory_changed` | loot and inventory |
| `extraction_started/cancelled/completed` | the hold timer |
| `match_phase`, `match_ended`, `announcement`, `supply_drop` | match events |
| `raid_summary` | the post-match report |
| `action_rejected` | why the server refused something |

Every client message is validated with a zod schema
(`CLIENT_MESSAGE_SCHEMAS`) before it reaches gameplay code. A message that
fails validation is dropped and recorded as a suspicious event.

**Container contents are never in the replicated state.** A client learns what
is inside a container only after the server accepts its `interact`, and only
through a message addressed to that client.

---

## 6. Prediction and reconciliation

```
Client frame:
  sample input
  stepMovement(localState, input, world)      ← predicted, drawn immediately
  send { seq, input, predictedPosition }      (30 Hz)
  push { seq, input } onto the pending queue

Server tick:
  stepMovement(authoritativeState, input, world)
  if |predicted - authoritative| > tolerance → send reconcile(seq, position)

Client on reconcile:
  snap to the authoritative position
  drop pending inputs ≤ seq
  re-apply every remaining pending input
```

Without the re-apply step the player would be yanked backwards by one round
trip on every correction. Remote players and AI are drawn ~100 ms in the past,
interpolated between the two snapshots that bracket the render time.

---

## 7. Security model

The governing rule: **the client sends intent, never outcome.**

| Concern | Where it is enforced |
| --- | --- |
| Movement speed | Server re-runs `stepMovement`; drift beyond `maxLegalDistance` is a suspicious event and the server's position wins |
| Fire rate | `now - lastShotAt` against the weapon's interval, with a small jitter tolerance |
| Ammunition | The server decrements its own magazine; a shot with an empty mag is refused |
| Damage | `calculateDamage` on the server. **No message carries a damage number** |
| Hit detection | Server-side hitscan against server-side positions and geometry |
| Interaction range | Distance from the server's copy of the player position |
| Loot ownership | Items are removed from the container atomically; a second claim fails |
| Extraction | Re-checked every tick: alive, correct phase, assigned point, inside the radius |
| Credits / XP | Written only by SQL functions or the service-role key |
| Market | `market_buy` / `market_sell` re-derive the price from the catalogue and run as `auth.uid()` |

### Row Level Security

- `profiles` are publicly readable (username, level — the leaderboard needs
  them). A player may update their own row, but a trigger reverts any change to
  `credits`, `xp` or `level` when the caller is the `authenticated` role.
- `player_inventory` is readable and rearrangeable by its owner; a trigger
  reverts any change to `item_id` or `quantity`.
- `player_stats`, `raid_history`, `raid_loot`, `player_missions` and
  `market_transactions` are owner-read, server-write.
- `suspicious_events` is write-only from the server.
- `finalize_raid`, `start_raid` and `deploy_loadout` have their execute grants
  revoked from `anon` and `authenticated` — only the service role can call them.

### Anti-cheat

`AntiCheat` records rejections (speed, teleport, fire rate, ammo, interaction
range, loot ownership, extraction position, schema violations) with a rate limit
so a spamming client cannot flood the log. This is deliberately *not* a
detection system — the defence is that the server already refused the action.

---

## 8. Persistence

`packages/persistence` defines one port, `Persistence`, with two adapters:

- **`SupabasePersistence`** — constructed with either the user's client (web
  app: RLS applies, RPCs see `auth.uid()`) or the service-role client (game
  server: may call `deploy_loadout` and `finalize_raid`).
- **`FilePersistence`** — a single JSON document with a serialised write queue
  and atomic commits, used when Supabase is not configured. Both the web app
  and the game server open the same file, which is what makes the loop work
  with zero configuration.

Gameplay code only ever sees the port. Swapping the store is a constructor
change.

### Schema

```
profiles ──1:1── player_stats
   │
   ├──1:N── player_inventory   (container: stash | loadout_backpack | loadout_secure)
   ├──1:N── player_loadouts
   ├──1:N── player_missions ──N:1── missions
   ├──1:N── raid_history ──1:N── raid_loot
   ├──1:N── market_transactions
   └──1:N── leaderboard_snapshots (one row per player per week)

items ──1:1── weapons           (catalogue mirrors, generated from TypeScript)
daily_missions                  (the day's three picks, shared by everyone)
suspicious_events               (anti-cheat log)
```

---

## 9. The client

The render loop never touches React.

```
requestAnimationFrame
  ├─ sample input, apply look + recoil
  ├─ predict movement
  ├─ handle firing
  ├─ send input (30 Hz)
  ├─ interpolate remote entities from the replicated state
  ├─ update effects, adaptive quality, camera
  ├─ write HUD values into hudStore   ← plain object, no re-render
  └─ render
```

`hudStore` publishes an immutable snapshot at ~12 Hz; React subscribes with
`useSyncExternalStore`. So the HUD updates at a readable rate while the game
keeps its own frame budget.

**Adaptive quality** (`quality.ts`) measures the actual frame rate and steps
between three tiers — resolution scale, shadows and weather density — until it
holds the target. Nothing gameplay-visible changes between tiers.

**Audio** is synthesised with the Web Audio API rather than loaded from files,
so the game ships with no audio assets and cannot fail on a missing one. Every
call is wrapped so audio can never throw into the render loop.

---

## 10. Extending the game

| To add… | Change |
| --- | --- |
| A weapon | One entry in `packages/shared/src/weapons.ts` |
| An item | One entry in `packages/shared/src/items.ts` |
| A container type | `ContainerType` + a row in `CONTAINER_DEFINITIONS` |
| A mission | One entry in `packages/shared/src/missions.ts` |
| A perk | One entry in `PERK_DEFINITIONS`, plus a field on `PerkModifiers` |
| A map | A new `MapDefinition` registered in `MAPS` |
| A balance value | `packages/shared/src/config.ts` and `.env` |

After changing a catalogue, run `pnpm db:seed:generate` so the Postgres mirrors
stay in sync.
