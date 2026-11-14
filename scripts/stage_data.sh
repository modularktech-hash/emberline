#!/usr/bin/env bash
# Stage the FIRMS archive for the demo AOIs. No API key required.
#
# Resumable: already-complete files are skipped, so re-running after an
# interrupted run costs nothing. Safe to run repeatedly.
#
# Usage:
#   ./scripts/stage_data.sh                      # default AOIs, 2001-2025
#   ./scripts/stage_data.sh Chile Portugal       # specific countries
#   FIRST_YEAR=2012 ./scripts/stage_data.sh      # VIIRS era only
#   OUT=/mnt/big/firms ./scripts/stage_data.sh   # somewhere else
#
# Writes:
#   $OUT/archive/<source>_<year>_<Country>.csv
#   $OUT/nrt/<FEED>.csv                  (today's snapshot, for the live layer)
#   $OUT/MANIFEST.tsv                    (source, year, country, rows, bytes)
#
# Environment:
#   OUT          output directory          (default: data/raw)
#   FIRST_YEAR   first archive year        (default: 2001)
#   LAST_YEAR    last archive year         (default: 2025)
#   JOBS         parallel downloads        (default: 3)
#
# Keep JOBS low. The FIRMS host resets connections under parallel load; this
# script retries, but hammering it makes every request slower.

set -uo pipefail

BASE="https://firms.modaps.eosdis.nasa.gov/data"
OUT="${OUT:-data/raw}"
FIRST_YEAR="${FIRST_YEAR:-2001}"
LAST_YEAR="${LAST_YEAR:-2025}"
JOBS="${JOBS:-3}"

# Defaults chosen for the demo. Rationale in docs/gameplan.md:
#   Chile     - characterised already; real volcano detections for the type filter
#   Portugal  - narrow longitude, so the cleanest overpass-drift demonstration
#   Australia - large counts, tests performance at scale
#   Canada    - record 2023 season; NBAC exists as independent validation
DEFAULT_COUNTRIES=(Chile Portugal Australia Canada)

COUNTRIES=("$@")
[ ${#COUNTRIES[@]} -eq 0 ] && COUNTRIES=("${DEFAULT_COUNTRIES[@]}")

mkdir -p "$OUT/archive" "$OUT/nrt"

# --- validation -------------------------------------------------------------
# Three outcomes must be told apart, and only the first is an error:
#   1. a JSON error document (FIRMS serves 404s as JSON, not as a 404 body)
#   2. a header-only CSV: VALID. It means no detections, which is legitimate
#      for a small country in a quiet year. Do not treat it as a failure.
#   3. a CSV with data rows
# A plain "is the file non-empty" check passes case 1 and ingests garbage.
classify() {
  local f="$1"
  [ -s "$f" ] || { echo "empty"; return; }
  if [ "$(head -c1 "$f")" = "{" ]; then echo "error"; return; fi
  head -1 "$f" | grep -q '^latitude,longitude' || { echo "notcsv"; return; }
  if [ "$(wc -l <"$f")" -le 1 ]; then echo "norows"; else echo "ok"; fi
}

# --- download with backoff --------------------------------------------------
fetch() {
  local url="$1" dest="$2" label="$3"

  if [ -f "$dest" ]; then
    case "$(classify "$dest")" in
      ok|norows) printf '  skip   %s\n' "$label"; return 0 ;;
      *) rm -f "$dest" ;;   # a bad cached file; re-fetch it
    esac
  fi

  local tmp="$dest.part" delay=3
  for attempt in 1 2 3 4 5; do
    # --retry handles transient HTTP; the outer loop handles the connection
    # resets this host produces, which curl does not always retry.
    curl -sS -m 300 --retry 2 --retry-delay 2 -o "$tmp" "$url" 2>/dev/null
    case "$(classify "$tmp")" in
      ok|norows)
        mv -f "$tmp" "$dest"
        printf '  got    %-44s %8s rows %7s\n' "$label" \
          "$(( $(wc -l <"$dest") - 1 ))" "$(du -h "$dest" | cut -f1)"
        return 0 ;;
      error)
        rm -f "$tmp"
        printf '  absent %s\n' "$label"   # genuinely not published
        return 2 ;;
      *)
        rm -f "$tmp"
        [ "$attempt" -lt 5 ] && sleep "$delay" && delay=$((delay * 2)) ;;
    esac
  done
  printf '  FAIL   %s (5 attempts)\n' "$label"
  return 1
}

