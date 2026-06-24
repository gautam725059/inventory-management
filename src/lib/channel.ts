import { cookies } from "next/headers";
import type { Channel } from "./types";

/** Name of the cookie that holds the active sales channel ("ecom" | "b2b").
 *  Set client-side by the channel switcher; read server-side by API routes so
 *  every list/aggregate is scoped to the channel the user is currently in. */
export const CHANNEL_COOKIE = "channel";

/** The active channel for the current request, read from the channel cookie.
 *  Defaults to "ecom" when absent or unrecognized. */
export async function currentChannel(): Promise<Channel> {
  const value = (await cookies()).get(CHANNEL_COOKIE)?.value;
  return value === "b2b" ? "b2b" : "ecom";
}
