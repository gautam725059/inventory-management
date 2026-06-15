import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { updateProduct } from "@/lib/db";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

type Context = { params: Promise<{ ean: string }> };

/** Upload a product image (multipart form field "file"). Saves it under
 *  public/uploads and points the product's imageUrl at it. */
export async function POST(request: Request, { params }: Context) {
  const { ean } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Unsupported image type. Use PNG, JPG, WEBP, or GIF." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image too large (max 5 MB)." },
      { status: 400 }
    );
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const safeEan = ean.replace(/[^a-z0-9]/gi, "");
  // Timestamp keeps the filename unique so the browser doesn't show a stale image.
  const filename = `${safeEan}-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

  const imageUrl = `/uploads/${filename}`;
  const ok = await updateProduct(ean, { imageUrl });
  if (!ok) {
    return NextResponse.json({ error: "Product not found." }, { status: 404 });
  }

  return NextResponse.json({ imageUrl });
}
