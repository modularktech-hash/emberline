# Global data takeover — 14 November 2026

The user has assigned the global data download, build, fit, and validation to the local Codex session at `/home/ridhan/Projects/emberline`. Claude has stopped. The user owns the web UI.

The local checkout contains the four-country published results, but no raw archive or global outputs. The raw files mentioned in STATUS.md were in the former cloud session and are not available locally. Downloads will resume from any available local files; missing files must be retrieved from FIRMS.

Scope: scripts, local raw/staging data, validation documentation, and generated public data artifacts. Do not change UI components. Global outputs must pass completeness and four-country regression checks before publication.

## Running locally

- Archive: `data/global/` (gzip; complete files survive restarts).
- Derived country tables: `data/global_public/`.
- Logs: `data/logs/download.log` and `data/logs/process.log`.
- Python environment: `.venv/`; installed versions captured in `data/python-environment.txt`.
- `emberline-download.service` is the original active download.
- Persistent `emberline-global-download.service` waits for that original job, then retries/resumes missing files; enabled at user login and retries on failure. Never run a competing download against the same directory.
- `emberline-global-build.timer` checks every five minutes and runs `run_global.py`; 2 threads and 5 GiB memory cap limit impact on the laptop. Check the service for memory-limit failures on large countries.
- Download concurrency stays at 3. Downloads pause when the laptop sleeps or has no network; the user services resume at login after a reboot.

```bash
systemctl --user status emberline-download emberline-global-download emberline-global-build.timer
tail -20 data/logs/download.log
tail -20 data/logs/process.log
find data/global -name '*.csv.gz' | wc -l
```

## Recovery fixes verified

Full Python suite: 89 passed. Interrupted detection/calendar pairs are rebuilt, Parquet writes use temporary paths, download failures return nonzero, each completed fit saves recovery artifacts under `fit_checkpoints/<country>/`, and valid no-fire months are filled with zero without filling absent archive years. Fit checkpoints are preserved but are not automatically reused: input and pooled-model consistency must be checked first.

## Remaining work

Global downloads and builds are in progress, not complete. Run the fit against completed tables using `EMBERLINE_DATA=data/global_public EMBERLINE_OUTPUT=data/global_release EMBERLINE_PARAMS=params_global.json EMBERLINE_CAL=calendar_harmonized_global.parquet EMBERLINE_PLOTS=0`; supply the built country names. This output override stages results without changing deployed data. Assemble the raw country tables by summing shared H3-parent keys, check missing/empty countries and failed fits, compare four-country central metrics/calendar totals with the published baseline, validate JSON finiteness and file sizes, then publish the three global artifacts together. No global results have been published by this takeover.
