import type { ImportItem, PackBarcode } from "./types";

// ---------------------------------------------------------------------------
// Parse a pasted catalog sheet (tab- or comma-separated) into master products
// with their pack barcodes. Expected columns (by position):
//   0 Date | 1 Master name | 2 Master EAN | 3 Pack code | 4 Pack EAN
//   5 Pack name | 6 Purchase qty | 7 Price
// Master rows have a name but no pack code; pack rows have a pack code and
// belong to the most recent master.
// ---------------------------------------------------------------------------

export interface ParseSummary {
  masters: number;
  validPacks: number;
  skipped: number;
  errors: string[]; // human-readable issues (e.g. broken EANs)
}

export interface ParseOutput {
  items: ImportItem[];
  summary: ParseSummary;
}

/** A plausible scannable barcode: 6–14 digits. */
function isValidEan(s: string): boolean {
  return /^\d{6,14}$/.test(s);
}

/** Looks like Excel mangled it into scientific notation, e.g. "8.9062E+12". */
function looksScientific(s: string): boolean {
  return /[eE]\+?\d|\./.test(s);
}

function slug(name: string): string {
  return (
    "auto-" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

/** Pieces-per-pack from a pack code like "Frame Hook Long P15" → 15. */
function parseSize(packCode: string): number | null {
  const m = packCode.match(/p\s*0*(\d+)\s*$/i);
  return m ? Number(m[1]) : null;
}

export function parseCatalogText(text: string): ParseOutput {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const delim = lines.some((l) => l.includes("\t")) ? "\t" : ",";

  const items: ImportItem[] = [];
  const byEan = new Map<string, ImportItem>();
  let current: ImportItem | null = null;
  let masters = 0;
  let validPacks = 0;
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(delim).map((c) => c.trim());
    const masterName = cols[1] ?? "";
    const masterEan = cols[2] ?? "";
    const packCode = cols[3] ?? "";
    const packEan = cols[4] ?? "";
    const packName = cols[5] ?? "";
    const priceRaw = cols[7] ?? "";

    // Skip a header row.
    if (
      i === 0 &&
      /ean/i.test(lines[i]) &&
      /(product|pack|name)/i.test(lines[i])
    ) {
      continue;
    }

    const isMaster = masterName && !packCode;
    const isPack = !!packCode;

    if (isMaster) {
      const ean = isValidEan(masterEan) ? masterEan : slug(masterName);
      current = byEan.get(ean) ?? {
        ean,
        name: masterName,
        barcodes: [],
      };
      if (!byEan.has(ean)) {
        byEan.set(ean, current);
        items.push(current);
      }
      masters++;
      continue;
    }

    if (isPack) {
      if (!current) {
        errors.push(`Row ${i + 1}: pack "${packCode}" has no master above it — skipped.`);
        skipped++;
        continue;
      }
      const size = parseSize(packCode);
      if (size == null) {
        errors.push(`Row ${i + 1}: can't read pack size from "${packCode}" — skipped.`);
        skipped++;
        continue;
      }
      if (!packEan || !isValidEan(packEan)) {
        const why = looksScientific(packEan)
          ? "EAN looks broken by Excel (scientific notation)"
          : "missing/invalid EAN";
        errors.push(`Row ${i + 1}: "${packCode}" — ${why} — skipped.`);
        skipped++;
        continue;
      }
      const price = priceRaw && Number.isFinite(Number(priceRaw)) ? Number(priceRaw) : undefined;
      const bc: PackBarcode = {
        ean: packEan,
        size,
        name: packName || packCode,
        price: price !== undefined && price >= 0 ? price : undefined,
      };
      current.barcodes.push(bc);
      validPacks++;
    }
  }

  // Drop masters that ended up with no usable packs (keep ones that already
  // exist as standalone products is fine, but for import we only keep with packs
  // OR a valid primary EAN).
  const kept = items.filter(
    (it) => it.barcodes.length > 0 || isValidEan(it.ean)
  );

  return {
    items: kept,
    summary: { masters, validPacks, skipped, errors: errors.slice(0, 50) },
  };
}
