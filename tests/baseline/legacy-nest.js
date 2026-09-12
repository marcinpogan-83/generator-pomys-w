// Oryginalny algorytm rozkroju z legacy/organizer-secure-generator.original.html.
// Sluzy wylacznie jako punkt odniesienia w testach porownawczych - nie jest
// uzywany przez aplikacje.

function makeSheet(sheetW, sheetH, margin) {
  return { items: [], free: [{ x: margin, y: margin, w: sheetW - 2 * margin, h: sheetH - 2 * margin }] };
}

function findSpot(sheet, w, h, allowRot) {
  let best = null;
  for (const f of sheet.free) {
    for (const rot of allowRot ? [false, true] : [false]) {
      const iw = rot ? h : w, ih = rot ? w : h;
      if (iw > f.w || ih > f.h) continue;
      const short = Math.min(f.w - iw, f.h - ih);
      const long = Math.max(f.w - iw, f.h - ih);
      if (!best || short < best.short || (short === best.short && long < best.long)) {
        best = { x: f.x, y: f.y, w: iw, h: ih, rot, short, long };
      }
    }
  }
  return best;
}

function occupy(sheet, r) {
  const next = [];
  for (const f of sheet.free) {
    if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
      next.push(f); continue;
    }
    if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
    if (r.x + r.w < f.x + f.w) next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
    if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
    if (r.y + r.h < f.y + f.h) next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
  }
  sheet.free = next.filter((a, i) => a.w > 1 && a.h > 1 &&
    !next.some((b, j) => i !== j && a.x >= b.x && a.y >= b.y &&
      a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h && (b.w * b.h > a.w * a.h || j < i)));
}

export function legacyNest(parts, sheetW, sheetH, margin, gap, allowRot) {
  const items = [];
  parts.forEach((p, pi) => { for (let i = 0; i < p.qty; i++) items.push({ pi, w: p.w, h: p.h }); });
  items.sort((a, b) => (b.w * b.h) - (a.w * a.h) || Math.max(b.w, b.h) - Math.max(a.w, a.h));

  const sheets = [];
  for (const it of items) {
    const w = it.w + gap, h = it.h + gap;
    let done = false;
    for (const sh of sheets) {
      const spot = findSpot(sh, w, h, allowRot);
      if (spot) { sh.items.push({ pi: it.pi, x: spot.x, y: spot.y, w: spot.w - gap, h: spot.h - gap, rot: spot.rot }); occupy(sh, spot); done = true; break; }
    }
    if (done) continue;
    const sh = makeSheet(sheetW, sheetH, margin);
    const spot = findSpot(sh, w, h, allowRot);
    if (spot) { sh.items.push({ pi: it.pi, x: spot.x, y: spot.y, w: spot.w - gap, h: spot.h - gap, rot: spot.rot }); occupy(sh, spot); }
    else sh.items.push({ pi: it.pi, x: margin, y: margin, w: it.w, h: it.h, rot: false, oversize: true });
    sheets.push(sh);
  }
  return sheets;
}
