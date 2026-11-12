import { isValidPhoneNumber, normalizePhoneNumber } from "../utils/normalizePhoneNumber";
import { buildPaymentRequestMessage, buildUpiUri, isValidUpiId } from "../services/upi";
import { recalculateBillTotals } from "../services/recalculateBillTotals";
import type { ParsedBill } from "../types/bill";

describe("normalizePhoneNumber", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["(987) 654-3210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["+1 (415) 555-0100", "+14155550100"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each([undefined, null, "", "   ", "abc", "000"])("returns undefined for %p", (input) => {
    expect(normalizePhoneNumber(input as any)).toBeUndefined();
  });
});

describe("isValidPhoneNumber", () => {
  it.each(["9876543210", "98765 43210", "+91 98765-43210", "098765 43210", "919876543210", "6000000000", "+1 415 555 0100"])(
    "accepts %s",
    (v) => expect(isValidPhoneNumber(v)).toBe(true)
  );
  it.each(["", "1234567", "987654321", "98765432101", "5876543210", "0000000000", "+91 12345", "+12345", "abc"])(
    "rejects %p",
    (v) => expect(isValidPhoneNumber(v)).toBe(false)
  );
});

describe("isValidUpiId", () => {
  it.each(["ravi@okaxis", "ravi.k-99@ybl", " name_1@paytm "])("accepts %s", (v) => {
    expect(isValidUpiId(v)).toBe(true);
  });
  it.each(["", "ravi", "@okaxis", "ravi@", "ravi@1bank", "r@okaxis", "ravi okaxis@ybl"])("rejects %p", (v) => {
    expect(isValidUpiId(v)).toBe(false);
  });
});

describe("recalculateBillTotals", () => {
  const bill = (items: number[], charges: { name: string; amount: number }[]): ParsedBill =>
    ({
      isBill: true,
      restaurant: "",
      items: items.map((price, i) => ({ id: `i${i}`, name: `i${i}`, price, amount: price, quantity: 1, confidence: 1 })),
      charges,
      subtotal: 0,
      total: 0,
    }) as unknown as ParsedBill;

  it("recomputes subtotal, total and categorised charges", () => {
    const r = recalculateBillTotals(
      bill([100, 50], [
        { name: "CGST", amount: 5 },
        { name: "SGST", amount: 5 },
        { name: "Service Charge", amount: 15 },
        { name: "Discount", amount: -20 },
      ])
    );
    expect(r.subtotal).toBe(150);
    expect(r.total).toBe(155);
    expect(r.gst).toBe(10);
    expect(r.serviceCharge).toBe(15);
    expect(r.discount).toBe(-20);
    expect(r.tip).toBeNull();
  });

  it("never returns a negative total", () => {
    expect(recalculateBillTotals(bill([10], [{ name: "Discount", amount: -50 }])).total).toBe(0);
  });
});

describe("buildUpiUri", () => {
  it("follows the UPI deep-link format", () => {
    expect(buildUpiUri({ upiId: " ravi@okaxis ", receiverName: "Ravi K", amount: 250, note: "Dinner & drinks" })).toBe(
      "upi://pay?pa=ravi%40okaxis&pn=Ravi%20K&am=250.00&cu=INR&tn=Dinner%20%26%20drinks"
    );
  });
  it("omits the note when there is none", () => {
    expect(buildUpiUri({ upiId: "a@ybl", receiverName: "A", amount: 1.5 })).toBe("upi://pay?pa=a%40ybl&pn=A&am=1.50&cu=INR");
  });
});

describe("buildPaymentRequestMessage", () => {
  const base = { payerName: "Anu", requesterName: "Ravi", amount: 340, billTitle: "Pizza Hut" };
  it("includes a one-tap UPI link when the requester has a UPI ID", () => {
    const msg = buildPaymentRequestMessage({ ...base, requesterUpiId: "ravi@okaxis" });
    expect(msg).toContain('Hi Anu, your share for "Pizza Hut" is ₹340.00.');
    expect(msg).toContain("Pay Ravi on UPI: ravi@okaxis");
    expect(msg).toContain("upi://pay?pa=ravi%40okaxis&pn=Ravi&am=340.00&cu=INR&tn=Pizza%20Hut");
  });
  it("still works without a (valid) UPI ID", () => {
    for (const upi of [undefined, null, "not-a-upi"]) {
      const msg = buildPaymentRequestMessage({ ...base, requesterUpiId: upi });
      expect(msg).toContain("₹340.00");
      expect(msg).not.toContain("upi://");
    }
  });
});

