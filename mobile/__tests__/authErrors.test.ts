import { authErrorCode, friendlyAuthError } from "../services/auth/authErrors";

describe("friendlyAuthError", () => {
  it("reads the code from `code`", () => {
    const e = Object.assign(new Error("boom"), { code: "auth/billing-not-enabled" });
    expect(authErrorCode(e)).toBe("auth/billing-not-enabled");
    expect(friendlyAuthError(e, "x")).toMatch(/SMS service isn't switched on/);
  });

  it("reads the code from a '[auth/...]' message", () => {
    const e = new Error("[auth/billing-not-enabled] An internal error has occurred. [ BILLING_NOT_ENABLED ]");
    expect(friendlyAuthError(e, "x")).toMatch(/SMS service/);
  });

  it("maps a wrong code", () => {
    const e = new Error("[auth/invalid-verification-code] The verification code is invalid.");
    expect(friendlyAuthError(e, "x")).toBe("That code is wrong. Check the SMS and try again.");
  });

  it("uses the fallback for unknown Firebase codes", () => {
    expect(friendlyAuthError(new Error("[auth/something-new] raw"), "Could not sign in.")).toBe("Could not sign in.");
  });

  it("keeps our own readable errors", () => {
    expect(friendlyAuthError(new Error("Enter a valid 10-digit number."), "x")).toBe("Enter a valid 10-digit number.");
  });
});
