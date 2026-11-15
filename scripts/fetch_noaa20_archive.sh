#!/usr/bin/env bash
# Fetch the NOAA-20 (JPSS-1) VIIRS country archive (standard processing). No key needed.
# The country-archive slug is `viirs-jpss1` (verified 14 Nov 2026; other slugs 404).
# Sequential per call: the FIRMS host resets connections often, so retry; run at most 3 in parallel.
# A JSON body (first byte `{`) is a failure; a header-only CSV is valid.
# Files are stored gzipped: OUT_DIR/viirs-jpss1_YEAR_Country.csv.gz
# Usage: [YEARS="2018 2019"] fetch_noaa20_archive.sh OUT_DIR Country [Country ...]
set -u
OUT="$1"; shift
mkdir -p "$OUT"
YEARS="${YEARS:-2018 2019 2020 2021 2022 2023 2024 2025}"
B=https://firms.modaps.eosdis.nasa.gov/data/country/csv/viirs-jpss1
for c in "$@"; do
  for y in $YEARS; do
    f="viirs-jpss1_${y}_${c}.csv"
    [ -s "$OUT/$f.gz" ] && continue
    for i in $(seq 1 12); do
      curl -sS -m 600 "$B/$y/$f" -o "$OUT/$f.part" 2>/dev/null
      h=$(head -c1 "$OUT/$f.part" 2>/dev/null)
      if [ "$h" = l ]; then gzip -c "$OUT/$f.part" > "$OUT/$f.gz.tmp" && mv "$OUT/$f.gz.tmp" "$OUT/$f.gz"; rm -f "$OUT/$f.part"; break; fi
      if [ "$h" = "{" ]; then echo "JSON error: $f"; mv "$OUT/$f.part" "$OUT/$f.json"; break; fi
      sleep 5
    done
    echo "$f.gz $( [ -s "$OUT/$f.gz" ] && echo ok || echo MISSING)"
  done
done
