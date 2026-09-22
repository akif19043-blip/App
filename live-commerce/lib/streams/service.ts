import { randomUUID } from "node:crypto";
import type { Database, Queryable } from "@/lib/db/types";
import { toBid, toChat, toProduct, toStream } from "@/lib/db/mappers";
import { AppError, forbidden, notFound } from "@/lib/errors";
import { publish } from "@/lib/realtime/notify";
import type { ChatMessage, Product, RoomSnapshot, Stream, StreamStatus } from "@/types/domain";

const STREAM_SELECT = `
  select s.*, u.username as seller_name
    from streams s join users u on u.id = s.seller_id`;

export async function getStream(q: Queryable, streamId: string): Promise<Stream | null> {
  const { rows } = await q.query(`${STREAM_SELECT} where s.id = $1`, [streamId]);
  return rows[0] ? toStream(rows[0]) : null;
}

export async function listStreams(
  q: Queryable,
  filter: { status?: StreamStatus[]; sellerId?: string } = {},
): Promise<Stream[]> {
  const { rows } = await q.query(
    `${STREAM_SELECT}
      where ($1::text[] is null or s.status::text = any($1::text[]))
        and ($2::uuid is null or s.seller_id = $2)
      order by case s.status when 'live' then 0 when 'upcoming' then 1 else 2 end,
               s.viewer_count desc, s.created_at desc
      limit 100`,
    [filter.status ?? null, filter.sellerId ?? null],
  );
  return rows.map(toStream);
}

export async function createStream(
  db: Database,
  sellerId: string,
  input: { title: string; category: string },
): Promise<Stream> {
  const { rows } = await db.query<{ id: string }>(
    `insert into streams (seller_id, title, category, livekit_room_id)
     values ($1, $2, $3, $4) returning id`,
    [sellerId, input.title.trim(), input.category.trim(), `live-${randomUUID()}`],
  );
  return (await getStream(db, rows[0].id))!;
}

const STREAM_FLOW: Record<StreamStatus, StreamStatus | null> = { upcoming: "live", live: "ended", ended: null };

/** upcoming → live → ended, only by the stream's own seller. */
export async function setStreamStatus(
  db: Database,
  { streamId, sellerId, status }: { streamId: string; sellerId: string; status: StreamStatus },
): Promise<Stream> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ seller_id: string; status: StreamStatus }>(
      "select seller_id, status from streams where id = $1 for update",
      [streamId],
    );
    const row = rows[0];
    if (!row) throw notFound("Nie ma takiej transmisji.");
    if (row.seller_id !== sellerId) throw forbidden("To nie Twoja transmisja.");
    if (STREAM_FLOW[row.status] !== status) {
      throw new AppError("invalid_stream_transition", `Nie można zmienić statusu z ${row.status} na ${status}.`, 409);
    }
    if (status === "ended") {
      const active = await tx.query("select 1 from products where stream_id = $1 and status = 'bidding_active'", [
        streamId,
      ]);
      if (active.rows.length) {
        throw new AppError("auction_in_progress", "Nie można zakończyć transmisji w trakcie licytacji.", 409);
      }
    }
    await tx.query(
      `update streams set status = $2::stream_status,
              started_at = case when $2::stream_status = 'live' then clock_timestamp() else started_at end,
              ended_at = case when $2::stream_status = 'ended' then clock_timestamp() else ended_at end,
              viewer_count = case when $2::stream_status = 'ended' then 0 else viewer_count end
        where id = $1`,
      [streamId, status],
    );
    await publish(tx, { type: "stream.status", streamId, status });
    return (await getStream(tx, streamId))!;
  });
}

export async function listProducts(q: Queryable, streamId: string): Promise<Product[]> {
  const { rows } = await q.query(
    `select p.*, u.username as bidder_name
       from products p left join users u on u.id = p.current_highest_bidder_id
      where p.stream_id = $1
      order by p.position, p.created_at`,
    [streamId],
  );
  return rows.map(toProduct);
}

