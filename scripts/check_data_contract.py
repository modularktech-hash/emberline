#!/usr/bin/env python3
"""Check the additive data-contract outputs of build_coverage_validation.py.

Usage: python3 scripts/check_data_contract.py   (stdlib only)
"""

import json
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web" / "public" / "data"
STATUSES = {"own_fit", "borrowed_fit", "insufficient_training_observations",
            "insufficient_reference_observations", "insufficient_heldout_variation",
            "numerical_fit_failure", "no_observations"}


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
          vp["summary"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
