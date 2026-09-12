// Rozkroj (nesting) prostokatow na arkusze.
//
// Algorytm: MaxRects z pelnym podzialem wolnych prostokatow i przycinaniem
// zawartych, uruchamiany dla wielu kombinacji (kolejnosc sortowania x
// heurystyka wyboru miejsca). Wybierana jest kombinacja o najmniejszej liczbie
// arkuszy, a przy remisie ta, ktora zostawia najwiekszy spojny zrzut na
// ostatnim arkuszu.
//
// Odstepy: kazda czesc jest powiekszana o `gap` w obu osiach, a pole robocze
// arkusza o `gap` w prawo i w dol - dzieki temu czesc przy krawedzi zachowuje
// dokladnie `margin`, a miedzy czesciami zostaje dokladnie `gap`.

export const HEURISTICS = ['bssf', 'blsf', 'baf', 'bl', 'cp'];
export const SORTS = ['area', 'maxSide', 'height', 'width', 'perimeter', 'squareness'];

const EPSN = 1e-9;

function newBin(w, h) {
  return { w, h, free: [{ x: 0, y: 0, w, h }], used: [] };
}

function contactScore(bin, x, y, w, h) {
  let score = 0;
  if (x <= EPSN || Math.abs(x + w - bin.w) <= EPSN) score += h;
  if (y <= EPSN || Math.abs(y + h - bin.h) <= EPSN) score += w;
  for (const r of bin.used) {
    if (Math.abs(r.x + r.w - x) <= EPSN || Math.abs(x + w - r.x) <= EPSN) {
      score += overlap1d(r.y, r.y + r.h, y, y + h);
    }
    if (Math.abs(r.y + r.h - y) <= EPSN || Math.abs(y + h - r.y) <= EPSN) {
      score += overlap1d(r.x, r.x + r.w, x, x + w);
    }
  }
  return score;
}

function overlap1d(a0, a1, b0, b1) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function scoreFor(bin, f, x, y, w, h, heuristic) {
  const dw = f.w - w, dh = f.h - h;
  switch (heuristic) {
    case 'blsf': return [Math.max(dw, dh), Math.min(dw, dh)];
    case 'baf':  return [f.w * f.h - w * h, Math.min(dw, dh)];
    case 'bl':   return [y + h, x];
    case 'cp':   return [-contactScore(bin, x, y, w, h), Math.min(dw, dh)];
    case 'bssf':
    default:     return [Math.min(dw, dh), Math.max(dw, dh)];
  }
}

function findPosition(bin, w, h, allowRot, heuristic) {
  let best = null;
  for (const f of bin.free) {
    for (const rot of allowRot ? [false, true] : [false]) {
      const iw = rot ? h : w, ih = rot ? w : h;
      if (iw > f.w + EPSN || ih > f.h + EPSN) continue;
      const [s1, s2] = scoreFor(bin, f, f.x, f.y, iw, ih, heuristic);
      if (!best || s1 < best.s1 - EPSN || (Math.abs(s1 - best.s1) <= EPSN && s2 < best.s2 - EPSN)) {
        best = { x: f.x, y: f.y, w: iw, h: ih, rot, s1, s2 };
      }
    }
  }
  return best;
}

// Dzieli wolny prostokat f prostokatem r; zwraca liste pozostalych fragmentow.
function splitFree(f, r) {
  if (r.x >= f.x + f.w - EPSN || r.x + r.w <= f.x + EPSN ||
      r.y >= f.y + f.h - EPSN || r.y + r.h <= f.y + EPSN) return [f];
  const out = [];
  if (r.x > f.x + EPSN) out.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
  if (r.x + r.w < f.x + f.w - EPSN) out.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
  if (r.y > f.y + EPSN) out.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
  if (r.y + r.h < f.y + f.h - EPSN) out.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
  return out;
}

function contains(a, b) { // czy a zawiera b
  return b.x >= a.x - EPSN && b.y >= a.y - EPSN &&
         b.x + b.w <= a.x + a.w + EPSN && b.y + b.h <= a.y + a.h + EPSN;
}

function prune(free) {
  const out = [];
  for (let i = 0; i < free.length; i++) {
    const a = free[i];
    if (a.w <= EPSN || a.h <= EPSN) continue;
    let covered = false;
    for (let j = 0; j < free.length && !covered; j++) {
      if (i === j) continue;
      const b = free[j];
      if (!contains(b, a)) continue;
      // przy identycznych prostokatach zostawiamy tylko pierwszy
      if (contains(a, b) && j > i) continue;
      covered = true;
    }
    if (!covered) out.push(a);
  }
  return out;
}

function place(bin, r) {
  let free = [];
  for (const f of bin.free) free = free.concat(splitFree(f, r));
  bin.free = prune(free);
  bin.used.push(r);
}

function sortKey(it, mode) {
  switch (mode) {
    case 'maxSide':    return Math.max(it.w, it.h);
    case 'height':     return it.h;
    case 'width':      return it.w;
    case 'perimeter':  return it.w + it.h;
    case 'squareness': return Math.abs(it.w - it.h);
    case 'area':
    default:           return it.w * it.h;
  }
}

function expand(parts) {
  const items = [];
  parts.forEach((p, pi) => {
    for (let i = 0; i < p.qty; i++) items.push({ pi, copy: i, w: p.w, h: p.h });
  });
  return items;
}

