#!/usr/bin/env bash
# Probe the FIRMS country-level archive and demonstrate the raw sensor artifact.
#
# No MAP_KEY required: the country archive is served as static CSV.
# (A MAP_KEY is only needed for the near-real-time area API.)
#
# Usage: ./probe_firms_archive.sh [COUNTRY] [OUTDIR]
#   COUNTRY  FIRMS country name as it appears in the filename (default: Chile)
#   OUTDIR   where to write the CSVs (default: ./firms-probe)

set -euo pipefail

COUNTRY="${1:-Chile}"
OUTDIR="${2:-./firms-probe}"
BASE="https://firms.modaps.eosdis.nasa.gov/data/country/csv"

mkdir -p "$OUTDIR"

fetch() { # source year -> file path on stdout
  local src="$1" year="$2"
  local f="$OUTDIR/${src}_${year}_${COUNTRY}.csv"
  if [ ! -s "$f" ]; then
    curl -sS -m 120 -o "$f" "$BASE/$src/$year/${src}_${year}_${COUNTRY}.csv" || return 1
  fi
  # A 404 comes back as a JSON error document, not a CSV.
  head -c1 "$f" | grep -q '{' && return 1
  printf '%s' "$f"
}

# Count type==0 (presumed vegetation fire) rows only, dropping volcanoes,
# static land sources (gas flares, industry) and offshore detections.
count_veg() {
  awk -F, 'NR>1 && $15==0' "$1" | wc -l
}

echo "FIRMS country archive probe: $COUNTRY"
echo
printf '%-6s %12s %12s %8s\n' year MODIS_veg VIIRS_veg ratio
printf '%-6s %12s %12s %8s\n' ------ ------------ ------------ --------

for year in $(seq 2001 2024); do
  m=0; v=0
  if mf=$(fetch modis "$year" 2>/dev/null); then m=$(count_veg "$mf"); fi
  if [ "$year" -ge 2012 ] && vf=$(fetch viirs-snpp "$year" 2>/dev/null); then
    v=$(count_veg "$vf")
  fi
  if [ "$v" -gt 0 ] && [ "$m" -gt 0 ]; then
    ratio=$(awk -v a="$v" -v b="$m" 'BEGIN{printf "%.2fx", a/b}')
  else
    ratio="-"
  fi
  printf '%-6s %12d %12d %8s\n' "$year" "$m" "$v" "$ratio"
done

cat <<'NOTE'

The MODIS column is roughly flat apart from genuine extreme years. The VIIRS
column runs several times higher from 2012 on, and the ratio GROWS over time.
Nothing changed on the ground in 2012; Suomi-NPP launched. That gap is what the
harmonization has to remove -- and because the ratio is not constant, a single
global correction factor will not do it.
NOTE
