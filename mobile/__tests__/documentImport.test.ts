jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(async () => ({ exists: true, size: 1000 })),
  readAsStringAsync: jest.fn(async () => "JVBERi0xLjQK"),
}));
jest.mock("../services/parseBill", () => ({ parseBill: jest.fn() }));

import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { zipSync, strToU8 } from "fflate";
import { parseBill } from "../services/parseBill";
import { billStore } from "../services/billStore";
import {
  classifyBillFile,
  extractBillFromFile,
  htmlToText,
  isPdf,
  looksLikeText,
  MAX_FILE_BYTES,
  MAX_PDF_BYTES,
  officeToText,
  pickBillDocument,
  type BillFile,
} from "../services/documentImport";

const parse = parseBill as jest.Mock;
const pick = DocumentPicker.getDocumentAsync as jest.Mock;
const read = FileSystem.readAsStringAsync as jest.Mock;

const BILL = { isBill: true, restaurant: "Swiggy", items: [{ name: "Biryani", price: 300, amount: 300 }], charges: [], total: 300 };
const file = (name: string, mimeType: string | null = null, size = 1000): BillFile => ({ uri: `file:///${name}`, name, mimeType, size });
const b64 = (u8: Uint8Array) => Buffer.from(u8).toString("base64");

beforeAll(() => jest.spyOn(console, "log").mockImplementation(() => {}));
beforeEach(() => {
  parse.mockReset();
  read.mockReset().mockResolvedValue("JVBERi0xLjQK");
});

describe("classifyBillFile", () => {
  it.each([
    ["bill.PDF", null, "pdf"],
    ["x", "application/pdf", "pdf"],
    ["photo.jpg", "image/jpeg", "image"],
    ["scan.HEIC", null, "image"],
    ["x", "image/webp", "image"],
    ["order.eml", "message/rfc822", "html"],
    ["page.html", null, "html"],
    ["x", "text/html", "html"],
    ["bill.txt", null, "text"],
    ["bill.csv", "text/csv", "text"],
    ["x", "text/plain", "text"],
    ["invoice.docx", null, "office"],
    ["sheet.xlsx", null, "office"],
    ["bill.odt", null, "office"],
    ["x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "office"],
    ["old.doc", null, "legacyOffice"],
    ["old.xls", "application/vnd.ms-excel", "legacyOffice"],
    ["mystery.bin", "application/octet-stream", "unknown"],
  ])("%s (%s) → %s", (name, mime, kind) => {
    expect(classifyBillFile(name, mime)).toBe(kind);
  });

  it("isPdf still works", () => {
    expect(isPdf("bill.PDF", null)).toBe(true);
    expect(isPdf("photo.jpg", "image/jpeg")).toBe(false);
  });
});

describe("pickBillDocument", () => {
  it("accepts any file: image → photo flow, everything else → file, cancel → null", async () => {
    pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 }] });
    expect(await pickBillDocument()).toEqual({ kind: "file", uri: "file:///a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 });
    expect(pick).toHaveBeenLastCalledWith(expect.objectContaining({ type: "*/*" }));

    pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///b.png", name: "b.png", mimeType: "image/png" }] });
    expect(await pickBillDocument()).toEqual({ kind: "image", uri: "file:///b.png" });

    pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///c.docx", name: "c.docx" }] });
    expect(await pickBillDocument()).toEqual({ kind: "file", uri: "file:///c.docx", name: "c.docx", mimeType: null, size: null });

    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickBillDocument()).toBeNull();
  });
});

describe("PDF bills", () => {
  it("sends the PDF to the parser and puts the bill in the store", async () => {
    parse.mockResolvedValueOnce({ ...BILL });
    await extractBillFromFile(file("a.pdf", "application/pdf"));
    expect(parse).toHaveBeenCalledWith("", { imageBase64: "JVBERi0xLjQK", mimeType: "application/pdf" });
    const state = billStore.get();
    expect(state?.bill.items[0].name).toBe("Biryani");
    expect(state?.bill.items[0].id).toBeTruthy();
  });

  it("refuses PDFs that are too big", async () => {
    await expect(extractBillFromFile(file("big.pdf", null, MAX_PDF_BYTES + 1))).rejects.toThrow(/too big/);
  });

  it("explains when the AI is unavailable instead of showing an empty bill", async () => {
    parse.mockResolvedValueOnce({ isBill: true, items: [], charges: [], total: 0, extractionNote: "offline" });
    await expect(extractBillFromFile(file("a.pdf"))).rejects.toThrow(/AI service is unavailable/);
  });

  it("not a bill → notABill error", async () => {
    parse.mockResolvedValueOnce({ isBill: false, items: [], charges: [], total: 0 });
    await expect(extractBillFromFile(file("a.pdf"))).rejects.toMatchObject({ notABill: true });
  });
});

