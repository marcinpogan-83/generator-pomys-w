"""Walidacja wyeksportowanych arkuszy DXF przy pomocy ezdxf.

Sprawdza, czy plik jest naprawde rozpoznawany przez czytnik DXF (a nie tylko
"wyglada jak DXF"), czy struktura zgadza sie z manifestem wygenerowanym przez
tools/export-cli.mjs i czy geometria nadaje sie do ciecia.

Uzycie:
    python3 tools/validate_dxf.py out/default [out/inne ...]
"""

from __future__ import annotations

import json
import math
import sys
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import re
import xml.etree.ElementTree as ET

import ezdxf
from ezdxf.audit import Auditor

TOL = 0.02              # tolerancja geometryczna [mm]
COORD_ROUND = 3         # zaokraglenie przy porownywaniu odcinkow

ALLOWED_LAYERS = {"CUT", "ENGRAVE"}
ALLOWED_TYPES = {"POLYLINE", "TEXT"}


@dataclass(frozen=True)
class Problem:
    level: str          # 'error' | 'warn'
    where: str
    msg: str

    def __str__(self) -> str:
        return f"[{self.level}] {self.where}: {self.msg}"


def _seg_key(a, b):
    ka = (round(a[0], COORD_ROUND), round(a[1], COORD_ROUND))
    kb = (round(b[0], COORD_ROUND), round(b[1], COORD_ROUND))
    return (ka, kb) if ka <= kb else (kb, ka)


def _polygon_area(points) -> float:
    area = 0.0
    n = len(points)
    for i in range(n):
        x1, y1 = points[i][0], points[i][1]
        x2, y2 = points[(i + 1) % n][0], points[(i + 1) % n][1]
        area += x1 * y2 - x2 * y1
    return abs(area) / 2


