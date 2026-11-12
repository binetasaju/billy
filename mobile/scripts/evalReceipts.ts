// ---------------------------------------------------------------------------
// scripts/evalReceipts.ts — score receipt extraction on real receipts
//
//   npm run eval:receipts                 # every case in receipt-tests/
//   npm run eval:receipts -- --mode text  # OCR text only (the old way)
//   npm run eval:receipts -- dosa-cafe    # one case
//
// Each case in receipt-tests/ is a set of files with the same name:
//   <name>.jpg / .jpeg / .png   the receipt photo
//   <name>.expected.json        the right answer (see receipt-tests/README.md)
//   <name>.ocr.txt              optional: the phone's OCR text, copied from the
//                               "[MLKIT] OCR Text" lines in the Metro terminal
//
// Uses the same prompt and parser as the app (services/parseBill.ts) and the
// Gemini key from mobile/.env. One Gemini call per case.
// ---------------------------------------------------------------------------
import * as fs from "fs";
import * as path from "path";
import { parseBill } from "../services/parseBill";
import { scoreReceipt, type ExpectedBill, type ReceiptScore } from "./receiptScore";

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "receipt-tests");
const IMAGE_EXT = [".jpg", ".jpeg", ".png"];

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

function parseArgs(argv: string[]) {
  let mode: "photo" | "text" = "photo";
  const only: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") mode = argv[++i] === "text" ? "text" : "photo";
    else only.push(argv[i]);
  }
  return { mode, only };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

async function main() {
  loadEnv();
  if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY) {
    console.error("No EXPO_PUBLIC_GEMINI_API_KEY in mobile/.env");
    process.exit(1);
  }
  const { mode, only } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(DIR)) {
    console.error(`No ${path.relative(process.cwd(), DIR)}/ folder. See receipt-tests/README.md.`);
    process.exit(1);
  }

  const cases = fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".expected.json"))
    .map((f) => f.replace(/\.expected\.json$/, ""))
    .filter((name) => only.length === 0 || only.includes(name))
    .sort();
  if (cases.length === 0) {
    console.error("No cases found (need <name>.expected.json files).");
    process.exit(1);
  }

  // The parser logs a lot; keep only the results.
  const log = console.log;
  console.log = () => {};
  console.warn = () => {};
  console.error = () => {};

  const results: { name: string; score?: ReceiptScore; note?: string; ms: number }[] = [];
  for (const name of cases) {
    const expected: ExpectedBill = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.expected.json`), "utf8"));
    const ocrFile = path.join(DIR, `${name}.ocr.txt`);
    const ocrText = fs.existsSync(ocrFile) ? fs.readFileSync(ocrFile, "utf8") : "";
    const image = IMAGE_EXT.map((e) => path.join(DIR, name + e)).find((f) => fs.existsSync(f));

    if (mode === "text" && !ocrText) {
      results.push({ name, note: "skipped (no .ocr.txt)", ms: 0 });
      continue;
    }
    if (mode === "photo" && !image) {
      results.push({ name, note: "skipped (no photo)", ms: 0 });
      continue;
    }

    const start = Date.now();
    const bill = await parseBill(ocrText, mode === "photo" && image
      ? { imageBase64: fs.readFileSync(image).toString("base64") }
      : {});
    const ms = Date.now() - start;
    results.push({
      name,
      score: scoreReceipt(expected, bill as any),
      note: bill.extractionNote ? `offline fallback: ${bill.extractionNote}` : undefined,
      ms,
    });
  }

  console.log = log;
  log(`\nReceipt extraction — mode: ${mode}\n`);
  for (const r of results) {
    if (!r.score) {
      log(`  ${r.name.padEnd(28)} ${r.note}`);
      continue;
    }
    const s = r.score;
    log(
      `  ${r.name.padEnd(28)} total ${s.totalOk ? "✓" : "✗"}  items ${s.matched}/${s.expected}` +
        (s.extracted !== s.matched ? ` (+${s.extracted - s.matched} wrong)` : "") +
        (s.chargesOk === null ? "" : `  charges ${s.chargesOk ? "✓" : "✗"}`) +
        `  ${(r.ms / 1000).toFixed(1)}s`
    );
    if (r.note) log(`      ${r.note}`);
    for (const m of s.missing) log(`      missing: ${m}`);
    for (const e of s.extra) log(`      wrong:   ${e}`);
  }

  const scored = results.filter((r) => r.score).map((r) => r.score!);
  if (scored.length) {
    const totals = scored.filter((s) => s.totalOk).length;
    const perfect = scored.filter((s) => s.totalOk && s.matched === s.expected && s.extracted === s.expected).length;
    const exp = scored.reduce((a, s) => a + s.expected, 0);
    const got = scored.reduce((a, s) => a + s.extracted, 0);
    const hit = scored.reduce((a, s) => a + s.matched, 0);
    log(
      `\n  ${scored.length} receipts · totals right ${totals}/${scored.length} · perfect ${perfect}/${scored.length}` +
        ` · items found ${pct(exp ? hit / exp : 1)} · items correct ${pct(got ? hit / got : 1)}\n`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
