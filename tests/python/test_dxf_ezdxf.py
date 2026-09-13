"""Walidacja DXF czytnikiem ezdxf - plik musi byc rozpoznawalny i zgodny z modelem."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import ezdxf
import pytest
from ezdxf.audit import Auditor

from conftest import EXPORTS, RACK_EXPORTS, ROOT, run_export
from validate_dxf import validate_export, validate_sheet


def errors(problems):
    return [str(p) for p in problems if p.level == "error"]


@pytest.mark.parametrize("name", sorted(EXPORTS))
def test_eksport_przechodzi_pelna_walidacje(exports, name):
    problems = validate_export(exports[name])
    assert errors(problems) == []


@pytest.mark.parametrize("name", sorted(EXPORTS))
def test_ezdxf_otwiera_plik_i_audyt_nie_zglasza_bledow(exports, name):
    manifest = json.loads((exports[name] / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["sheets"], "eksport bez arkuszy"
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(exports[name] / sheet["dxf"])
        assert doc.dxfversion == "AC1009"
        assert doc.header["$INSUNITS"] == 4
        auditor = Auditor(doc)
        auditor.run()
        assert list(auditor.errors) == []
        assert list(auditor.fixes) == []
        layers = {layer.dxf.name for layer in doc.layers}
        assert {"CUT", "ENGRAVE"} <= layers


def test_warstwy_odpowiadaja_przeznaczeniu(exports):
    manifest = json.loads((exports["default"] / "manifest.json").read_text(encoding="utf-8"))
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(exports["default"] / sheet["dxf"])
        for e in doc.modelspace():
            assert e.dxf.layer in {"CUT", "ENGRAVE"}
            if e.dxftype() == "TEXT":
                assert e.dxf.layer == "ENGRAVE"


def test_kontury_ciecia_sa_zamkniete_tam_gdzie_powinny(exports):
    """Obrysy plyt musza byc zamkniete - inaczej element nie odpadnie od arkusza."""
    manifest = json.loads((exports["default"] / "manifest.json").read_text(encoding="utf-8"))
    total_closed = 0
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(exports["default"] / sheet["dxf"])
        closed = [e for e in doc.modelspace()
                  if e.dxftype() == "POLYLINE" and e.dxf.layer == "CUT" and e.is_closed]
        assert len(closed) == sheet["counts"]["polylinesCutClosed"]
        assert len(closed) >= len(sheet["parts"]), "kazda czesc potrzebuje zamknietego obrysu"
        total_closed += len(closed)
    assert total_closed > 0


def test_tekst_naglowka_trafia_do_dxf(exports):
    manifest = json.loads((exports["default"] / "manifest.json").read_text(encoding="utf-8"))
    found = []
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(exports["default"] / sheet["dxf"])
        found += [e.dxf.text for e in doc.modelspace() if e.dxftype() == "TEXT"]
    assert found, "naglowek wlaczony - tekst musi byc w DXF"
    assert set(found) == {manifest["config"]["schoolName"], manifest["config"]["className"]}


def test_eksport_bez_naglowka_nie_ma_tekstu(exports):
    manifest = json.loads((exports["jedna-kolumna"] / "manifest.json").read_text(encoding="utf-8"))
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(exports["jedna-kolumna"] / sheet["dxf"])
        assert [e for e in doc.modelspace() if e.dxftype() == "TEXT"] == []


def test_blokada_obrotu_jest_respektowana_w_eksporcie(exports):
    manifest = json.loads((exports["szeroki-arkusz"] / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["nest"]["allowRot"] is False
    for sheet in manifest["sheets"]:
        assert all(part["rot"] is False for part in sheet["parts"])


def test_geometria_miesci_sie_w_polu_roboczym(exports):
    manifest = json.loads((exports["default"] / "manifest.json").read_text(encoding="utf-8"))
    margin = manifest["nest"]["margin"]
    w, h = manifest["nest"]["sheetW"], manifest["nest"]["sheetH"]
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(exports["default"] / sheet["dxf"])
        for e in doc.modelspace():
            if e.dxftype() != "POLYLINE":
                continue
            for p in e.points():
                assert margin - 0.02 <= p[0] <= w - margin + 0.02
                assert margin - 0.02 <= p[1] <= h - margin + 0.02


# --- testy negatywne: czy walidator w ogole potrafi cokolwiek wykryc --------

def _prepare(tmp_path: Path, exports: dict[str, Path]) -> tuple[Path, dict, dict]:
    work = tmp_path / "kopia"
    shutil.copytree(exports["default"], work)
    manifest = json.loads((work / "manifest.json").read_text(encoding="utf-8"))
    return work, manifest, manifest["sheets"][0]


def test_walidator_wykrywa_encje_na_zlej_warstwie(tmp_path, exports):
    work, manifest, sheet = _prepare(tmp_path, exports)
    path = work / sheet["dxf"]
    doc = ezdxf.readfile(path)
    first = next(iter(doc.modelspace()))
    first.dxf.layer = "0"
    doc.saveas(path)
    assert any("warstwie" in e for e in errors(validate_sheet(path, manifest, sheet)))


def test_walidator_wykrywa_podwojne_ciecie(tmp_path, exports):
    work, manifest, sheet = _prepare(tmp_path, exports)
    path = work / sheet["dxf"]
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    source = next(e for e in msp if e.dxftype() == "POLYLINE" and e.dxf.layer == "CUT")
    msp.add_polyline2d([(p[0], p[1]) for p in source.points()],
                       close=source.is_closed, dxfattribs={"layer": "CUT"})
    doc.saveas(path)
    problems = errors(validate_sheet(path, manifest, sheet))
    assert any("podwojn" in p or "wystepuje" in p for p in problems)


def test_walidator_wykrywa_geometrie_poza_arkuszem(tmp_path, exports):
    work, manifest, sheet = _prepare(tmp_path, exports)
    path = work / sheet["dxf"]
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    msp.add_polyline2d([(-50, -50), (-10, -50), (-10, -10)], close=True, dxfattribs={"layer": "CUT"})
    doc.saveas(path)
    assert any("poza" in e for e in errors(validate_sheet(path, manifest, sheet)))


def test_walidator_wykrywa_rozjazd_z_manifestem(tmp_path, exports):
    work, manifest, sheet = _prepare(tmp_path, exports)
    path = work / sheet["dxf"]
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    msp.delete_entity(next(e for e in msp if e.dxftype() == "POLYLINE"))
    doc.saveas(path)
    assert any("manifescie" in e for e in errors(validate_sheet(path, manifest, sheet)))


def test_walidator_wykrywa_uszkodzony_plik(tmp_path, exports):
    work, manifest, sheet = _prepare(tmp_path, exports)
    path = work / sheet["dxf"]
    path.write_text("to nie jest DXF", encoding="utf-8")
    assert errors(validate_sheet(path, manifest, sheet))


def test_walidator_wykrywa_brak_jednostek(tmp_path, exports):
    work, manifest, sheet = _prepare(tmp_path, exports)
    path = work / sheet["dxf"]
    doc = ezdxf.readfile(path)
    doc.header["$INSUNITS"] = 0
    doc.saveas(path)
    assert any("INSUNITS" in e for e in errors(validate_sheet(path, manifest, sheet)))


@pytest.mark.parametrize("name", RACK_EXPORTS)
def test_model_kieszeniowy_ma_komplet_czesci(exports, name):
    manifest = json.loads((exports[name] / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["model"] == "rack"
    cfg = manifest["config"]
    nazwy = [p["name"] for p in manifest["parts"]]
    assert "Bok" in nazwy and "Dno (pochyle)" in nazwy and "Panel czolowy" in nazwy
    poprzeczne = [n for n in nazwy if n.startswith("Przegroda ")]
    # rzedy - 1 przegrod standardowych + (cols-1) przegrod podluznych
    assert len([n for n in poprzeczne if "kieszenie" in n]) == cfg["rows"] - 1
    assert any(n.startswith("Panel tylny") for n in nazwy)
    assert manifest["stats"]["cells"] == cfg["rows"] * cfg["cols"]
    # numer kazdej kieszeni: wektor kreskowy (polilinie ENGRAVE) albo encja TEXT
    engrave = sum(s["counts"]["polylinesEngrave"] for s in manifest["sheets"])
    texts = sum(s["counts"]["texts"] for s in manifest["sheets"])
    if cfg["numStyle"] == "czcionka":
        assert texts >= manifest["stats"]["cells"], "kazda kieszen potrzebuje numeru"
    else:
        assert engrave >= manifest["stats"]["cells"], "kazda kieszen potrzebuje numeru"


def test_numery_jako_tekst_uzywaja_wskazanej_czcionki(exports):
    """Tryb 'czcionka' ma dac encje TEXT ze stylem wskazujacym krój pisma."""
    katalog = exports["kieszeniowy-czcionka"]
    manifest = json.loads((katalog / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["config"]["numStyle"] == "czcionka"
    numery = set()
    for sheet in manifest["sheets"]:
        doc = ezdxf.readfile(katalog / sheet["dxf"])
        style = doc.styles.get("DEJAVU_SANS")
        assert style.dxf.font == "DejaVu Sans.ttf"
        for e in doc.modelspace():
            if e.dxftype() != "TEXT":
                continue
            assert e.dxf.style == "DEJAVU_SANS"
            assert e.dxf.layer == "ENGRAVE"
            if e.dxf.text.isdigit():
                assert abs(e.dxf.height - 14) < 0.01
                numery.add(int(e.dxf.text))
    assert numery == set(range(1, manifest["stats"]["cells"] + 1)), "komplet numerow jako tekst"
    # w tym trybie numery nie sa juz rysowane wektorowo
    assert errors(validate_export(katalog)) == []


def test_zatrzaski_zmieniaja_obrys_przegrod(exports):
    """Wylaczenie zatrzaskow musi zmniejszyc liczbe wierzcholkow przegrod."""
    z = json.loads((exports["kieszeniowy"] / "manifest.json").read_text(encoding="utf-8"))
    bez = exports["kieszeniowy-bez-zatrzaskow"]
    bez_manifest = json.loads((bez / "manifest.json").read_text(encoding="utf-8"))
    assert z["config"]["latch"] is True
    assert bez_manifest["config"]["latch"] is False

    def wierzcholki(katalog, manifest):
        best = None
        for sheet in manifest["sheets"]:
            doc = ezdxf.readfile(katalog / sheet["dxf"])
            for e in doc.modelspace():
                if e.dxftype() != "POLYLINE" or e.dxf.layer != "CUT":
                    continue
                pts = list(e.points())
                szer = max(p[0] for p in pts) - min(p[0] for p in pts)
                wys = max(p[1] for p in pts) - min(p[1] for p in pts)
                if abs(szer - 318) < 2 and abs(wys - 113) < 2:
                    best = max(best or 0, len(pts))
        return best

    z_pkt = wierzcholki(exports["kieszeniowy"], z)
    bez_pkt = wierzcholki(bez, bez_manifest)
    assert z_pkt and bez_pkt, "nie znaleziono obrysu przegrody poprzecznej"
    assert z_pkt > bez_pkt, "zatrzaski musza dodac wierzcholki do obrysu"
    assert errors(validate_export(bez)) == []


def test_swiezy_eksport_z_linii_polecen_jest_poprawny(tmp_path):
    out = tmp_path / "cli"
    manifest = run_export(out, ["--sku", "S-36", "--sheet", "1220x610"])
    assert manifest["stats"]["sheetCount"] >= 1
    assert errors(validate_export(out)) == []
    assert (ROOT / "tools" / "validate_dxf.py").exists()


def test_eksport_kieszeniowy_z_linii_polecen(tmp_path):
    out = tmp_path / "cli-rack"
    manifest = run_export(out, ["--model", "rack", "--sku", "R-32", "--sheet", "1220x610"])
    assert manifest["model"] == "rack"
    assert manifest["stats"]["cells"] == 32
    assert errors(validate_export(out)) == []
