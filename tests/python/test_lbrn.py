"""Walidacja projektow LightBurn (.lbrn2) wygenerowanych obok SVG i DXF."""

from __future__ import annotations

import json
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

import ezdxf
import pytest

from conftest import EXPORTS
from validate_dxf import validate_lbrn


def errors(problems):
    return [str(p) for p in problems if p.level == "error"]


def manifest_of(path: Path) -> dict:
    return json.loads((path / "manifest.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", sorted(EXPORTS))
def test_kazdy_arkusz_ma_projekt_lightburn(exports, name):
    spec = manifest_of(exports[name])
    for sheet in spec["sheets"]:
        path = exports[name] / sheet["lbrn"]
        assert path.exists(), "eksport musi zapisac plik .lbrn2"
        assert errors(validate_lbrn(path, spec, sheet)) == []


def test_struktura_pliku_lightburn(exports):
    spec = manifest_of(exports["schodkowy"])
    root = ET.parse(exports["schodkowy"] / spec["sheets"][0]["lbrn"]).getroot()
    assert root.tag == "LightBurnProject"
    assert root.get("FormatVersion") == "1"
    warstwy = [(cs.get("type"), cs.find("name").get("Value")) for cs in root.findall("CutSetting")]
    assert warstwy == [("Cut", "CUT"), ("Cut", "ENGRAVE")]
    typy = {s.get("Type") for s in root.findall("Shape")}
    assert typy <= {"Path", "Text"}


def test_lightburn_i_dxf_opisuja_te_sama_liczbe_konturow(exports):
    spec = manifest_of(exports["schodkowy"])
    for sheet in spec["sheets"]:
        root = ET.parse(exports["schodkowy"] / sheet["lbrn"]).getroot()
        sciezki = [s for s in root.findall("Shape") if s.get("Type") == "Path"]
        doc = ezdxf.readfile(exports["schodkowy"] / sheet["dxf"])
        polilinie = [e for e in doc.modelspace() if e.dxftype() == "POLYLINE"]
        assert len(sciezki) == len(polilinie)


# --- testy negatywne walidatora ------------------------------------------

def _kopia(tmp_path: Path, exports: dict[str, Path]):
    work = tmp_path / "kopia"
    shutil.copytree(exports["schodkowy"], work)
    spec = manifest_of(work)
    return work, spec, spec["sheets"][0]


def test_walidator_wykrywa_uszkodzony_xml(tmp_path, exports):
    work, spec, sheet = _kopia(tmp_path, exports)
    path = work / sheet["lbrn"]
    path.write_text("<LightBurnProject> brak zamkniecia", encoding="utf-8")
    assert any("XML" in e for e in errors(validate_lbrn(path, spec, sheet)))


def test_walidator_wykrywa_zla_warstwe(tmp_path, exports):
    work, spec, sheet = _kopia(tmp_path, exports)
    path = work / sheet["lbrn"]
    root = ET.parse(path).getroot()
    root.findall("CutSetting")[0].find("name").set("Value", "INNA")
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    assert any("warstwa" in e for e in errors(validate_lbrn(path, spec, sheet)))


def test_walidator_wykrywa_brakujacy_ksztalt(tmp_path, exports):
    work, spec, sheet = _kopia(tmp_path, exports)
    path = work / sheet["lbrn"]
    root = ET.parse(path).getroot()
    root.remove(next(s for s in root.findall("Shape") if s.get("CutIndex") == "0"))
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    assert any("CUT" in e for e in errors(validate_lbrn(path, spec, sheet)))


def test_walidator_wykrywa_geometrie_poza_arkuszem(tmp_path, exports):
    work, spec, sheet = _kopia(tmp_path, exports)
    path = work / sheet["lbrn"]
    root = ET.parse(path).getroot()
    shape = next(s for s in root.findall("Shape") if s.get("Type") == "Path")
    shape.find("VertList").text = "V-50 -50V-10 -50V-10 -10"
    shape.find("PrimList").text = "L0 1L1 2L2 0"
    ET.ElementTree(root).write(path, encoding="utf-8", xml_declaration=True)
    assert any("poza polem roboczym" in e for e in errors(validate_lbrn(path, spec, sheet)))
