import { handle, readJson, uuid } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { addProduct } from "@/lib/streams/service";
import { addProductSchema } from "@/lib/validation";

export const POST = handle(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const seller = await requireUser("seller");
  const streamId = uuid.parse((await params).id);
  const { imageUrl, ...input } = await readJson(req, addProductSchema);
  const product = await addProduct(await getDb(), seller.id, streamId, {
    ...input,
    images: imageUrl ? [imageUrl] : [],
  });
  return { product };
});
