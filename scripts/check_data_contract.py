#!/usr/bin/env python3
"""Check the additive data-contract outputs of build_coverage_validation.py,
and manifest.json (build_manifest.py): every published file listed, sizes and
sha256 hashes current, one fit version across the world dataset.

Usage: python3 scripts/check_data_contract.py   (stdlib only)
"""

import hashlib
import json
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web" / "public" / "data"
STATUSES = {"own_fit", "borrowed_fit", "insufficient_training_observations",
            "insufficient_reference_observations", "insufficient_heldout_variation",
            "numerical_fit_failure", "no_observations"}


def check_manifest() -> str:
    m = json.loads((WEB / "manifest.json").read_text())
    listed = {f["name"]: f for f in m["files"]}
    present = {p.name for p in WEB.iterdir() if p.is_file() and not p.name.startswith(".") and p.name != "manifest.json"}
    assert set(listed) == present, f"manifest out of date: unlisted {present - set(listed)}, gone {set(listed) - present}"
    for name, f in listed.items():
        data = (WEB / name).read_bytes()
        assert len(data) == f["bytes"], f"{name}: size {len(data)} != manifest {f['bytes']} (re-run build_manifest.py)"
        assert hashlib.sha256(data).hexdigest() == f["sha256"], f"{name}: sha256 differs from manifest (re-run build_manifest.py)"
        if name.endswith(".json"):
            v = json.loads(data).get("fit_version")
            if v is not None:
                assert v == f["fit_version"], f"{name}: carries {v}, manifest says {f['fit_version']}"
    world = {f["fit_version"] for f in listed.values() if f["dataset"] == "world" and f["fit_version"]}
    assert world == {m["fit_version"]}, f"world files carry fit versions {world}, manifest {m['fit_version']}"
    fallback = {f["fit_version"] for f in listed.values() if f["dataset"] == "fallback_four_country" and f["fit_version"]}
    assert fallback <= {m["fallback_fit_version"]}, fallback
    ds = m["datasets"]
    assert set(ds) == {f["dataset"] for f in listed.values()}, f"datasets {set(ds)} vs files"
    for dname, d in ds.items():
        members = {n for n, f in listed.items() if f["dataset"] == dname}
        assert set(d["files"]) == members, f"dataset {dname}: members {set(d['files'])} != files tagged {members}"
        for n, h in d["files"].items():
            assert h == listed[n]["sha256"], f"dataset {dname}: {n} hash in dataset != file entry"
            v = listed[n]["fit_version"]
            assert v is None or v == d["fit_version"], f"dataset {dname}: {n} carries fit {v}, dataset {d['fit_version']}"
        assert d["consistent"] and not d["problems"], f"dataset {dname}: {d['problems']}"
        if d["params_file"]:
            fitted = set(json.loads((WEB / d["params_file"]).read_text())["countries"])
            assert json.loads((WEB / d["params_file"]).read_text())["fit_version"] == d["fit_version"], dname
            assert fitted, dname
    assert m["fit_version"] == ds["world"]["fit_version"] and m["fallback_fit_version"] == ds["fallback_four_country"]["fit_version"]
    for f in listed.values():
        if f.get("scope_kind") == "both":
            totals = {k: v for s in f["scopes"].values() for k, v in s.items() if k.startswith("sum_")}
            assert f["scope_note"] and totals, f["name"]
    return f"manifest {len(listed)} files, world fit {m['fit_version']}, fallback fit {m['fallback_fit_version']}"


def main() -> int:
    p = json.loads((WEB / "params_global.json").read_text())        # raises on invalid JSON
    cov = json.loads((WEB / "coverage_status.json").read_text())
    vp = json.loads((WEB / "validation_points.json").read_text())
    fitted = p["countries"]
    cs = cov["countries"]

    assert len(cs) == 237 == cov["n_countries"], len(cs)
    assert set(cs) == set(fitted) | set(p["failed"])
    assert all(e["status"] in STATUSES for e in cs.values())
    assert sum(cov["summary"].values()) == 237
    for s, n in cov["summary"].items():
        assert n == sum(e["status"] == s for e in cs.values()), s
    assert len(fitted) == 171
    for c, f in fitted.items():
        want = "own_fit" if f["fit_source"] == "own" else "borrowed_fit"
        assert cs[c]["status"] == want and cs[c]["fit_source"] == f["fit_source"], c
        assert f["coef_ci_estimated"] is (f["fit_source"] == "own"), c
    assert sum(f["coef_ci_estimated"] is False for f in fitted.values()) == 41
    assert all(cs[c]["status"] not in ("own_fit", "borrowed_fit") for c in p["failed"])

    assert set(vp["countries"]) == set(fitted)
    for c, v in vp["countries"].items():
        assert v["fit_source"] == fitted[c]["fit_source"]
        assert 0 < len(v["points"]) <= 300 and all(len(x) == 2 for x in v["points"]), c
        assert abs(v["model"]["r2"] - fitted[c]["validation_test"]["model"]["r2"]) <= 1e-6, c
    size = (WEB / "validation_points.json").stat().st_size
    assert size < 3_000_000, size
    print("OK:", cov["summary"], "| validation_points.json", size, "bytes |",
          vp["summary"], "|", check_manifest())
    return 0


if __name__ == "__main__":
    sys.exit(main())
