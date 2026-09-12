// Geometria 2D dla generatora organizera.
//
// Ksztalt (shape) = { pts: [[x, y], ...], closed: bool }
//   closed = true  -> kontur zamkniety, ostatni punkt NIE powtarza pierwszego
//   closed = false -> polilinia otwarta (np. kreska cyfry, wcieta polzakladka)
//
// Rozroznienie jest istotne przy cieciu: zamkniecie otwartej sciezki dokladalo
// dodatkowy przejazd lasera po krawedzi plyty (podwojne ciecie).

export const EPS = 1e-6;

function samePoint(a, b) {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS;
}

// Usuwa kolejne duplikaty punktow; dla konturu zamknietego takze domykajacy
// duplikat na koncu.
export function dedupe(pts, closed) {
  const out = [];
  for (const p of pts) {
    if (out.length === 0 || !samePoint(out[out.length - 1], p)) out.push([p[0], p[1]]);
  }
  while (closed && out.length > 1 && samePoint(out[0], out[out.length - 1])) out.pop();
  return out;
}

export function ring(pts) {
  return { pts: dedupe(pts, true), closed: true };
}

export function path(pts) {
  return { pts: dedupe(pts, false), closed: false };
}

export function rectPath(x, y, w, h) {
  return ring([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
}

export function shapeBounds(shape) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of shape.pts) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function translateShape(shape, dx, dy) {
  return { ...shape, pts: shape.pts.map(([x, y]) => [x + dx, y + dy]) };
}

// Obrot o 90 stopni w prawo w ukladzie ekranowym (y w dol) dla czesci o wys. h.
export function rotateShape90(shape, h) {
  return { ...shape, pts: shape.pts.map(([x, y]) => [h - y, x]) };
}

// Pole powierzchni konturu (dodatnie, niezaleznie od kierunku obiegu).
export function shapeArea(shape) {
  const p = shape.pts;
  if (p.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return Math.abs(a) / 2;
}

// Segmenty ksztaltu jako pary punktow (dla konturu zamknietego domyka obieg).
export function shapeSegments(shape) {
  const segs = [];
  const p = shape.pts;
  const n = shape.closed ? p.length : p.length - 1;
  for (let i = 0; i < n; i++) segs.push([p[i], p[(i + 1) % p.length]]);
  return segs;
}

// Pozycje czopow wzdluz krawedzi o dlugosci len -> [{start, w}].
// Zwraca pusta liste, gdy czopy sie nie miesza (brak dodatniego luzu).
export function tabSpans(len, n, tw) {
  if (n < 1 || tw <= 0) return [];
  const gap = (len - n * tw) / (n + 1);
  if (gap <= 0) return [];
  const out = [];
  let d = 0;
  for (let i = 0; i < n; i++) {
    d += gap;
    out.push({ start: d, w: tw });
    d += tw;
  }
  return out;
}

// Obrys prostokatnej plyty z czopami (pioro) na wybranych krawedziach.
// edges: {top,right,bottom,left} -> null albo {n: liczba czopow, w: szerokosc}
export function panelOutline(w, h, t, edges) {
  const pts = [];
  const sides = [
    { from: [0, 0], dir: [1, 0], nrm: [0, -1], len: w, spec: edges.top },
    { from: [w, 0], dir: [0, 1], nrm: [1, 0], len: h, spec: edges.right },
    { from: [w, h], dir: [-1, 0], nrm: [0, 1], len: w, spec: edges.bottom },
    { from: [0, h], dir: [0, -1], nrm: [-1, 0], len: h, spec: edges.left }
  ];
  for (const s of sides) {
    const [px, py] = s.from;
    const [dx, dy] = s.dir;
    const [nx, ny] = s.nrm;
    pts.push([px, py]);
    if (!s.spec) continue;
    for (const span of tabSpans(s.len, s.spec.n, s.spec.w)) {
      const a = span.start, b = span.start + span.w;
      pts.push([px + dx * a, py + dy * a]);
      pts.push([px + dx * a + nx * t, py + dy * a + ny * t]);
      pts.push([px + dx * b + nx * t, py + dy * b + ny * t]);
      pts.push([px + dx * b, py + dy * b]);
    }
  }
  return ring(pts);
}

// Otwor kluczowy (na leb wkreta) jako JEDEN zamkniety kontur - suma kola i
// pionowego rowka. Wersja z osobnym kolem i prostokatem zostawiala linie
// ciecia w srodku otworu.
export function keyhole(cx, cy, dHead, dShank, drop, segments = 48) {
  const r = dHead / 2;
  const s = Math.min(dShank / 2, r - EPS);
  const aCut = Math.acos(s / r);          // kat, pod ktorym rowek styka kolo
  const yInt = cy + r * Math.sin(aCut);   // y przeciecia (y rosnie w dol)
  const pts = [];
  // luk od prawego przeciecia (ponizej srodka), przez gore, do lewego
  // przeciecia; y rosnie w dol, wiec katy maleja.
  const from = aCut, to = -(Math.PI + aCut);
  const steps = Math.max(8, Math.round(segments * Math.abs(to - from) / (2 * Math.PI)));
  for (let i = 0; i <= steps; i++) {
    const a = from + (to - from) * (i / steps);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  // rowek: lewa sciana w dol, dno, prawa sciana w gore
  pts.push([cx - s, yInt]);
  pts.push([cx - s, cy + drop]);
  pts.push([cx + s, cy + drop]);
  pts.push([cx + s, yInt]);
  return ring(pts);
}

// ---------------------------------------------------------------------------
// FONT KRESKOWY (cyfry) - jednokreskowy, gotowy do grawerowania.
// Kazdy glif to lista OTWARTYCH polilinii (poza '0' i '8', ktore sa petlami).
// ---------------------------------------------------------------------------

export const GLYPHS = {
  '0': [{ closed: true,  pts: [[1,3],[3,1],[7,1],[9,3],[9,13],[7,15],[3,15],[1,13]] }],
  '1': [{ closed: false, pts: [[2,3],[5,1],[5,15]] }],
  '2': [{ closed: false, pts: [[1,4],[3,1],[7,1],[9,4],[9,6],[1,15],[9,15]] }],
  '3': [{ closed: false, pts: [[1,1],[9,1],[5,7]] },
        { closed: false, pts: [[5,7],[9,9],[9,13],[7,15],[3,15],[1,13]] }],
  '4': [{ closed: false, pts: [[7,15],[7,1],[1,10],[9,10]] }],
  '5': [{ closed: false, pts: [[9,1],[2,1],[1,7],[6,6],[9,9],[9,13],[7,15],[3,15],[1,13]] }],
  '6': [{ closed: false, pts: [[8,2],[5,1],[2,3],[1,7],[1,13],[3,15],[7,15],[9,13],[9,9],[7,7],[3,7],[1,9]] }],
  '7': [{ closed: false, pts: [[1,1],[9,1],[4,15]] }],
  '8': [{ closed: false, pts: [[5,7],[2,5],[2,3],[4,1],[6,1],[8,3],[8,5],[5,7],[2,9],[2,13],[4,15],[6,15],[8,13],[8,9],[5,7]] }],
  '9': [{ closed: false, pts: [[2,14],[5,15],[8,13],[9,9],[9,3],[7,1],[3,1],[1,3],[1,6],[3,8],[7,8],[9,6]] }]
};

// Numer jako wektor kreskowy, wysrodkowany poziomo w punkcie x.
export function strokeNumber(n, x, y, size) {
  const s = size / 16, adv = 7 * s, out = [];
  const str = String(n);
  let cx = x - (str.length * adv) / 2;
  for (const ch of str) {
    const g = GLYPHS[ch];
    if (g) {
      for (const stroke of g) {
        const pts = stroke.pts.map(p => [cx + p[0] * s, y + p[1] * s]);
        out.push(stroke.closed ? ring(pts) : path(pts));
      }
    }
    cx += adv;
  }
  return out;
}