describe("text-like bills", () => {
  it("a text file's text goes to the parser", async () => {
    read.mockResolvedValueOnce("Biryani   300\r\n\r\n\r\n\r\nTotal    300");
    parse.mockResolvedValueOnce({ ...BILL });
    await extractBillFromFile(file("bill.txt"));
    expect(parse).toHaveBeenCalledWith("Biryani 300\n\nTotal 300");
  });

  it("a saved email / web page is reduced to its visible text", async () => {
    read.mockResolvedValueOnce(
      "<html><head><style>td{color:red}</style></head><body><table><tr><td>Paneer&nbsp;Tikka</td><td>&#8377;250</td></tr>" +
        "<tr><td>Total</td><td>&#x20B9;250</td></tr></table><script>x()</script></body></html>"
    );
    parse.mockResolvedValueOnce({ ...BILL });
    await extractBillFromFile(file("order.eml", "message/rfc822"));
    expect(parse.mock.calls[0][0]).toBe("Paneer Tikka\t₹250\nTotal\t₹250");
  });

  it("decodes quoted-printable emails", () => {
    expect(htmlToText("<p>Caf=C3=A9 Latte =E2=82=B9180</p>")).toBe("Café Latte ₹180");
  });

  it("text works offline: the parser's note is kept, not an error", async () => {
    read.mockResolvedValueOnce("Tea 20\nTotal 20");
    parse.mockResolvedValueOnce({ ...BILL, extractionNote: "read offline" });
    await expect(extractBillFromFile(file("bill.csv"))).resolves.toBeUndefined();
    expect(billStore.get()?.bill.extractionNote).toBe("read offline");
  });

  it("an empty file is explained", async () => {
    read.mockResolvedValueOnce("   \n ");
    await expect(extractBillFromFile(file("empty.txt"))).rejects.toThrow(/empty/);
  });

  it("refuses files that are too big", async () => {
    await expect(extractBillFromFile(file("huge.txt", null, MAX_FILE_BYTES + 1))).rejects.toThrow(/too big/);
  });
});

describe("Office files", () => {
  const docx = zipSync({
    "word/document.xml": strToU8(
      '<w:document><w:body><w:p><w:r><w:t>Masala Dosa</w:t></w:r><w:r><w:tab/><w:t>120</w:t></w:r></w:p>' +
        "<w:p><w:r><w:t>Total &amp; GST</w:t></w:r></w:p></w:body></w:document>"
    ),
  });
  const xlsx = zipSync({
    "xl/sharedStrings.xml": strToU8("<sst><si><t>Item</t></si><si><t>Coffee</t></si><si><r><t>Total</t></r></si></sst>"),
    "xl/worksheets/sheet1.xml": strToU8(
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Price</t></is></c></row>' +
        '<row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>90.5</v></c></row>' +
        '<row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>90.5</v></c></row></sheetData></worksheet>'
    ),
  });
  const odt = zipSync({
    "content.xml": strToU8("<office:document-content><text:p>Idli 60</text:p><text:p>Total 60</text:p></office:document-content>"),
  });

  it("reads a .docx", () => {
    expect(officeToText(docx)).toBe("Masala Dosa\t120\nTotal & GST");
  });

  it("reads an .xlsx (shared and inline strings, numbers)", () => {
    expect(officeToText(xlsx)).toBe("Item\tPrice\nCoffee\t90.5\nTotal\t90.5");
  });

  it("reads an .odt", () => {
    expect(officeToText(odt)).toBe("Idli 60\nTotal 60");
  });

  it("sends the document's text to the parser", async () => {
    read.mockResolvedValueOnce(b64(docx));
    parse.mockResolvedValueOnce({ ...BILL });
    await extractBillFromFile(file("invoice.docx"));
    expect(read).toHaveBeenCalledWith("file:///invoice.docx", expect.objectContaining({ encoding: "base64" }));
    expect(parse).toHaveBeenCalledWith("Masala Dosa\t120\nTotal & GST");
  });

  it("a broken zip is explained", () => {
    expect(() => officeToText(strToU8("not a zip"))).toThrow(/couldn't be opened/);
  });

  it("old .doc / .xls files ask for a newer format", async () => {
    await expect(extractBillFromFile(file("old.doc"))).rejects.toThrow(/Old \.doc files/);
    expect(parse).not.toHaveBeenCalled();
  });
});

describe("unknown file types", () => {
  it("reads them when they turn out to be text", async () => {
    read.mockResolvedValueOnce("Pizza 400\nTotal 400");
    parse.mockResolvedValueOnce({ ...BILL });
    await extractBillFromFile(file("receipt.dat", "application/octet-stream"));
    expect(parse).toHaveBeenCalledWith("Pizza 400\nTotal 400");
  });

  it("explains when they are binary", async () => {
    read.mockResolvedValueOnce("\u0000\u0001PK\u0003\u0004��\u0000garbage");
    await expect(extractBillFromFile(file("thing.bin"))).rejects.toThrow(/can't read \.bin files/);
  });

  it("looksLikeText", () => {
    expect(looksLikeText("Total 300\n")).toBe(true);
    expect(looksLikeText("\u0000\u0000\u0001\u0002")).toBe(false);
    expect(looksLikeText("")).toBe(false);
  });
});
