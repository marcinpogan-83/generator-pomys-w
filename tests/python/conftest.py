"""Wspolne fixture'y: eksport arkuszy generatorem (Node) do katalogu tymczasowego."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))

EXPORTS = {
    "default": [],
    "s26-pelne-plecy": ["--sku", "S-26", "--set", "solidBack=true", "--set", "solidStiffener=true"],
    "jedna-kolumna": ["--set", "cols=1", "--set", "rows=6", "--set", "useHeader=false"],
    "szeroki-arkusz": ["--set", "cols=4", "--set", "rows=8", "--set", "cellW=150",
                       "--sheet", "1000x600", "--no-rot"],
    "schodkowy": ["--model", "stepped"],
    "schodkowy-K30": ["--model", "stepped", "--sku", "K-30"],
    "schodkowy-waski": ["--model", "stepped", "--set", "cols=2", "--set", "pockets=12",
                        "--sheet", "1000x600"],
}

STEPPED_EXPORTS = [name for name in EXPORTS if name.startswith("schodkowy")]


def run_export(out_dir: Path, args: list[str]) -> dict:
    cmd = ["node", str(ROOT / "tools" / "export-cli.mjs"), "--out", str(out_dir), *args]
    proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    assert proc.returncode == 0, f"eksport nie powiodl sie:\n{proc.stdout}\n{proc.stderr}"
    return json.loads((out_dir / "manifest.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="session")
def exports(tmp_path_factory) -> dict[str, Path]:
    base = tmp_path_factory.mktemp("eksport")
    out = {}
    for name, args in EXPORTS.items():
        target = base / name
        run_export(target, args)
        out[name] = target
    return out
