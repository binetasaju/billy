import { rupees, rupeesExact } from "../utils/formatRupees";

describe("rupees", () => {
  it.each([
    [0, "₹0"],
    [45.5, "₹46"],
    [999, "₹999"],
    [9009, "₹9,009"],
    [12345.6, "₹12,346"],
    [125000, "₹1,25,000"],
    [9876543, "₹98,76,543"],
    [-450, "₹450"],
  ])("%p → %p", (n, expected) => {
    expect(rupees(n as number)).toBe(expected);
  });
});

describe("rupeesExact", () => {
  it.each([
    [1426.67, "₹1,426.67"],
    [9009, "₹9,009"],
    [0.5, "₹0.50"],
    [125000.1, "₹1,25,000.10"],
    [441.665, "₹441.67"],
    [0, "₹0"],
  ])("%p → %p", (n, expected) => {
    expect(rupeesExact(n as number)).toBe(expected);
  });
});