# --- archive ----------------------------------------------------------------
echo "Staging FIRMS archive -> $OUT"
echo "Countries: ${COUNTRIES[*]}"
echo "Years:     $FIRST_YEAR-$LAST_YEAR"
echo

failures=0
pids=()
reap() {  # keep at most $JOBS background downloads in flight
  while [ "$(jobs -rp | wc -l)" -ge "$JOBS" ]; do sleep 0.4; done
}

for country in "${COUNTRIES[@]}"; do
  echo "== $country"
  for year in $(seq "$FIRST_YEAR" "$LAST_YEAR"); do
    for source in modis viirs-snpp; do
      # VIIRS Suomi-NPP starts in 2012; MODIS in late 2000.
      [ "$source" = "viirs-snpp" ] && [ "$year" -lt 2012 ] && continue
      name="${source}_${year}_${country}.csv"
      reap
      fetch "$BASE/country/csv/$source/$year/$name" "$OUT/archive/$name" \
        "$source $year $country" &
      pids+=($!)
    done
  done
  wait
done

for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done

# --- NRT snapshot -----------------------------------------------------------
# For the live layer and for "current month vs median" (requirement R5): the
# country archive stops at the last complete year, so NRT is the only route to
# current data. These are global; slice to the AOI in the pipeline.
echo
echo "== near-real-time snapshot ($(date -u +%Y-%m-%d))"
for feed in \
  "modis-c6.1/MODIS_C6_1_Global_24h" \
  "modis-c6.1/MODIS_C6_1_Global_7d" \
  "suomi-npp-viirs-c2/SUOMI_VIIRS_C2_Global_24h" \
  "suomi-npp-viirs-c2/SUOMI_VIIRS_C2_Global_7d" \
  "noaa-20-viirs-c2/J1_VIIRS_C2_Global_24h" \
  "noaa-21-viirs-c2/J2_VIIRS_C2_Global_24h" \
; do
  slug="${feed%%/*}"; file="${feed##*/}.csv"
  fetch "$BASE/active_fire/$slug/csv/$file" "$OUT/nrt/$file" "$file" || failures=$((failures + 1))
done

# --- manifest ---------------------------------------------------------------
echo
echo "== manifest"
{
  printf 'kind\tsource\tyear\tcountry\trows\tbytes\n'
  for f in "$OUT"/archive/*.csv; do
    [ -f "$f" ] || continue
    b=$(basename "$f" .csv)
    src="${b%%_*}"; rest="${b#*_}"; yr="${rest%%_*}"; ctry="${rest#*_}"
    printf 'archive\t%s\t%s\t%s\t%s\t%s\n' "$src" "$yr" "$ctry" \
      "$(( $(wc -l <"$f") - 1 ))" "$(wc -c <"$f")"
  done
  for f in "$OUT"/nrt/*.csv; do
    [ -f "$f" ] || continue
    printf 'nrt\t%s\t-\t-\t%s\t%s\n' "$(basename "$f" .csv)" \
      "$(( $(wc -l <"$f") - 1 ))" "$(wc -c <"$f")"
  done
} > "$OUT/MANIFEST.tsv"

arch_n=$(find "$OUT/archive" -name '*.csv' | wc -l)
arch_rows=$(awk -F'\t' 'NR>1 && $1=="archive"{s+=$5} END{print s+0}' "$OUT/MANIFEST.tsv")
echo "  $arch_n archive files, $arch_rows detections, $(du -sh "$OUT" | cut -f1) on disk"
echo "  manifest: $OUT/MANIFEST.tsv"

if [ "$failures" -gt 0 ]; then
  echo
  echo "$failures download(s) failed. Re-run to retry only those (it resumes)."
  exit 1
fi
echo
echo "Staging complete. Re-run any time; completed files are skipped."
