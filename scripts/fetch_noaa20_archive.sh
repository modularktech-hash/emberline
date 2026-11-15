#!/usr/bin/env bash
# Fetch the NOAA-20 (JPSS-1) VIIRS country archive. No key needed.
# The country-archive slug is `viirs-jpss1` (verified 14 Nov 2026; other slugs 404).
# Sequential (JOBS=1): the FIRMS host resets connections often, so retry.
# A JSON body (first byte `{`) is a failure; a header-only CSV is valid.
# Usage: fetch_noaa20_archive.sh OUT_DIR Country [Country ...]
set -u
OUT="$1"; shift
mkdir -p "$OUT"
B=https://firms.modaps.eosdis.nasa.gov/data/country/csv/viirs-jpss1
for c in "$@"; do
  for y in 2018 2019 2020 2021 2022 2023 2024 2025; do
    f="viirs-jpss1_${y}_${c}.csv"
    [ "$(head -c1 "$OUT/$f" 2>/dev/null)" = l ] && continue
    for i in $(seq 1 12); do
      curl -sS -m 300 "$B/$y/$f" -o "$OUT/$f.part" 2>/dev/null
      h=$(head -c1 "$OUT/$f.part" 2>/dev/null)
      if [ "$h" = l ]; then mv "$OUT/$f.part" "$OUT/$f"; break; fi
      if [ "$h" = "{" ]; then echo "JSON error: $f"; mv "$OUT/$f.part" "$OUT/$f.json"; break; fi
      sleep 5
    done
    echo "$f $(wc -l < "$OUT/$f" 2>/dev/null || echo MISSING)"
  done
done
