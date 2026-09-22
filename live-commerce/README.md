# Młotek — licytacje na żywo

A live-commerce and real-time auction MVP for the Polish market, in the spirit
of Whatnot: sellers stream video, buyers bid in 30-second auctions, and the
winner pays with **BLIK** and picks up the parcel from an **InPost
Paczkomat**. The money waits in escrow until the buyer confirms pickup.

The UI is in Polish and mobile-first.

| | |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, Turbopack), Tailwind CSS 4, shadcn/ui-style components, lucide-react |
| Database | PostgreSQL (Supabase in production). Embedded **PGlite** for local development and tests, so no setup is needed |
| Video | **LiveKit** WebRTC SFU: the host publishes from the browser camera, viewers subscribe with sub-second latency |
| Realtime | Postgres `LISTEN/NOTIFY` → Server-Sent Events. Works across any number of app instances |
| Payments | BLIK via a Przelewy24-style provider (mocked): 6-digit code and OneClick alias |
| Shipping | InPost Paczkomat picker (Geowidget stand-in), automatic label and tracking number |
| Tests | Vitest: unit tests, plus integration tests against PGlite or a real Postgres |

## Quick start

```bash
cd live-commerce
npm install
npm run dev          # http://localhost:3000
```

On first boot the embedded database is created in `.data/`, migrated, and
seeded with demo data. The password for every demo account is `demo1234`:

| Account | Role |
|---|---|
| `sprzedawca@demo.pl` | seller, with one live stream and 4 items queued |
| `kupujacy@demo.pl`, `kupujacy2@demo.pl` | buyers (default Paczkomat WAW123M) |

To try a full auction, open the stream as the seller in one browser and as a
buyer in another (or in a private window):

1. The seller opens **Panel sprzedawcy → Otwórz studio** and presses **Start 30 s** on an item.
2. The buyers tap **Licytuj** (+10 zł) or **+20 zł**. A bid in the last 5 seconds resets the clock to 10 s.
3. When the timer runs out, the winning bid is reserved as an order and checkout opens for the winner.
4. Checkout: pick a Paczkomat, then enter a BLIK code (see the sandbox codes below).
5. In **Zamówienia** the seller prints the label and presses **Nadałem paczkę**. The **Demo: dostarcz do Paczkomatu** button then simulates InPost delivering the parcel.
6. The buyer presses **Potwierdzam odbiór**, and the escrow is released to the seller.

**BLIK sandbox codes:** `000000` is declined by the bank, `111111` is an
expired code, and any other 6 digits are approved. If the buyer ticks
"Zapamiętaj BLIK", later payments are one-click.

## Scripts

| | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm test` | all Vitest suites (unit + integration on in-memory PGlite) |
| `npm run test:pg` | integration suites against real Postgres (`TEST_DATABASE_URL`, needs `CREATE DATABASE` rights) |
| `npm run typecheck` | `tsc --noEmit` with Next's generated route types |
| `npm run db:migrate` / `db:seed` | apply migrations / insert demo data on `DATABASE_URL` |
| `npm run db:reset-local` | delete the local PGlite database |

## Architecture

```
app/                     routes: pages, plus JSON and SSE route handlers under app/api
  (main)/                home, login/register, seller dashboard, orders, account
  live/[id]/             the full-screen live room (viewer and host studio)
components/
  ui/                    shadcn/ui-style primitives (Button, Dialog, Card, …)
  live/                  video stage, auction panel, countdown, chat, host queue
  checkout/              checkout modal (Paczkomat → BLIK → done), Paczkomat picker
hooks/                   useLiveRoom (SSE + snapshot), useServerClock, useCountdown
lib/
  auction/rules.ts       pure bidding rules: minimum bid, anti-sniping, settlement
  auction/service.ts     startAuction, placeBid, settleAuction (transactions + row locks)
  orders/state-machine.ts pure payment/shipment state machine
  orders/service.ts      BLIK payment, Paczkomat choice, label, dispatch, escrow release
  payments/blik.ts       Przelewy24-style BLIK provider (mock)
  shipping/              InPost lockers dataset and search, shipments, tracking numbers
  realtime/              NOTIFY publisher, per-process LISTEN hub and settlement sweeper
  db/                    driver abstraction (pg / PGlite), migrator, seed
