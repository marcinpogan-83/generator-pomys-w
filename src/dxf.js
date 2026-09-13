// Eksport arkusza do DXF R12 (AC1009) - format rozpoznawany przez LightBurn,
// LaserCut, Inkscape i biblioteke ezdxf.
//
// W przeciwienstwie do pierwszej wersji plik zawiera komplet sekcji
// (HEADER, TABLES, ENTITIES), zdefiniowane warstwy CUT/ENGRAVE oraz poprawnie
// oznaczone kontury zamkniete (70 = 1) i otwarte (70 = 0). Uklad DXF ma os Y
// skierowana w gore, wiec wspolrzedne sa odbijane wzgledem wysokosci arkusza.

import { placedSheet, sheetBounds, LAYER_CUT, LAYER_ENGRAVE } from './layout.js';

export const DXF_VERSION = 'AC1009';

const LAYERS = [
  { name: LAYER_CUT, color: 1 },      // czerwony - ciecie
  { name: LAYER_ENGRAVE, color: 3 }   // zielony - grawer
];

function emitter() {
  const out = [];
  return {
    tag(code, value) { out.push(String(code)); out.push(String(value)); },
    num(code, value) { out.push(String(code)); out.push(Number(value).toFixed(4)); },
    dump() { return out.join('\r\n') + '\r\n'; }
  };
}

function header(e, bounds) {
  e.tag(0, 'SECTION'); e.tag(2, 'HEADER');
  e.tag(9, '$ACADVER'); e.tag(1, DXF_VERSION);
  e.tag(9, '$INSUNITS'); e.tag(70, 4);          // 4 = milimetry
  e.tag(9, '$MEASUREMENT'); e.tag(70, 1);       // 1 = metryczne
  e.tag(9, '$LUNITS'); e.tag(70, 2);            // 2 = dziesietne
  e.tag(9, '$EXTMIN'); e.num(10, bounds.minX); e.num(20, bounds.minY); e.num(30, 0);
  e.tag(9, '$EXTMAX'); e.num(10, bounds.maxX); e.num(20, bounds.maxY); e.num(30, 0);
  e.tag(0, 'ENDSEC');
}

