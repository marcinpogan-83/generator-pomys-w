// Przeniesienie ksztaltow czesci na wspolrzedne arkusza (z obrotem o 90 st.).

import { rotateShape90, translateShape } from './geometry.js';

export const LAYER_CUT = 'CUT';
export const LAYER_ENGRAVE = 'ENGRAVE';

export function placedPart(parts, item) {
  const p = parts[item.pi];
  const map = (shape) => translateShape(item.rot ? rotateShape90(shape, p.h) : shape, item.x, item.y);
  const mapText = (t) => item.rot
    ? { ...t, x: p.h - t.y + item.x, y: t.x + item.y, rot: 90 }
    : { ...t, x: t.x + item.x, y: t.y + item.y, rot: 0 };
  return {
    name: p.name,
    cut: p.cut.map(map),
    engrave: p.engrave.map(map),
    texts: p.texts.map(mapText),
    x: item.x, y: item.y, w: item.w, h: item.h, rot: item.rot, oversize: !!item.oversize
  };
}

export function placedSheet(parts, sheet) {
  return sheet.items.map(it => placedPart(parts, it));
}

// Prostokat obejmujacy wszystkie ksztalty arkusza (kontrola zakresu).
export function sheetBounds(placed) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const part of placed) {
    for (const shape of [...part.cut, ...part.engrave]) {
      for (const [x, y] of shape.pts) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY };
}
