// ---------------------------------------------------------------------------
// services/cropGeometry.ts
//
// Pure geometry for the image editor's crop tool.
//
// The photo is shown "contain"-fitted inside the canvas, so there are empty
// bands beside (or above/below) it. The crop rectangle must therefore be
// expressed as fractions of the DISPLAYED IMAGE, not of the canvas —
// otherwise those bands get counted as image and the saved crop cuts deeper
// than what the user selected.
// ---------------------------------------------------------------------------

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Crop rectangle as 0–1 fractions of the (rotated) image. */
export interface CropFractions {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where an image of imgW×imgH lands when "contain"-fitted and centred in a box. */
export function fitContain(imgW: number, imgH: number, boxW: number, boxH: number): Rect {
  if (!(imgW > 0 && imgH > 0 && boxW > 0 && boxH > 0)) {
    return { left: 0, top: 0, width: Math.max(boxW, 0), height: Math.max(boxH, 0) };
  }
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return { left: (boxW - width) / 2, top: (boxH - height) / 2, width, height };
}

/** Image dimensions after rotating by a multiple of 90°. */
export function rotatedSize(w: number, h: number, rotation: number): { w: number; h: number } {
  const quarterTurn = ((rotation % 360) + 360) % 180 === 90;
  return quarterTurn ? { w: h, h: w } : { w, h };
}

/** Convert crop fractions to whole-pixel crop for expo-image-manipulator. */
export function cropToPixels(crop: CropFractions, imageW: number, imageH: number) {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const x0 = clamp(crop.x, 0, 1);
  const y0 = clamp(crop.y, 0, 1);
  const x1 = clamp(crop.x + crop.w, x0, 1);
  const y1 = clamp(crop.y + crop.h, y0, 1);

  const originX = Math.round(x0 * imageW);
  const originY = Math.round(y0 * imageH);
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(imageW - originX, Math.round(x1 * imageW) - originX)),
    height: Math.max(1, Math.min(imageH - originY, Math.round(y1 * imageH) - originY)),
  };
}
