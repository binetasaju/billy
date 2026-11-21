import { parseUpiResponse } from "../services/upiResult";

describe("parseUpiResponse", () => {
  it("success with a reference", () => {
    expect(parseUpiResponse("txnId=AXI123&responseCode=00&Status=SUCCESS&txnRef=BILLY9")).toEqual({
      outcome: "success",
      reference: "BILLY9",
    });
  });
  it("is case-insensitive and reads ApprovalRefNo", () => {
    expect(parseUpiResponse("status=success&ApprovalRefNo=4567")).toEqual({ outcome: "success", reference: "4567" });
  });
  it("failure", () => {
    expect(parseUpiResponse("txnId=X&responseCode=ZD&Status=FAILURE&txnRef=R").outcome).toBe("failure");
  });
  it("submitted / pending", () => {
    expect(parseUpiResponse("Status=SUBMITTED&txnRef=R").outcome).toBe("submitted");
  });
  it("response code 00 alone counts as success", () => {
    expect(parseUpiResponse("responseCode=00&txnId=T1").outcome).toBe("success");
  });
  it("no reply → unknown (Billy asks the person)", () => {
    expect(parseUpiResponse("").outcome).toBe("unknown");
    expect(parseUpiResponse(undefined).outcome).toBe("unknown");
    expect(parseUpiResponse("garbage").outcome).toBe("unknown");
  });
});
