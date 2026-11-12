import { base64UrlToUtf8, BILL_QUERY, htmlToText, messageText, senderName } from "../services/gmailBills";

const toB64Url = (s: string) =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("Gmail bill helpers", () => {
  it("decodes base64url UTF-8 (₹, emoji, accents)", () => {
    const s = "Total ₹1,250.00 — café 🍕";
    expect(base64UrlToUtf8(toB64Url(s))).toBe(s);
  });

  it("turns an HTML order table into one line per row", () => {
    const html = `<html><head><style>td{color:red}</style></head><body>
      <table><tr><td>Chicken Biryani</td><td>x 2</td><td>&#8377;&nbsp;560.00</td></tr>
      <tr><td>Coke</td><td>x 1</td><td>&#x20b9;60</td></tr></table>
      <p>Grand Total&nbsp;&nbsp;<b>&#8377;620</b></p><!-- tracking --></body></html>`;
    expect(htmlToText(html)).toBe("Chicken Biryani x 2 ₹ 560.00\nCoke x 1 ₹60\nGrand Total ₹620");
  });

  it("prefers the HTML part of a multipart email", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/plain", body: { data: toB64Url("View your order online") } },
        { mimeType: "text/html", body: { data: toB64Url("<div>Paneer Tikka</div><div>₹280</div>") } },
      ],
    };
    expect(messageText(payload)).toBe("Paneer Tikka\n₹280");
  });

  it("falls back to text/plain", () => {
    expect(messageText({ mimeType: "text/plain", body: { data: toB64Url("Dosa 90\nTotal 90\n") } })).toBe("Dosa 90\nTotal 90");
  });

  it("sender display names", () => {
    expect(senderName('"Swiggy" <noreply@swiggy.in>')).toBe("Swiggy");
    expect(senderName("Zomato Order <order@zomato.com>")).toBe("Zomato Order");
    expect(senderName("auto-confirm@amazon.in")).toBe("auto-confirm");
  });

  it("searches only order-like emails from known senders", () => {
    expect(BILL_QUERY).toContain("swiggy.in");
    expect(BILL_QUERY).toContain("subject:(order");
    expect(BILL_QUERY).toContain("newer_than:90d");
  });
});
