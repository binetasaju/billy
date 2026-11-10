// ---------------------------------------------------------------------------
// services/receiptLayout.ts
//
// Rebuilds receipt ROWS from ML Kit's positioned text.
//
// ML Kit's plain `result.text` is ordered block-by-block. On a columnar
// receipt that often means every item NAME comes first, then every QTY, then
// every PRICE — so the parser can no longer tell which price belongs to which
// item. Every ML Kit line carries a bounding box, so we regroup lines that sit
// on the same horizontal band into one row, ordered left → right:
//
//   ML Kit text            rebuilt rows
//   ───────────            ───────────────────────────
//   Paneer Tikka           Paneer Tikka  1  280.00
//   Butter Naan            Butter Naan  4  240.00
//   1                      CGST 2.5%  13.00
//   4
//   280.00
//   240.00
//
// Cells are joined with TWO spaces so the column-style regexes in the local
// fallback parser (which split on \s{2,}) keep working.
// ---------------------------------------------------------------------------

export interface LayoutFrame {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface LayoutLine {
  text: string;
  frame?: LayoutFrame;
}

export interface LayoutBlock {
  lines: LayoutLine[];
}

interface PlacedLine {
  text: string;
  left: number;
  centerY: number;
  height: number;
}

interface Row {
  centerY: number;
  height: number;
  cells: PlacedLine[];
}

/**
 * Group positioned lines into visual rows.
 *
 * Returns null when there is no usable position data, so callers can fall
 * back to ML Kit's plain text.
 */
export function rebuildReceiptRows(blocks: LayoutBlock[]): string | null {
  const placed: PlacedLine[] = [];
  let missingFrames = 0;

  for (const block of blocks ?? []) {
    for (const line of block.lines ?? []) {
      const text = line.text?.trim();
      if (!text) continue;
      const f = line.frame;
      if (!f || !(f.height > 0)) {
        missingFrames++;
        continue;
      }
      placed.push({ text, left: f.left, centerY: f.top + f.height / 2, height: f.height });
    }
  }

  if (placed.length === 0 || missingFrames > placed.length) return null;

  placed.sort((a, b) => a.centerY - b.centerY || a.left - b.left);

  const rows: Row[] = [];
  for (const line of placed) {
    // Lines belong to the same row when their vertical centres are within
    // half a line-height of each other. Compare against the most recent rows
    // only — rows are created top-to-bottom.
    let target: Row | undefined;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 3; i--) {
      const row = rows[i];
      const tolerance = Math.min(row.height, line.height) * 0.5;
      if (Math.abs(row.centerY - line.centerY) <= tolerance) {
        target = row;
        break;
      }
    }

    if (target) {
      const n = target.cells.length;
      target.centerY = (target.centerY * n + line.centerY) / (n + 1);
      target.height = Math.max(target.height, line.height);
      target.cells.push(line);
    } else {
      rows.push({ centerY: line.centerY, height: line.height, cells: [line] });
    }
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY)
    .map((row) =>
      row.cells
        .sort((a, b) => a.left - b.left)
        .map((c) => c.text)
        .join("  ")
    )
    .join("\n");
}

/**
 * Turn a money-like value into a number.
 * Handles numbers, "1,250.00", "₹ 250", "Rs. 99", "-0.48", "(20.00)".
 * Returns null when nothing numeric can be read.
 */
export function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  let s = value.trim();
  if (!s) return null;

  // Accounting-style negatives: (20.00)
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }

  s = s.replace(/₹|\bINR\b|\bRs\.?/gi, "").replace(/,/g, "").replace(/\s+/g, "");
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