db/migrations/           SQL migrations (plain Postgres; runs on Supabase as-is)
tests/                   unit/ and integration/ (Vitest)
```

### Schema

All money is stored as **integer grosze** (1 zł = 100 gr), so bid
comparisons are exact.

- `users`: `email`, `username`, `role` (`buyer` / `seller` / `admin`), `blik_alias`, `default_paczkomat_id`, `password_hash`
- `sessions`: stores a sha256 of each session token; the raw token is only in an httpOnly cookie
- `streams`: `seller_id`, `title`, `category`, `status` (`upcoming` / `live` / `ended`), `livekit_room_id`, `viewer_count`
- `products`: `stream_id`, `title`, `description`, `starting_price`, `current_highest_bid` (+ bidder), `status` (`draft` / `bidding_active` / `sold` / `unsold`), `images`, `auction_ends_at`
- `bids`: `product_id`, `bidder_id`, `amount`, `created_at`
- `orders`: `product_id` (unique), `buyer_id`, `seller_id`, `final_price`, `payment_status` (`pending_blik` / `paid` / `escrow_hold` / `released`), `shipment_status`, `inpost_locker_code`, `inpost_tracking_number`, `delivery_confirmed_at`
- `order_events`: append-only audit trail of every payment and shipment transition
- `chat_messages`

The database also enforces the rules itself: at most one active auction per
stream (partial unique index), no two bids on a product with the same amount,
one order per product, and no `released` escrow without a confirmed delivery.

### Bidding and bid collisions

`placeBid` runs in a transaction that takes `SELECT … FOR UPDATE` on the
product row. Concurrent bids on the same item therefore queue up, and each one
is checked by the pure `evaluateBid` rules against the state the previous bid
left behind. If 25 people tap "+10 zł" at the same moment, exactly one bid is
accepted. The others get HTTP 409 ("Ktoś był szybszy") with the new minimum
bid. There is an integration test for this that runs against real Postgres.

### Timer, anti-sniping and settlement

- Every deadline uses the **database clock** (`clock_timestamp()`), so all app instances agree on it.
- Clients estimate their offset from the server clock NTP-style (`/api/time`: several samples, shortest round trip wins). The countdown shows `endsAt − serverNow`, so it matches on every phone even when the phone's own clock is wrong.
- Anti-sniping: a bid placed with ≤ 5 s left moves `auction_ends_at` to now + 10 s. The `bid.placed` event carries the new end time and an `extended` flag, and the UI flashes "+10 s".
- Settlement is idempotent (`FOR UPDATE SKIP LOCKED`, a status check, and a unique order per product). It can be triggered three ways: a 250 ms sweeper in each server process; a nudge from clients whose countdown reached zero (`POST /api/products/:id/settle`); and, for serverless deployments, `GET /api/cron/settle`. The winning bid becomes an order in `pending_blik`.

### Realtime

Each change is published with `pg_notify` **inside the transaction that made
it**, so an event is only delivered if that transaction commits. Every app
instance `LISTEN`s and forwards events to its SSE connections for the
matching stream. Clients use `EventSource`, which reconnects on its own. After
every (re)connect the client refetches the room snapshot, so events missed
while offline are recovered. The out-of-order-safe reducer is in
`lib/live/room-state.ts`.

SSE is used rather than WebSockets because Next.js route handlers cannot
upgrade connections. Messages from client to server (bids, chat) go over plain
`POST` requests.

### Order and escrow flow

```
payment:  pending_blik ─BLIK OK→ paid ─→ escrow_hold ─(delivery confirmed)→ released
shipment: awaiting_locker ─(paid + locker)→ label_created ─dispatch→ in_transit ─InPost→ ready_for_pickup ─pickup→ delivered
```

The buyer can pick the Paczkomat before or after paying. The InPost label is
generated automatically once both are done. A BLIK charge first claims the
order (`payment_locked_until`), so a double tap cannot charge the buyer twice.
The gateway call runs without holding any row locks.

## Going to production

1. **Database**: create a Supabase project, set `DATABASE_URL` to the direct connection or the session pooler (port 5432; LISTEN/NOTIFY does not work through the transaction pooler), and run `npm run db:migrate`.
2. **Video**: create a LiveKit Cloud project (or self-host) and set `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
3. **Payments**: implement `PaymentProvider` (`lib/payments/blik.ts`) against the Przelewy24 BLIK API, or Stripe with BLIK enabled. Keep the same contract, confirm through the provider's webhook, and call `setPaymentProvider` at boot.
4. **Shipping**: replace `createShipment` (`lib/shipping/inpost.ts`) with calls to InPost ShipX. Point the InPost status webhook at `/api/webhooks/inpost` and set `INPOST_WEBHOOK_SECRET`. Swap `PaczkomatPicker` for the official Geowidget if you want the map.
5. **Hosting**: any Node host with long-lived processes (Fly, Railway, Render, a VM) runs the sweeper and SSE natively. On Vercel or other serverless platforms, schedule `/api/cron/settle` with `CRON_SECRET`, and remember that SSE connections are limited by function duration.

Not in this MVP: product image upload (images are URLs; Supabase Storage fits
here), payouts to sellers' bank accounts, refunds and disputes, moderation,
and email notifications.
