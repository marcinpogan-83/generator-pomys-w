// Pomocnicze funkcje geometryczne uzywane tylko w testach.

export function segIntersect(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-12) return false;               // rownolegle
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  const e = 1e-9;
  return t > e && t < 1 - e && u > e && u < 1 - e;
}

// Czy kontur przecina sam siebie (poza wspolnymi koncami sasiednich odcinkow).
export function selfIntersects(shape) {
  const pts = shape.pts;
  const n = shape.closed ? pts.length : pts.length - 1;
  const seg = i => [pts[i], pts[(i + 1) % pts.length]];
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (shape.closed && i === 0 && j === n - 1) continue;
      const [a, b] = seg(i), [c, d] = seg(j);
      if (segIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function allPoints(shapes) {
  return shapes.flatMap(s => s.pts);
}

export function boundsOf(shapes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of allPoints(shapes)) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

// Klucz odcinka niezalezny od kierunku - do wykrywania podwojnych ciec.
export function segKey(a, b) {
  const f = v => v.toFixed(4);
  const k1 = `${f(a[0])},${f(a[1])}`, k2 = `${f(b[0])},${f(b[1])}`;
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

// Czy punkt lezy wewnatrz wieloboku (parzystosc przeciec promienia).
export function pointInPolygon(pt, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > pt[1]) !== (yj > pt[1])) &&
        (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Najmniejsza odleglosc punktu do krawedzi wieloboku.
export function distToPolygon(pt, poly) {
  const seg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    let t = L2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  let m = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) m = Math.min(m, seg(pt, poly[j], poly[i]));
  return m;
}
