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
        
        if (looksScientific(packEan)) {
          errors.push(
            `Row ${i + 1}: "${packCode}" — EAN looks broken by Excel (scientific notation) — kept as a pack size only.`
          );
        }
        if (size > 1) {
          if (!current.comboSizes) current.comboSizes = [];
          if (!current.comboSizes.includes(size)) {
            current.comboSizes.push(size);
            validPacks++;
          }
        }
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
    (it) =>
      it.barcodes.length > 0 ||
      (it.comboSizes?.length ?? 0) > 0 ||
      isValidEan(it.ean)
  );

  return {
    items: kept,
    summary: { masters, validPacks, skipped, errors: errors.slice(0, 50) },
  };
}

/** A plausible scannable code that may be alphanumeric (e.g. an Amazon ASIN
 *  "B0H2W2Y61M"). 6–14 letters/digits. */
function isValidCode(s: string): boolean {
  return /^[A-Za-z0-9]{6,14}$/.test(s);
}

/**
 * Parse the B2B catalog format: three columns per row —
 *   0 ASIN (pack/listing code) | 1 Pack size | 2 product code (12NC or SKU)
 * Rows are grouped by the code into one master product each; every ASIN becomes
 * a pack barcode of its size. All products get the given `brand`.
 */
export function parseAsinCatalog(text: string, brand?: string): ParseOutput {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  const delim = lines.some((l) => l.includes("\t")) ? "\t" : ",";
  const br = brand?.trim() || undefined;

  const byEan = new Map<string, ImportItem>();
  const items: ImportItem[] = [];
  let validPacks = 0;
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const cols = lines[i].split(delim).map((c) => c.trim());
    // Skip a header row.
    if (i === 0 && /asin/i.test(lines[i])) continue;

    const asin = cols[0] ?? "";
    const sizeRaw = cols[1] ?? "";
    const twelve = (cols[2] ?? "").replace(/\s+/g, "");

    if (!asin && !twelve) continue;
    // Master product code: numeric 12NC (Philips) OR alphanumeric SKU (Wipro,
    // e.g. "CL0004", "NW-AV12WTPNDD") — 3–24 chars, letters/digits/hyphen.
    if (!twelve || !/^[A-Za-z0-9][A-Za-z0-9-]{2,23}$/.test(twelve)) {
      errors.push(`Row ${i + 1}: missing / invalid product code — skipped.`);
      skipped++;
      continue;
    }
    const size = Math.floor(Number(sizeRaw) || 0);
    if (!Number.isInteger(size) || size <= 0) {
      errors.push(`Row ${i + 1}: bad pack size "${sizeRaw}" for ${twelve} — skipped.`);
      skipped++;
      continue;
    }
    if (!isValidCode(asin)) {
      errors.push(`Row ${i + 1}: ASIN "${asin}" looks invalid — skipped.`);
      skipped++;
      continue;
    }

    let item = byEan.get(twelve);
    if (!item) {
      item = {
        ean: twelve,
        name: br ? `${br} ${twelve}` : `Product ${twelve}`,
        brand: br,
        barcodes: [],
      };
      byEan.set(twelve, item);
      items.push(item);
    }
    if (item.barcodes.some((b) => b.ean === asin)) continue; // de-dupe ASIN
    item.barcodes.push({
      ean: asin,
      size,
      name: size === 1 ? twelve : `${twelve}_${size}`,
    });
    validPacks++;
  }

  return {
    items,
    summary: { masters: items.length, validPacks, skipped, errors: errors.slice(0, 50) },
  };
}
