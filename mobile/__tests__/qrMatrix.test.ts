import QRCode from "qrcode";
import { qrRuns } from "../utils/qrMatrix";
import { buildUpiUri } from "../services/upi";

describe("qrRuns", () => {
  const uri = buildUpiUri({ upiId: "asha@okaxis", receiverName: "Asha", amount: 245.5, note: "Dinner" });

  it("covers exactly the dark modules of the QR code", () => {
    const { count, rows } = qrRuns(uri);
    const { modules } = QRCode.create(uri, { errorCorrectionLevel: "M" });
    expect(count).toBe(modules.size);
    expect(rows).toHaveLength(count);
    for (let y = 0; y < count; y++) {
      const dark = new Set<number>();
      for (const [x, len] of rows[y]) for (let i = 0; i < len; i++) dark.add(x + i);
      for (let x = 0; x < count; x++) expect(dark.has(x)).toBe(!!modules.get(y, x));
    }
  });

  it("merges neighbours into runs (finder pattern row starts with a run of 7)", () => {
    const { rows } = qrRuns(uri);
    expect(rows[0][0]).toEqual([0, 7]);
  });
});