describe("buildBillShareMessage", () => {
  const base = {
    title: "Dinner",
    date: "10 Nov 2026",
    total: 1325,
    payerName: "Asha",
    payerUpiId: "asha@okbank",
    rows: [
      { name: "Ravi", amount: 435, status: "pending" as const },
      { name: "Anu", amount: 441.666, status: "paid" as const },
    ],
  };

  it("lists every share with its status and the payer's UPI ID", () => {
    const msg = require("../services/upi").buildBillShareMessage(base);
    expect(msg).toContain("🧾 Dinner · 10 Nov 2026");
    expect(msg).toContain("Bill total: ₹1325");
    expect(msg).toContain("Paid by Asha");
    expect(msg).toContain("• Ravi — ₹435 (pending)");
    expect(msg).toContain("• Anu — ₹441.67 (✓ paid)");
    expect(msg).toContain("Pay Asha on UPI: asha@okbank");
  });

  it("leaves out the UPI line when nobody still has to pay", () => {
    const msg = require("../services/upi").buildBillShareMessage({
      ...base,
      rows: base.rows.map((r) => ({ ...r, status: "paid" as const })),
    });
    expect(msg).not.toContain("on UPI");
  });

  it("mentions a closed bill", () => {
    const msg = require("../services/upi").buildBillShareMessage({ ...base, closed: true });
    expect(msg).toContain("closed");
  });
});

describe("bill link", () => {
  const { billLink, buildBillShareMessage } = require("../services/upi");

  it("points at the bill page", () => {
    expect(billLink("group_123_abc")).toBe("https://billy-ed9eb.web.app/bill/group_123_abc");
  });

  it("carries the invite code for cloud bills", () => {
    expect(billLink("b1", "abc123")).toBe("https://billy-ed9eb.web.app/bill/b1?c=abc123");
  });

  it("is included in the shared message", () => {
    const msg = buildBillShareMessage({
      title: "Dinner", date: "10 Nov 2026", total: 100, payerName: "Asha",
      rows: [], link: billLink("g1"),
    });
    expect(msg).toContain("Open in Billy: https://billy-ed9eb.web.app/bill/g1");
  });
});

describe("WhatsApp invites", () => {
  const { buildPersonInviteMessage, whatsappChatLink } = require("../services/upi");

  it("writes a personal message with the share and link", () => {
    expect(buildPersonInviteMessage({ name: "Ravi Kumar", billTitle: "Dinner", share: 435, link: "https://x/bill/1?c=a" }))
      .toBe('Hi Ravi! Here\'s our bill "Dinner" on Billy. Your share is ₹435. Tap to join and pay: https://x/bill/1?c=a');
    expect(buildPersonInviteMessage({ name: "Anu", billTitle: "Cab", share: 250.5, link: "L" })).toContain("₹250.50");
    expect(buildPersonInviteMessage({ name: "Joe", billTitle: "Cab", link: "L" })).not.toContain("share");
  });

  it("opens WhatsApp to the right number", () => {
    expect(whatsappChatLink("+91 98765 43210", "hi")).toBe("https://wa.me/919876543210?text=hi");
    expect(whatsappChatLink("9876543210", "hi")).toBe("https://wa.me/919876543210?text=hi");
    expect(whatsappChatLink("+1 (415) 555-0100", "a b")).toBe("https://wa.me/14155550100?text=a%20b");
    expect(whatsappChatLink("09876543210", "hi")).toBe("https://wa.me/919876543210?text=hi");
    expect(whatsappChatLink("12345", "hi")).toBeNull();
    expect(whatsappChatLink(undefined, "hi")).toBeNull();
  });
});