def validate_sheet(dxf_path: Path, spec: dict, sheet: dict) -> list[Problem]:
    """Waliduje jeden arkusz. spec = manifest projektu, sheet = jego wpis."""
    where = dxf_path.name
    problems: list[Problem] = []

    try:
        doc = ezdxf.readfile(dxf_path)
    except IOError as exc:
        return [Problem("error", where, f"nie da sie otworzyc pliku: {exc}")]
    except ezdxf.DXFStructureError as exc:
        return [Problem("error", where, f"niepoprawna struktura DXF: {exc}")]

    auditor = Auditor(doc)
    auditor.run()
    for err in auditor.errors:
        problems.append(Problem("error", where, f"audyt ezdxf: {err}"))
    for fix in auditor.fixes:
        problems.append(Problem("warn", where, f"audyt ezdxf naprawil: {fix}"))

    # --- naglowek ---------------------------------------------------------
    if doc.header.get("$INSUNITS") != 4:
        problems.append(Problem("error", where, "$INSUNITS != 4 (milimetry)"))
    if doc.header.get("$MEASUREMENT") != 1:
        problems.append(Problem("warn", where, "$MEASUREMENT != 1 (metryczne)"))

    # --- warstwy ----------------------------------------------------------
    layers = {layer.dxf.name for layer in doc.layers}
    for name in ALLOWED_LAYERS:
        if name not in layers:
            problems.append(Problem("error", where, f"brak zdefiniowanej warstwy {name}"))

    msp = doc.modelspace()
    entities = list(msp)
    if not entities:
        problems.append(Problem("error", where, "pusta przestrzen modelu"))

    sheet_w = float(spec["nest"]["sheetW"])
    sheet_h = float(spec["nest"]["sheetH"])
    margin = float(spec["nest"].get("margin", 0))

    counts = Counter()
    seg_counter = Counter()
    texts: list[str] = []

    # prostokaty czesci w ukladzie DXF (os Y w gore)
    part_rects = [
        (p["x"], sheet_h - (p["y"] + p["h"]), p["x"] + p["w"], sheet_h - p["y"])
        for p in sheet["parts"]
    ]

    def inside_any_part(x, y) -> bool:
        return any(x0 - TOL <= x <= x1 + TOL and y0 - TOL <= y <= y1 + TOL
                   for x0, y0, x1, y1 in part_rects)

    for e in entities:
        etype = e.dxftype()
        layer = e.dxf.layer
        if etype not in ALLOWED_TYPES:
            problems.append(Problem("error", where, f"nieoczekiwany typ encji {etype}"))
            continue
        if layer not in ALLOWED_LAYERS:
            problems.append(Problem("error", where, f"{etype} na warstwie '{layer}'"))
            continue

        if etype == "TEXT":
            counts["texts"] += 1
            texts.append(e.dxf.text)
            if e.dxf.height <= 0:
                problems.append(Problem("error", where, "tekst o zerowej wysokosci"))
            if layer != "ENGRAVE":
                problems.append(Problem("error", where, "tekst poza warstwa ENGRAVE"))
            x, y = e.dxf.insert.x, e.dxf.insert.y
            if not (margin - TOL <= x <= sheet_w - margin + TOL and margin - TOL <= y <= sheet_h - margin + TOL):
                problems.append(Problem("error", where, f"tekst poza polem roboczym ({x:.2f}, {y:.2f})"))
            continue

        pts = [(p[0], p[1]) for p in e.points()]
        closed = bool(e.is_closed)
        key = "Cut" if layer == "CUT" else "Engrave"
        counts[f"polylines{key}"] += 1
        counts[f"polylines{key}{'Closed' if closed else 'Open'}"] += 1

        if len(pts) < 2:
            problems.append(Problem("error", where, f"polilinia z {len(pts)} wierzcholkami"))
            continue
        if closed and len(pts) < 3:
            problems.append(Problem("error", where, "zamkniety kontur z mniej niz 3 wierzcholkami"))
        if closed and _polygon_area(pts) < 1e-6:
            problems.append(Problem("error", where, "zamkniety kontur o zerowym polu"))

        seq = pts + [pts[0]] if closed else pts
        for a, b in zip(seq, seq[1:]):
            if math.dist(a, b) < 1e-6:
                problems.append(Problem("error", where, f"zerowej dlugosci odcinek w ({a[0]:.2f}, {a[1]:.2f})"))
            if layer == "CUT":
                seg_counter[_seg_key(a, b)] += 1

        for x, y in pts:
            if not (margin - TOL <= x <= sheet_w - margin + TOL and margin - TOL <= y <= sheet_h - margin + TOL):
                problems.append(Problem("error", where, f"geometria poza polem roboczym ({x:.2f}, {y:.2f})"))
                break
        for x, y in pts:
            if not inside_any_part(x, y):
                problems.append(Problem("error", where, f"geometria poza obrysem zadeklarowanej czesci ({x:.2f}, {y:.2f})"))
                break

    # --- podwojne ciecia ---------------------------------------------------
    doubled = [k for k, v in seg_counter.items() if v > 1]
    for seg in doubled[:5]:
        problems.append(Problem("error", where,
                                f"odcinek ciecia wystepuje {seg_counter[seg]}x: {seg[0]} -> {seg[1]}"))
    if len(doubled) > 5:
        problems.append(Problem("error", where, f"...oraz {len(doubled) - 5} innych podwojnych ciec"))

    # --- zgodnosc z manifestem --------------------------------------------
    expected = sheet["counts"]
    for key, want in expected.items():
        got = counts.get(key, 0)
        if got != want:
            problems.append(Problem("error", where, f"{key}: w pliku {got}, w manifescie {want}"))

    if sorted(texts) != sorted(sheet.get("texts", [])):
        problems.append(Problem("error", where, f"teksty: {sorted(texts)} != {sorted(sheet.get('texts', []))}"))

    return problems


LBRN_LAYERS = {"0": "CUT", "1": "ENGRAVE"}


