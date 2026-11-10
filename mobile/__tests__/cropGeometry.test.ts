import { cropToPixels, fitContain, rotatedSize } from "../services/cropGeometry";

describe("fitContain", () => {
  it("centres a tall photo in a wider canvas with side bands", () => {
    // 1000×3000 receipt photo in a 400×600 canvas -> 200×600, 100px bands each side
    expect(fitContain(1000, 3000, 400, 600)).toEqual({ left: 100, top: 0, width: 200, height: 600 });
  });
  it("centres a wide photo with top/bottom bands", () => {
    expect(fitContain(4000, 3000, 400, 600)).toEqual({ left: 0, top: 150, width: 400, height: 300 });
  });
  it("falls back to the full box for unknown sizes", () => {
    expect(fitContain(0, 0, 400, 600)).toEqual({ left: 0, top: 0, width: 400, height: 600 });
  });
});

describe("rotatedSize", () => {
  it.each([[0, 1000, 3000], [90, 3000, 1000], [180, 1000, 3000], [270, 3000, 1000], [-90, 3000, 1000]])(
    "rotation %p",
    (rot, w, h) => expect(rotatedSize(1000, 3000, rot)).toEqual({ w, h })
  );
});

describe("cropToPixels", () => {
  it("selecting the whole visible photo keeps the whole photo (the over-crop bug)", () => {
    // User drags the box exactly to the photo edges. With the fix the crop is
    // measured against the photo itself, so that's 0→1 of the image.
    expect(cropToPixels({ x: 0, y: 0, w: 1, h: 1 }, 1000, 3000)).toEqual({
      originX: 0, originY: 0, width: 1000, height: 3000,
    });
  });

  it("maps fractions of the image to pixels", () => {
    expect(cropToPixels({ x: 0.1, y: 0.25, w: 0.5, h: 0.5 }, 1000, 3000)).toEqual({
      originX: 100, originY: 750, width: 500, height: 1500,
    });
  });

  it("clamps to the image and never returns an empty crop", () => {
    expect(cropToPixels({ x: -0.2, y: 0.9, w: 2, h: 0.5 }, 1000, 1000)).toEqual({
      originX: 0, originY: 900, width: 1000, height: 100,
    });
    expect(cropToPixels({ x: 1, y: 1, w: 0, h: 0 }, 1000, 1000).width).toBe(1);
  });

  it("does not exceed the image when rounding", () => {
    const c = cropToPixels({ x: 0.3333, y: 0.3333, w: 0.6667, h: 0.6667 }, 999, 1001);
    expect(c.originX + c.width).toBeLessThanOrEqual(999);
    expect(c.originY + c.height).toBeLessThanOrEqual(1001);
  });
});