export async function addProduct(
  db: Database,
  sellerId: string,
  streamId: string,
  input: { title: string; description: string; startingPrice: number; images: string[] },
): Promise<Product> {
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ seller_id: string; status: StreamStatus }>(
      "select seller_id, status from streams where id = $1 for update",
      [streamId],
    );
    if (!rows[0]) throw notFound("Nie ma takiej transmisji.");
    if (rows[0].seller_id !== sellerId) throw forbidden("To nie Twoja transmisja.");
    if (rows[0].status === "ended") throw new AppError("stream_ended", "Transmisja już się zakończyła.", 409);

    const inserted = await tx.query<{ id: string }>(
      `insert into products (stream_id, title, description, starting_price, images, position)
       values ($1, $2, $3, $4, $5,
               (select coalesce(max(position), 0) + 1 from products where stream_id = $1))
       returning id`,
      [streamId, input.title.trim(), input.description.trim(), input.startingPrice, input.images],
    );
    await publish(tx, { type: "products.changed", streamId });
    const all = await listProducts(tx, streamId);
    return all.find((p) => p.id === inserted.rows[0].id)!;
  });
}

export async function deleteDraftProduct(db: Database, sellerId: string, productId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ seller_id: string; status: string; stream_id: string }>(
      `select s.seller_id, p.status, p.stream_id
         from products p join streams s on s.id = p.stream_id
        where p.id = $1 for update of p`,
      [productId],
    );
    if (!rows[0]) throw notFound();
    if (rows[0].seller_id !== sellerId) throw forbidden();
    if (rows[0].status !== "draft") throw new AppError("not_draft", "Można usuwać tylko nielicytowane przedmioty.", 409);
    await tx.query("delete from products where id = $1", [productId]);
    await publish(tx, { type: "products.changed", streamId: rows[0].stream_id });
  });
}

export async function postChatMessage(
  db: Database,
  { streamId, userId, body }: { streamId: string; userId: string; body: string },
): Promise<ChatMessage> {
  const text = body.replace(/\s+/g, " ").trim();
  if (!text || text.length > 280) throw new AppError("invalid_message", "Wiadomość musi mieć od 1 do 280 znaków.");
  return db.transaction(async (tx) => {
    const stream = await getStream(tx, streamId);
    if (!stream) throw notFound("Nie ma takiej transmisji.");
    if (stream.status === "ended") throw new AppError("stream_ended", "Czat jest zamknięty.", 409);
    const { rows } = await tx.query(
      `insert into chat_messages (stream_id, user_id, body) values ($1, $2, $3)
       returning *, (select username from users where id = $2) as user_name`,
      [streamId, userId, text],
    );
    const message = toChat(rows[0]);
    await publish(tx, { type: "chat.message", streamId, message });
    return message;
  });
}

/** Viewer joined (+1) or left (-1). Publishes the new count. */
export async function adjustViewerCount(db: Database, streamId: string, delta: number): Promise<void> {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ viewer_count: number }>(
      `update streams set viewer_count = greatest(0, viewer_count + $2)
        where id = $1 and status <> 'ended' returning viewer_count`,
      [streamId, delta],
    );
    if (rows[0]) await publish(tx, { type: "stream.viewers", streamId, viewerCount: rows[0].viewer_count });
  });
}

export async function getRoomSnapshot(q: Queryable, streamId: string): Promise<RoomSnapshot | null> {
  const stream = await getStream(q, streamId);
  if (!stream) return null;
  const products = await listProducts(q, streamId);
  const activeProduct = products.find((p) => p.status === "bidding_active") ?? null;

  const bids = activeProduct
    ? await q.query(
        `select b.*, u.username as bidder_name from bids b join users u on u.id = b.bidder_id
          where b.product_id = $1 order by b.created_at desc limit 20`,
        [activeProduct.id],
      )
    : { rows: [] };
  const chat = await q.query(
    `select m.*, u.username as user_name from chat_messages m join users u on u.id = m.user_id
      where m.stream_id = $1 order by m.created_at desc limit 50`,
    [streamId],
  );
  const now = await q.query<{ now: Date }>("select clock_timestamp() as now");

  return {
    stream,
    products,
    activeProduct,
    recentBids: bids.rows.map(toBid),
    chat: chat.rows.map(toChat).reverse(),
    serverNow: new Date(now.rows[0].now).toISOString(),
  };
}
