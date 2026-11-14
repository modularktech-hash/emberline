#!/usr/bin/env bash
# Stage the FIRMS country archive for many countries, gzip-compressed on arrival.
#
# The global record is ~32 GB as raw CSV, so every file is compressed as soon as
# it lands. Resumable: a country-year that already exists as .csv.gz is skipped.
#
# Usage:
#   ./scripts/stage_global.sh countries.txt      # one FIRMS country name per line
#
# Environment: OUT (default data/global), FIRST_YEAR (2001), LAST_YEAR (2025),
# JOBS (default 3 -- the FIRMS host resets connections under heavier load).

set -uo pipefail

LIST="${1:?usage: stage_global.sh countries.txt}"
BASE="https://firms.modaps.eosdis.nasa.gov/data/country/csv"
OUT="${OUT:-data/global}"
FIRST_YEAR="${FIRST_YEAR:-2001}"
LAST_YEAR="${LAST_YEAR:-2025}"
JOBS="${JOBS:-3}"
mkdir -p "$OUT"

# Same three-way check as stage_data.sh: a JSON body is the only error; a
# header-only CSV is valid and means no detections.
classify() {
  local f="$1"
  [ -s "$f" ] || { echo empty; return; }
  [ "$(head -c1 "$f")" = "{" ] && { echo error; return; }
  head -1 "$f" | grep -q '^latitude,longitude' || { echo notcsv; return; }
  echo ok
}

fetch() {
  local source="$1" year="$2" country="$3"
  local name="${source}_${year}_${country}.csv"
  local dest="$OUT/$name.gz" tmp="$OUT/$name.part" delay=1
  [ -s "$dest" ] && return 0
  # The host intermittently resets connections during the TLS handshake; a
  # healthy handshake takes well under a second, so a short connect timeout
  # and many quick retries beat a few long ones. A reset is never "absent".
  for attempt in $(seq 1 15); do
    # A transfer cut off mid-body still starts with the CSV header, so a
    # failed curl must never be classified as ok.
    if curl -sS --connect-timeout 5 -m 900 -o "$tmp" "$BASE/$source/$year/$name" 2>/dev/null; then
      state="$(classify "$tmp")"
    else
      state=retry
    fi
    case "$state" in
      ok)    gzip -c "$tmp" > "$dest.tmp" && mv -f "$dest.tmp" "$dest"; rm -f "$tmp"
             echo "got    $name"; return 0 ;;
      error) rm -f "$tmp"; : > "$OUT/$name.absent"; echo "absent $name"; return 0 ;;
      *)     rm -f "$tmp"; sleep "$delay"; delay=$((delay < 20 ? delay + 2 : 20)) ;;
    esac
  done
  echo "FAIL   $name"
  return 1
}
export -f fetch classify
export BASE OUT

# Work list: every country x year x source, in the order the list gives
# countries, so the highest-fire countries finish first.
while read -r country; do
  [ -z "$country" ] && continue
  for year in $(seq "$FIRST_YEAR" "$LAST_YEAR"); do
    [ -e "$OUT/modis_${year}_${country}.csv.absent" ] || echo "modis $year $country"
    [ "$year" -ge 2012 ] && { [ -e "$OUT/viirs-snpp_${year}_${country}.csv.absent" ] || echo "viirs-snpp $year $country"; }
  done
done < "$LIST" | xargs -P "$JOBS" -L 1 bash -c 'fetch "$0" "$1" "$2"'
download_status=${PIPESTATUS[1]}

echo
echo "files: $(find "$OUT" -name '*.csv.gz' | wc -l), on disk: $(du -sh "$OUT" | cut -f1)"
echo "failed: re-run the same command to retry (it resumes)."
exit "$download_status"
