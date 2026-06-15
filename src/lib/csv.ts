import { NextResponse } from "next/server";

type Cell = string | number | null | undefined;

/** Quote a cell if it contains commas, quotes, or newlines (RFC 4180). */
function escapeCell(value: Cell): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a CSV string from a header row + data rows. */
export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}

/** Wrap CSV text in a downloadable response. A leading BOM keeps Excel happy
 *  with UTF-8 characters. */
export function csvResponse(filename: string, csv: string): NextResponse {
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
