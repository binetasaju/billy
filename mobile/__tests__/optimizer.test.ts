import { boxToPixelCrop, parseCropBox } from "../services/optimizer";

describe("parseCropBox", () => {
  it("reads Gemini's native box_2d on a 0–1000 scale", () => {
    expect(parseCropBox('{"box_2d": [100, 200, 900, 800]}')).toEqual({ yMin: 0.1, xMin: 0.2, yMax: 0.9, xMax: 0.8 });
  });
  it("accepts a bare array, code fences and a wrapped list", () => {
    expect(parseCropBox("[100, 200, 900, 800]")).toEqual({ yMin: 0.1, xMin: 0.2, yMax: 0.9, xMax: 0.8 });
    expect(parseCropBox('```json\n{"box_2d":[100,200,900,800]}\n```')).toEqual({ yMin: 0.1, xMin: 0.2, yMax: 0.9, xMax: 0.8 });
    expect(parseCropBox('[{"box_2d":[100,200,900,800],"label":"receipt"}]')).toEqual({ yMin: 0.1, xMin: 0.2, yMax: 0.9, xMax: 0.8 });
  });
  it("accepts other key names for the box (real Gemini reply used \"box\")", () => {
    expect(parseCropBox('{"box": [149, 312, 851, 689]}')).toEqual({ yMin: 0.149, xMin: 0.312, yMax: 0.851, xMax: 0.689 });
  });
  it("accepts the old 0–1 object format", () => {
    expect(parseCropBox('{"yMin":0.1,"xMin":0.2,"yMax":0.9,"xMax":0.8}')).toEqual({ yMin: 0.1, xMin: 0.2, yMax: 0.9, xMax: 0.8 });
  });
  it("rejects junk and tiny boxes", () => {
    expect(parseCropBox(undefined)).toBeNull();
    expect(parseCropBox("no idea")).toBeNull();
    expect(parseCropBox('{"box_2d":[500,500,510,510]}')).toBeNull();
    expect(parseCropBox('{"box_2d":[1,2,3]}')).toBeNull();
  });
  it("clamps out-of-range values", () => {
    expect(parseCropBox('{"box_2d":[-50,100,1200,900]}')).toEqual({ yMin: 0, xMin: 0.1, yMax: 1, xMax: 0.9 });
  });
});

describe("boxToPixelCrop", () => {
  it("crops to the box with 2% padding", () => {
    expect(boxToPixelCrop({ yMin: 0.1, xMin: 0.2, yMax: 0.9, xMax: 0.8 }, 1000, 2000)).toEqual({
      originX: 180, originY: 160, width: 640, height: 1680,
    });
  });
  it("skips cropping when the receipt already fills the photo", () => {
    expect(boxToPixelCrop({ yMin: 0, xMin: 0.01, yMax: 1, xMax: 0.99 }, 1000, 2000)).toBeNull();
  });
  it("never goes outside the image", () => {
    const c = boxToPixelCrop({ yMin: 0, xMin: 0.5, yMax: 1, xMax: 1 }, 999, 1001)!;
    expect(c.originX + c.width).toBeLessThanOrEqual(999);
    expect(c.originY + c.height).toBeLessThanOrEqual(1001);
  });
});