def validate_lbrn(lbrn_path: Path, spec: dict, sheet: dict) -> list[Problem]:
    """Projekt LightBurn musi byc poprawnym XML-em zgodnym z manifestem."""
    where = lbrn_path.name
    problems: list[Problem] = []
    try:
        root = ET.parse(lbrn_path).getroot()
    except ET.ParseError as exc:
        return [Problem("error", where, f"niepoprawny XML: {exc}")]

    if root.tag != "LightBurnProject":
        problems.append(Problem("error", where, f"nieoczekiwany element glowny: {root.tag}"))
    if not root.get("FormatVersion"):
        problems.append(Problem("error", where, "brak atrybutu FormatVersion"))

    layers = {}
    for cs in root.findall("CutSetting"):
        idx = cs.find("index")
        name = cs.find("name")
        if idx is None or name is None:
            problems.append(Problem("error", where, "warstwa bez indeksu albo nazwy"))
            continue
        layers[idx.get("Value")] = name.get("Value")
    for idx, name in LBRN_LAYERS.items():
        if layers.get(idx) != name:
            problems.append(Problem("error", where, f"warstwa {idx} to '{layers.get(idx)}', oczekiwano '{name}'"))

    sheet_w = float(spec["nest"]["sheetW"])
    sheet_h = float(spec["nest"]["sheetH"])
    margin = float(spec["nest"].get("margin", 0))

    counts = {"cut": 0, "engrave": 0, "texts": 0}
    texts: list[str] = []
    for shape in root.findall("Shape"):
        cut_index = shape.get("CutIndex")
        if cut_index not in LBRN_LAYERS:
            problems.append(Problem("error", where, f"ksztalt na nieznanej warstwie {cut_index}"))
            continue
        if shape.get("Type") == "Text":
            counts["texts"] += 1
            texts.append(shape.get("Str", ""))
            if cut_index != "1":
                problems.append(Problem("error", where, "tekst poza warstwa ENGRAVE"))
            continue
        if shape.get("Type") != "Path":
            problems.append(Problem("error", where, f"nieoczekiwany typ ksztaltu {shape.get('Type')}"))
            continue
        counts["cut" if cut_index == "0" else "engrave"] += 1
        verts = re.findall(r"V([-\d.eE]+) ([-\d.eE]+)", shape.findtext("VertList") or "")
        prims = re.findall(r"L(\d+) (\d+)", shape.findtext("PrimList") or "")
        if len(verts) < 2:
            problems.append(Problem("error", where, "sciezka z mniej niz dwoma punktami"))
            continue
        if not prims:
            problems.append(Problem("error", where, "sciezka bez listy odcinkow (PrimList)"))
        for a, b in prims:
            if int(a) >= len(verts) or int(b) >= len(verts):
                problems.append(Problem("error", where, "PrimList wskazuje nieistniejacy wierzcholek"))
                break
        closed = any(int(a) == len(verts) - 1 and int(b) == 0 for a, b in prims)
        if len(prims) != (len(verts) if closed else len(verts) - 1):
            problems.append(Problem("error", where, "liczba odcinkow nie zgadza sie z liczba punktow"))
        for x, y in ((float(a), float(b)) for a, b in verts):
            if not (margin - TOL <= x <= sheet_w - margin + TOL and margin - TOL <= y <= sheet_h - margin + TOL):
                problems.append(Problem("error", where, f"geometria poza polem roboczym ({x:.2f}, {y:.2f})"))
                break

    expected = sheet["counts"]
    if counts["cut"] != expected["polylinesCut"]:
        problems.append(Problem("error", where, f"sciezki CUT: {counts['cut']} != {expected['polylinesCut']}"))
    if counts["engrave"] != expected["polylinesEngrave"]:
        problems.append(Problem("error", where, f"sciezki ENGRAVE: {counts['engrave']} != {expected['polylinesEngrave']}"))
    if counts["texts"] != expected["texts"]:
        problems.append(Problem("error", where, f"teksty: {counts['texts']} != {expected['texts']}"))
    if sorted(texts) != sorted(sheet.get("texts", [])):
        problems.append(Problem("error", where, f"tresc tekstow: {sorted(texts)} != {sorted(sheet.get('texts', []))}"))
    return problems


def validate_export(out_dir: Path) -> list[Problem]:
    out_dir = Path(out_dir)
    manifest_path = out_dir / "manifest.json"
    if not manifest_path.exists():
        return [Problem("error", str(out_dir), "brak manifest.json - najpierw uruchom tools/export-cli.mjs")]
    spec = json.loads(manifest_path.read_text(encoding="utf-8"))

    problems: list[Problem] = []
    for issue in spec.get("issues", []):
        if issue.get("level") == "error":
            problems.append(Problem("error", "manifest", issue.get("msg", "")))

    if not spec["sheets"]:
        problems.append(Problem("error", "manifest", "eksport bez arkuszy"))

    for sheet in spec["sheets"]:
        dxf_path = out_dir / sheet["dxf"]
        if not dxf_path.exists():
            problems.append(Problem("error", sheet["dxf"], "brak pliku DXF"))
            continue
        problems.extend(validate_sheet(dxf_path, spec, sheet))
        svg_path = out_dir / sheet["svg"]
        if svg_path.exists():
            problems.extend(compare_with_svg(svg_path, dxf_path, spec, sheet))
        else:
            problems.append(Problem("warn", sheet["svg"], "brak pliku SVG do porownania"))
        if sheet.get("lbrn"):
            lbrn_path = out_dir / sheet["lbrn"]
            if lbrn_path.exists():
                problems.extend(validate_lbrn(lbrn_path, spec, sheet))
            else:
                problems.append(Problem("error", sheet["lbrn"], "brak pliku LightBurn"))
    return problems


