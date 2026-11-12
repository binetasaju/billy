// ---------------------------------------------------------------------------
// utils/qrMatrix.ts — QR code as rows of dark runs, for drawing with Views
// ---------------------------------------------------------------------------
import QRCode from "qrcode";

export interface QrRuns {
  /** Modules per side (without the quiet zone). */
  count: number;
  /** For each row: [startColumn, length] of every run of dark modules. */
  rows: [number, number][][];
}

export function qrRuns(text: string): QrRuns {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: "M" });
  const count = modules.size;
  const rows: [number, number][][] = [];
  for (let y = 0; y < count; y++) {
    const runs: [number, number][] = [];
    let start = -1;
    for (let x = 0; x <= count; x++) {
      const dark = x < count && !!modules.get(y, x);
      if (dark && start < 0) start = x;
      if (!dark && start >= 0) {
        runs.push([start, x - start]);
        start = -1;
      }
    }
    rows.push(runs);
  }
  return { count, rows };
}
