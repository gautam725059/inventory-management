import { NextResponse } from "next/server";
import { getProductPurchaseHistory } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { currentChannel } from "@/lib/channel";

/** Any logged-in user: purchase (stock-in) history of one product in the active
 *  channel. Query: ?code=<EAN / 12NC / ASIN / pack barcode>. */
export async function GET(request: Request) {
  const me = await getCurrentUser(request);
  if (!me) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!code.trim()) {
    return NextResponse.json({ error: "Enter a code to search." }, { status: 400 });
  }
  const history = await getProductPurchaseHistory(code, await currentChannel());
  if (!history) {
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({ found: true, ...history });
}