function packOnce(items, binW, binH, gap, allowRot, sort, heuristic) {
  const ordered = items
    .map((it, i) => ({ ...it, i }))
    .sort((a, b) => (sortKey(b, sort) - sortKey(a, sort)) ||
                    (Math.max(b.w, b.h) - Math.max(a.w, a.h)) || (a.i - b.i));
  const bins = [];
  const oversize = [];
  for (const it of ordered) {
    const w = it.w + gap, h = it.h + gap;
    const fitsPlain = w <= binW + EPSN && h <= binH + EPSN;
    const fitsRot = allowRot && h <= binW + EPSN && w <= binH + EPSN;
    if (!fitsPlain && !fitsRot) { oversize.push(it); continue; }
    let done = false;
    for (const bin of bins) {
      const pos = findPosition(bin, w, h, allowRot, heuristic);
      if (!pos) continue;
      place(bin, { ...pos, pi: it.pi });
      done = true;
      break;
    }
    if (done) continue;
    const bin = newBin(binW, binH);
    const pos = findPosition(bin, w, h, allowRot, heuristic);
    place(bin, { ...pos, pi: it.pi });
    bins.push(bin);
  }
  return { bins, oversize };
}

function costOf(bins) {
  if (bins.length === 0) return [0, 0, 0];
  const last = bins[bins.length - 1];
  let lastBBox = 0, totalBBox = 0;
  bins.forEach((bin, i) => {
    let maxX = 0, maxY = 0;
    for (const r of bin.used) { maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h); }
    const bbox = maxX * maxY;
    totalBBox += bbox;
    if (bin === last) lastBBox = bbox;
  });
  return [bins.length, lastBBox, totalBBox];
}

function better(a, b) { // czy a lepsze od b
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i] - EPSN) return true;
    if (a[i] > b[i] + EPSN) return false;
  }
  return false;
}

/**
 * @param {Array} parts czesci z modelu (name, qty, w, h)
 * @param {Object} opts {sheetW, sheetH, margin, gap, allowRot, sorts, heuristics}
 */
export function nest(parts, opts) {
  const { sheetW, sheetH, margin = 0, gap = 0, allowRot = true } = opts;
  const sorts = opts.sorts || SORTS;
  const heuristics = opts.heuristics || HEURISTICS;
  const binW = sheetW - 2 * margin + gap;
  const binH = sheetH - 2 * margin + gap;
  const items = expand(parts);

  let best = null;
  if (binW > 0 && binH > 0) {
    for (const sort of sorts) {
      for (const heuristic of heuristics) {
        const run = packOnce(items, binW, binH, gap, allowRot, sort, heuristic);
        const cost = costOf(run.bins);
        if (!best || better(cost, best.cost)) best = { ...run, cost, sort, heuristic };
      }
    }
  }
  if (!best) best = { bins: [], oversize: items.map((it, i) => ({ ...it, i })), cost: [0, 0, 0], sort: sorts[0], heuristic: heuristics[0] };

  const sheets = best.bins.map(bin => ({
    items: bin.used.map(r => ({
      pi: r.pi, x: r.x + margin, y: r.y + margin,
      w: r.w - gap, h: r.h - gap, rot: r.rot, oversize: false
    })),
    free: bin.free.map(f => ({ x: f.x + margin, y: f.y + margin, w: f.w, h: f.h }))
  }));
  for (const it of best.oversize) {
    sheets.push({
      items: [{ pi: it.pi, x: margin, y: margin, w: it.w, h: it.h, rot: false, oversize: true }],
      free: []
    });
  }

  const partArea = items.reduce((a, it) => a + it.w * it.h, 0);
  const sheetArea = sheets.length * sheetW * sheetH;
  return {
    sheets,
    strategy: { sort: best.sort, heuristic: best.heuristic },
    stats: {
      sheetCount: sheets.length,
      itemCount: items.length,
      oversize: best.oversize.length,
      partArea,
      sheetArea,
      utilization: sheetArea > 0 ? partArea / sheetArea : 0
    }
  };
}

// Kontrola poprawnosci rozkroju: nachodzenie czesci, wyjscie poza arkusz,
// naruszenie marginesu i odstepu. Zwraca liste problemow (pusta = OK).
export function validatePlacement(result, opts) {
  const { sheetW, sheetH, margin = 0, gap = 0 } = opts;
  const tol = 1e-6;
  const problems = [];
  result.sheets.forEach((sheet, si) => {
    sheet.items.forEach((a, i) => {
      if (a.oversize) {
        problems.push({ level: 'error', sheet: si, msg: `Czesc #${a.pi} nie miesci sie na arkuszu.` });
        return;
      }
      if (a.x < margin - tol || a.y < margin - tol ||
          a.x + a.w > sheetW - margin + tol || a.y + a.h > sheetH - margin + tol) {
        problems.push({ level: 'error', sheet: si, msg: `Czesc #${a.pi} wychodzi poza pole robocze arkusza.` });
      }
      for (let j = i + 1; j < sheet.items.length; j++) {
        const b = sheet.items[j];
        const ox = overlap1d(a.x, a.x + a.w, b.x, b.x + b.w);
        const oy = overlap1d(a.y, a.y + a.h, b.y, b.y + b.h);
        if (ox > tol && oy > tol) {
          problems.push({ level: 'error', sheet: si, msg: `Czesci #${a.pi} i #${b.pi} nachodza na siebie.` });
        } else if (gap > 0) {
          // odleglosc miedzy prostokatami = wieksza z przerw na obu osiach
          const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
          const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
          if (Math.max(dx, dy) < gap - tol) {
            problems.push({ level: 'warn', sheet: si, msg: `Odstep miedzy czesciami #${a.pi} i #${b.pi} mniejszy niz ${gap} mm.` });
          }
        }
      }
    });
  });
  return problems;
}
