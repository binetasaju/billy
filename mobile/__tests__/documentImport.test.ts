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
import { parseBill } from "../services/parseBill";
import { billStore } from "../services/billStore";
import { extractBillFromPdf, isPdf, MAX_PDF_BYTES, pickBillDocument } from "../services/documentImport";

const parse = parseBill as jest.Mock;
const pick = DocumentPicker.getDocumentAsync as jest.Mock;

beforeAll(() => jest.spyOn(console, "log").mockImplementation(() => {}));

describe("documentImport", () => {
  it("recognises PDFs by type or name", () => {
    expect(isPdf("bill.PDF", null)).toBe(true);
    expect(isPdf("x", "application/pdf")).toBe(true);
    expect(isPdf("photo.jpg", "image/jpeg")).toBe(false);
  });

  it("picker: PDF → pdf, image → photo flow, cancel → null", async () => {
    pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 }] });
    expect(await pickBillDocument()).toEqual({ kind: "pdf", uri: "file:///a.pdf", name: "a.pdf", size: 10 });
    pick.mockResolvedValueOnce({ canceled: false, assets: [{ uri: "file:///b.jpg", name: "b.jpg", mimeType: "image/jpeg" }] });
    expect(await pickBillDocument()).toEqual({ kind: "image", uri: "file:///b.jpg" });
    pick.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickBillDocument()).toBeNull();
  });

  it("sends the PDF to the parser and puts the bill in the store", async () => {
    parse.mockResolvedValueOnce({ isBill: true, restaurant: "Swiggy", items: [{ name: "Biryani", price: 300, amount: 300 }], charges: [], total: 300 });
    await extractBillFromPdf("file:///a.pdf", 1000);
    expect(parse).toHaveBeenCalledWith("", { imageBase64: "JVBERi0xLjQK", mimeType: "application/pdf" });
    const state = billStore.get();
    expect(state?.bill.items[0].name).toBe("Biryani");
    expect(state?.bill.items[0].id).toBeTruthy();
  });

  it("refuses files that are too big", async () => {
    await expect(extractBillFromPdf("file:///big.pdf", MAX_PDF_BYTES + 1)).rejects.toThrow(/too big/);
  });

  it("explains when the AI is unavailable instead of showing an empty bill", async () => {
    parse.mockResolvedValueOnce({ isBill: true, items: [], charges: [], total: 0, extractionNote: "offline" });
    await expect(extractBillFromPdf("file:///a.pdf", 1000)).rejects.toThrow(/AI service is unavailable/);
  });

  it("not a bill → notABill error", async () => {
    parse.mockResolvedValueOnce({ isBill: false, items: [], charges: [], total: 0 });
    await expect(extractBillFromPdf("file:///a.pdf", 1000)).rejects.toMatchObject({ notABill: true });
  });
});
