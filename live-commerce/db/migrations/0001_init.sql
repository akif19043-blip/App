-- Live commerce core schema.
--
-- Every monetary column is an integer number of grosze (1 PLN = 100 gr).
-- Integers keep bid comparisons exact; formatting to "zł" happens in the UI.

create type user_role as enum ('buyer', 'seller', 'admin');
create type stream_status as enum ('upcoming', 'live', 'ended');
create type product_status as enum ('draft', 'bidding_active', 'sold', 'unsold');
create type payment_status as enum ('pending_blik', 'paid', 'escrow_hold', 'released');
create type shipment_status as enum (
  'awaiting_locker',   -- buyer has not picked a Paczkomat yet
  'label_created',     -- paid + locker known: InPost label generated
  'in_transit',        -- seller dropped the parcel off
  'ready_for_pickup',  -- parcel is in the buyer's locker
  'delivered'          -- buyer collected it (delivery confirmation)
);

-- InPost locker ids look like WAW123M, KRA01N, POZ08A.
create domain paczkomat_code as text
  check (value ~ '^[A-Z]{3}[0-9]{1,4}[A-Z]{1,3}$');

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email) and position('@' in email) > 1),
  username text not null unique check (username ~ '^[A-Za-z0-9_.]{3,24}$'),
  password_hash text not null,
  role user_role not null default 'buyer',
  -- BLIK OneClick alias registered after the first code payment ("zapamiętaj BLIK").
  blik_alias text unique,
  default_paczkomat_id paczkomat_code,
  created_at timestamptz not null default now()
);

create table sessions (
  -- sha256 of the random token stored in the cookie; the raw token never hits the DB.
  id text primary key,
  user_id uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions (user_id);

create table streams (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users (id),
  title text not null check (char_length(title) between 3 and 120),
  category text not null check (char_length(category) between 2 and 40),
  status stream_status not null default 'upcoming',
  livekit_room_id text not null unique,
  viewer_count integer not null default 0 check (viewer_count >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index streams_status_idx on streams (status, created_at desc);
create index streams_seller_idx on streams (seller_id, created_at desc);

create table products (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references streams (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starting_price integer not null check (starting_price between 100 and 10000000),
  current_highest_bid integer,
  current_highest_bidder_id uuid references users (id),
  bid_count integer not null default 0,
  status product_status not null default 'draft',
  images text[] not null default '{}',
  position integer not null default 0,
  auction_started_at timestamptz,
  auction_ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (current_highest_bid is null or current_highest_bid >= starting_price),
  check ((current_highest_bid is null) = (current_highest_bidder_id is null)),
  check (status <> 'bidding_active' or auction_ends_at is not null)
);
create index products_stream_idx on products (stream_id, position);
-- A stream auctions one item at a time.
create unique index products_one_active_per_stream
  on products (stream_id) where status = 'bidding_active';
-- The settlement sweeper looks for expired auctions.
create index products_active_ends_idx
  on products (auction_ends_at) where status = 'bidding_active';

create table bids (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products (id) on delete cascade,
  bidder_id uuid not null references users (id),
  amount integer not null check (amount > 0),
  created_at timestamptz not null default clock_timestamp(),
  -- Last line of defence against collisions: two accepted bids can never
  -- share an amount on the same product.
  unique (product_id, amount)
);
create index bids_product_created_idx on bids (product_id, created_at desc);

create table orders (
  id uuid primary key default gen_random_uuid(),
  -- One order per auctioned product: settlement is idempotent.
  product_id uuid not null unique references products (id),
  buyer_id uuid not null references users (id),
  seller_id uuid not null references users (id),
  final_price integer not null check (final_price > 0),
  payment_status payment_status not null default 'pending_blik',
  payment_reference text,
  -- Claimed while a BLIK charge is in flight, so a double tap cannot charge twice.
  payment_locked_until timestamptz,
  paid_at timestamptz,
  escrow_released_at timestamptz,
  shipment_status shipment_status not null default 'awaiting_locker',
  inpost_locker_code paczkomat_code,
  inpost_tracking_number text unique check (inpost_tracking_number ~ '^[0-9]{24}$'),
  delivery_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  -- Escrow can only be released once delivery has been confirmed.
  check (payment_status <> 'released' or delivery_confirmed_at is not null),
  check (inpost_tracking_number is null or inpost_locker_code is not null)
);
create index orders_buyer_idx on orders (buyer_id, created_at desc);
create index orders_seller_idx on orders (seller_id, created_at desc);

-- Append-only audit trail for every payment/shipment transition.
create table order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null,
  from_state text,
  to_state text,
  note text,
  created_at timestamptz not null default clock_timestamp()
);
create index order_events_order_idx on order_events (order_id, id);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references streams (id) on delete cascade,
  user_id uuid not null references users (id),
  body text not null check (char_length(body) between 1 and 280),
  created_at timestamptz not null default clock_timestamp()
);
create index chat_stream_idx on chat_messages (stream_id, created_at desc);
