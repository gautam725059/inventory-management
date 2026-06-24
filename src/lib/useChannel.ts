"use client";

import { useEffect, useState } from "react";
import type { Channel } from "./types";

/** Read the active channel from the cookie on the client. Starts at "ecom" for a
 *  stable first render, then syncs after mount. */
export function useChannel(): Channel {
  const [channel, setChannel] = useState<Channel>("ecom");
  useEffect(() => {
    const m = document.cookie.match(/(?:^|;\s*)channel=(b2b|ecom)/);
    setChannel(m?.[1] === "b2b" ? "b2b" : "ecom");
  }, []);
  return channel;
}

/** The product-code field label for a channel. B2B identifies products by their
 *  Philips-style 12NC material code; e-commerce uses the EAN barcode. */
export function codeLabel(channel: Channel): string {
  return channel === "b2b" ? "12NC" : "EAN / Barcode";
}

/** The short product-code word for inline copy ("…matches this EAN/12NC"). Used
 *  for the PRIMARY product code (stock-in, add product, catalog). */
export function codeWord(channel: Channel): string {
  return channel === "b2b" ? "12NC" : "EAN";
}

/** The code SCANNED at stock-out. In B2B goods go out by their Amazon ASIN
 *  (a pack/listing code mapped to the 12NC); e-commerce scans the EAN barcode. */
export function scanWord(channel: Channel): string {
  return channel === "b2b" ? "ASIN" : "EAN";
}