def _svg_path_points(svg_text: str):
    """Wyciaga punkty ze sciezek <path d="M..L..">; zwraca liste list."""
    import re
    paths = re.findall(r'<path d="([^"]+)"', svg_text)
    out = []
    for d in paths:
        closed = d.endswith("Z")
        body = d[1:-1] if closed else d[1:]
        pts = []
        for chunk in body.split("L"):
            x, y = chunk.split(",")
            pts.append((float(x), float(y)))
        out.append((pts, closed))
    return out


def compare_with_svg(svg_path: Path, dxf_path: Path, spec: dict, sheet: dict) -> list[Problem]:
    """SVG i DXF musza opisywac te sama geometrie (DXF ma odbita os Y)."""
    problems: list[Problem] = []
    where = f"{svg_path.name} vs {dxf_path.name}"
    sheet_h = float(spec["nest"]["sheetH"])

    svg_shapes = _svg_path_points(svg_path.read_text(encoding="utf-8"))
    doc = ezdxf.readfile(dxf_path)
    dxf_shapes = [([(p[0], p[1]) for p in e.points()], bool(e.is_closed))
                  for e in doc.modelspace() if e.dxftype() == "POLYLINE"]

    if len(svg_shapes) != len(dxf_shapes):
        problems.append(Problem("error", where,
                                f"rozna liczba konturow: SVG {len(svg_shapes)}, DXF {len(dxf_shapes)}"))
        return problems

    def prepared(pts, closed, flip):
        norm = sorted(((x, sheet_h - y if flip else y) for x, y in pts),
                      key=lambda q: (q[0], q[1]))
        cx = sum(q[0] for q in norm) / len(norm)
        cy = sum(q[1] for q in norm) / len(norm)
        return {"closed": closed, "pts": norm, "c": (cx, cy)}

    svg_prepared = [prepared(p, c, True) for p, c in svg_shapes]
    dxf_prepared = [prepared(p, c, False) for p, c in dxf_shapes]

    # Parowanie po najblizszym srodku ciezkosci - pliki opisuja te sama
    # geometrie z inna precyzja zapisu, wiec porownujemy z tolerancja.
    free = list(range(len(dxf_prepared)))
    for a in svg_prepared:
        best, best_d = None, None
        for idx in free:
            b = dxf_prepared[idx]
            if b["closed"] != a["closed"] or len(b["pts"]) != len(a["pts"]):
                continue
            d = math.dist(a["c"], b["c"])
            if best_d is None or d < best_d:
                best, best_d = idx, d
        if best is None:
            problems.append(Problem("error", where,
                                    f"kontur SVG (zamkniety={a['closed']}, {len(a['pts'])} pkt) nie ma odpowiednika w DXF"))
            return problems
        b = dxf_prepared[best]
        free.remove(best)
        worst = max(math.dist(p, q) for p, q in zip(a["pts"], b["pts"]))
        if worst > TOL:
            problems.append(Problem("error", where,
                                    f"wierzcholki SVG i DXF rozjezdzaja sie o {worst:.3f} mm"))
            return problems

    return problems


def main(argv: list[str]) -> int:
    dirs = argv[1:] or ["out/default"]
    total_errors = 0
    for d in dirs:
        problems = validate_export(Path(d))
        errors = [p for p in problems if p.level == "error"]
        total_errors += len(errors)
        print(f"== {d}: {len(errors)} bledow, {len(problems) - len(errors)} ostrzezen")
        for p in problems:
            print(f"   {p}")
        if not problems:
            print("   OK")
    return 1 if total_errors else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