// Nazwa stylu DXF R12: bez spacji i znakow specjalnych, wielkimi literami.
export function styleName(font) {
  const raw = String(font || '').trim();
  if (!raw) return 'STANDARD';
  const name = raw.toUpperCase().replace(/[^A-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31);
  return name || 'STANDARD';
}

// Style uzywane przez teksty arkusza (zawsze z domyslnym STANDARD).
function stylesOf(placed) {
  const styles = new Map([['STANDARD', 'txt']]);
  for (const part of placed) {
    for (const t of part.texts) {
      if (!t.font) continue;
      styles.set(styleName(t.font), `${t.font}.ttf`);
    }
  }
  return styles;
}

function tables(e, styles) {
  e.tag(0, 'SECTION'); e.tag(2, 'TABLES');

  e.tag(0, 'TABLE'); e.tag(2, 'LTYPE'); e.tag(70, 1);
  e.tag(0, 'LTYPE'); e.tag(2, 'CONTINUOUS'); e.tag(70, 64);
  e.tag(3, 'Solid line'); e.tag(72, 65); e.tag(73, 0); e.num(40, 0);
  e.tag(0, 'ENDTAB');

  e.tag(0, 'TABLE'); e.tag(2, 'LAYER'); e.tag(70, LAYERS.length);
  for (const l of LAYERS) {
    e.tag(0, 'LAYER'); e.tag(2, l.name); e.tag(70, 0); e.tag(62, l.color); e.tag(6, 'CONTINUOUS');
  }
  e.tag(0, 'ENDTAB');

  e.tag(0, 'TABLE'); e.tag(2, 'STYLE'); e.tag(70, styles.size);
  for (const [name, file] of styles) {
    e.tag(0, 'STYLE'); e.tag(2, name); e.tag(70, 0);
    e.num(40, 0); e.num(41, 1); e.num(50, 0); e.tag(71, 0); e.num(42, 2.5);
    e.tag(3, file); e.tag(4, '');
  }
  e.tag(0, 'ENDTAB');

  e.tag(0, 'ENDSEC');
}

/**
 * Arkusz -> tekst DXF.
 * @param {Object} sheet wynik nest()
 * @param {Array} parts czesci modelu
 * @param {Object} opts {sheetW, sheetH}
 */
export function sheetDxf(sheet, parts, opts) {
  const { sheetH } = opts;
  const placed = placedSheet(parts, sheet);
  const fy = (y) => sheetH - y;                 // odbicie osi Y

  const e = emitter();
  const b = sheetBounds(placed);
  const bounds = Number.isFinite(b.minX)
    ? { minX: b.minX, minY: fy(b.maxY), maxX: b.maxX, maxY: fy(b.minY) }
    : { minX: 0, minY: 0, maxX: opts.sheetW || 0, maxY: sheetH };

  header(e, bounds);
  tables(e, stylesOf(placed));

  e.tag(0, 'SECTION'); e.tag(2, 'ENTITIES');

  const polyline = (shape, layer) => {
    if (shape.pts.length < 2) return;
    e.tag(0, 'POLYLINE'); e.tag(8, layer); e.tag(66, 1); e.tag(70, shape.closed ? 1 : 0);
    e.num(10, 0); e.num(20, 0); e.num(30, 0);
    for (const [x, y] of shape.pts) {
      e.tag(0, 'VERTEX'); e.tag(8, layer);
      e.num(10, x); e.num(20, fy(y)); e.num(30, 0);
    }
    e.tag(0, 'SEQEND'); e.tag(8, layer);
  };

  for (const part of placed) {
    for (const s of part.cut) polyline(s, LAYER_CUT);
    for (const s of part.engrave) polyline(s, LAYER_ENGRAVE);
    for (const t of part.texts) {
      e.tag(0, 'TEXT'); e.tag(8, LAYER_ENGRAVE); e.tag(7, styleName(t.font));
      e.num(10, t.x); e.num(20, fy(t.y)); e.num(30, 0);
      e.num(40, t.size);
      e.tag(1, String(t.text == null ? '' : t.text));
      e.num(50, t.rot ? 360 - t.rot : 0);        // DXF liczy katy przeciwnie do SVG
      e.tag(72, 1);                              // wyrownanie do srodka
      e.num(11, t.x); e.num(21, fy(t.y)); e.num(31, 0);
    }
  }

  e.tag(0, 'ENDSEC');
  e.tag(0, 'EOF');
  return e.dump();
}

// Opis zawartosci arkusza - podstawa automatycznej walidacji (ezdxf) i testow.
export function sheetManifest(sheet, parts, opts) {
  const placed = placedSheet(parts, sheet);
  let cutClosed = 0, cutOpen = 0, engClosed = 0, engOpen = 0, textCount = 0;
  const texts = [];
  for (const part of placed) {
    for (const s of part.cut) (s.closed ? cutClosed++ : cutOpen++);
    for (const s of part.engrave) (s.closed ? engClosed++ : engOpen++);
    for (const t of part.texts) { textCount++; texts.push(t.text); }
  }
  const b = sheetBounds(placed);
  return {
    sheetW: opts.sheetW, sheetH: opts.sheetH, margin: opts.margin, gap: opts.gap,
    parts: placed.map(p => ({ name: p.name, x: p.x, y: p.y, w: p.w, h: p.h, rot: p.rot })),
    counts: {
      polylinesCut: cutClosed + cutOpen,
      polylinesCutClosed: cutClosed,
      polylinesCutOpen: cutOpen,
      polylinesEngrave: engClosed + engOpen,
      polylinesEngraveClosed: engClosed,
      polylinesEngraveOpen: engOpen,
      texts: textCount
    },
    texts,
    bounds: Number.isFinite(b.minX) ? b : null
  };
}
