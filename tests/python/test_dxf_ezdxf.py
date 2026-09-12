"""Walidacja DXF czytnikiem ezdxf - plik musi byc rozpoznawalny i zgodny z modelem."""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import ezdxf
import pytest
from ezdxf.audit import Auditor

from conftest import EXPORTS, ROOT, run_export
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


def test_swiezy_eksport_z_linii_polecen_jest_poprawny(tmp_path):
    out = tmp_path / "cli"
    manifest = run_export(out, ["--sku", "S-36", "--sheet", "1220x610"])
    assert manifest["stats"]["sheetCount"] >= 1
    assert errors(validate_export(out)) == []
    assert (ROOT / "tools" / "validate_dxf.py").exists()
