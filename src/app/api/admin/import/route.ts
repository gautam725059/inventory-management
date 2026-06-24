import { NextResponse } from "next/server";
import { importCatalog } from "@/lib/db";
import { getCurrentUser, hasRole } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";
import { parseCatalogText } from "@/lib/importParser";

/** Admin only. Body: { text: string, preview?: boolean }.
 *  preview → parse + return summary (no write). Otherwise import. */
export async function POST(request: Request) {
  const me = await getCurrentUser(request);
  if (!hasRole(me, "admin")) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const text = typeof b.text === "string" ? b.text : "";
  if (!text.trim()) {
    return NextResponse.json({ error: "Paste some data first." }, { status: 400 });
  }

  const parsed = parseCatalogText(text);

  if (b.preview) {
    return NextResponse.json({
      preview: true,
      summary: parsed.summary,
      products: parsed.items.map((it) => ({
        ean: it.ean,
        name: it.name,
        packs: it.barcodes.length,
      })),
    });
  }

  const result = await importCatalog(parsed.items, await currentChannel());
  return NextResponse.json({ imported: true, summary: parsed.summary, result });
}
