#!/usr/bin/env bash
# Reproduce one known output from a fresh checkout (E40). Needs Python >= 3.10 and pip access.
# Creates .venv-repro/, installs pinned versions, runs scripts/repro_fixture.py.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=${PYTHON:-python3}
"$PY" -m venv .venv-repro
V=.venv-repro/bin/python
"$V" -m pip install -q --upgrade pip
"$V" -m pip install -q "polars==2.1.0" "numpy==2.5.3" "pyarrow==22.0.0" "h3==4.3.1" "pytest==8.4.2" \
  "scikit-learn==1.7.2" "httpx==0.28.1"
"$V" -m pip install -q --no-deps -e packages/firms-ingest
"$V" scripts/repro_fixture.py "$@"
