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
 *  SKU (Wipro) / 12NC (Philips); e-commerce uses the EAN barcode. */
export function codeLabel(channel: Channel): string {
  return channel === "b2b" ? "SKU" : "EAN / Barcode";
}

/** The short product-code word for inline copy ("…matches this EAN/SKU"). Used
 *  for the PRIMARY product code (stock-in, add product, catalog). */
export function codeWord(channel: Channel): string {
  return channel === "b2b" ? "SKU" : "EAN";
}

/** True if a string is a valid primary product code for the channel. B2B allows
 *  alphanumeric SKU/12NC codes (with hyphens, up to 24 chars); e-commerce
 *  requires a 6–14 digit EAN. */
export function isValidCode(code: string, channel: Channel): boolean {
  const c = code.trim();
  return channel === "b2b"
    ? /^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(c)
    : /^\d{6,14}$/.test(c);
}

/** The code SCANNED at stock-out. In B2B goods go out by their Amazon ASIN
 *  (a pack/listing code mapped to the 12NC); e-commerce scans the EAN barcode. */
export function scanWord(channel: Channel): string {
  return channel === "b2b" ? "ASIN" : "EAN";
}
