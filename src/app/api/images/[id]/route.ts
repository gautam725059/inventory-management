import { mongoGetImage } from "@/lib/mongo";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

/** Serve a product image stored in MongoDB (GridFS). Cached aggressively since
 *  each upload gets a fresh id. */
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  const img = await mongoGetImage(id);
  if (!img) {
    return new Response("Image not found.", { status: 404 });
  }
  return new Response(new Uint8Array(img.buffer), {
    headers: {
      "Content-Type": img.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
