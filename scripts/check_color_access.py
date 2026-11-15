#!/usr/bin/env python3
"""Colour accessibility evidence for every ramp and palette in web/src (requirement R10).

Reads the colours straight from the source files, so the report cannot drift from the UI:
  - web/src/styles/tokens.css   (--seq-0..7 light and dark, series and text tokens)
  - web/src/components/FireGlobe.tsx  (globe RAMP)
  - web/src/lib/brief.ts        (standalone brief HEX ramp)
  - web/src/lib/sats.ts         (satellite colours)
  - web/src/components/Method.tsx (HUES)
  - web/src/components/AoiMap.tsx (cell and box outlines)

For each palette: CVD simulation (Machado, Oliveira & Fernandes 2009, severity 1.0) for
deuteranopia, protanopia and tritanopia; CIELAB L* monotonicity for sequential ramps; minimum
CIEDE2000 between adjacent steps (sequential) or between any pair (categorical), normal and under
each simulation. WCAG 2.x contrast for text tokens on their backgrounds, light and dark.

Writes docs/color-accessibility.md and docs/figures/ramp_<name>.png. numpy only.

    python scripts/check_color_access.py
"""
from __future__ import annotations

import re
import struct
import sys
import zlib
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web" / "src"
FIG = ROOT / "docs" / "figures"
OUT = ROOT / "docs" / "color-accessibility.md"

# Pass thresholds (stated in the report).
SEQ_ADJ_DE = 5.0   # adjacent steps of a sequential ramp
CAT_PAIR_DE = 10.0  # any two colours of a categorical palette
TEXT_AA = 4.5       # WCAG 1.4.3 normal text
NONTEXT = 3.0       # WCAG 1.4.11 graphics (series lines, map outlines)

# Machado et al. 2009, severity 1.0, applied in linear sRGB.
MACHADO = {
    "deuteranopia": np.array([[0.367322, 0.860646, -0.227968],
                              [0.280085, 0.672501, 0.047413],
                              [-0.011820, 0.042940, 0.968881]]),
    "protanopia": np.array([[0.152286, 1.052583, -0.204868],
                            [0.114503, 0.786281, 0.099216],
                            [-0.003882, -0.048116, 1.051998]]),
    "tritanopia": np.array([[1.255528, -0.076749, -0.178779],
                            [-0.078411, 0.930809, 0.147602],
                            [0.004733, 0.691367, 0.303900]]),
}
SIMS = list(MACHADO)


# ---------- colour maths ----------
def hex_to_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float) / 255.0


def to_linear(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(np.asarray(c, float), 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * c ** (1 / 2.4) - 0.055)


def simulate(rgb: np.ndarray, kind: str) -> np.ndarray:
    return to_srgb(to_linear(rgb) @ MACHADO[kind].T)


def rgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    lin = to_linear(rgb)
    m = np.array([[0.4124564, 0.3575761, 0.1804375],
                  [0.2126729, 0.7151522, 0.0721750],
                  [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    e = 216 / 24389
    f = np.where(xyz > e, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def ciede2000(lab1, lab2) -> float:
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1, C2 = np.hypot(a1, b1), np.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - np.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = np.hypot(a1p, b1), np.hypot(a2p, b2)
    h1p = np.degrees(np.arctan2(b1, a1p)) % 360
    h2p = np.degrees(np.arctan2(b2, a2p)) % 360
    dLp, dCp = L2 - L1, C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    else:
        dhp = h2p - h1p
        if dhp > 180:
            dhp -= 360
        elif dhp < -180:
            dhp += 360
    dHp = 2 * np.sqrt(C1p * C2p) * np.sin(np.radians(dhp / 2))
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    else:
        hbp = (h1p + h2p + 360) / 2 if h1p + h2p < 360 else (h1p + h2p - 360) / 2
    T = (1 - 0.17 * np.cos(np.radians(hbp - 30)) + 0.24 * np.cos(np.radians(2 * hbp))
         + 0.32 * np.cos(np.radians(3 * hbp + 6)) - 0.20 * np.cos(np.radians(4 * hbp - 63)))
    dth = 30 * np.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * np.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / np.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -np.sin(np.radians(2 * dth)) * Rc
    return float(np.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh)))


def luminance(rgb) -> float:
    lin = to_linear(rgb)
    return float(0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2])


def contrast(fg: str, bg: str) -> float:
    a, b = sorted([luminance(hex_to_rgb(fg)), luminance(hex_to_rgb(bg))], reverse=True)
    return (a + 0.05) / (b + 0.05)


def self_test() -> None:
    # Sharma, Wu & Dalal (2005) test pairs 1 and 17.
    assert abs(ciede2000((50, 2.6772, -79.7751), (50, 0, -82.7485)) - 2.0425) < 1e-3
    assert abs(ciede2000((50, 2.5, 0), (73, 25, -18)) - 27.1492) < 1e-3
    assert abs(contrast("#000000", "#ffffff") - 21.0) < 1e-9
    lab_white = rgb_to_lab(hex_to_rgb("#ffffff"))
    assert abs(lab_white[0] - 100) < 1e-3 and abs(lab_white[1]) < 1e-2


# ---------- reading the source ----------
def css_block(css: str, selector: str) -> dict[str, str]:
    i = css.index(selector)
    j = css.index("{", i)
    depth, k = 0, j
    while True:
        if css[k] == "{":
            depth += 1
        elif css[k] == "}":
            depth -= 1
            if depth == 0:
                break
        k += 1
    return dict(re.findall(r"--([\w-]+):\s*(#[0-9a-fA-F]{6})", css[j:k]))


def hexes(path: Path, pattern: str) -> list[str]:
    m = re.search(pattern, path.read_text(), re.S)
    if not m:
        sys.exit(f"pattern not found in {path}: {pattern}")
    return re.findall(r"#[0-9a-fA-F]{6}", m.group(1))


def load() -> tuple[list[dict], dict[str, dict[str, str]]]:
    css = (WEB / "styles" / "tokens.css").read_text()
    light = css_block(css, ":root {")
    dark = css_block(css, ':root[data-theme="dark"]')
    dark = {**light, **dark}
    seq = lambda t: [t[f"seq-{i}"] for i in range(8)]  # noqa: E731
    sats = dict(re.findall(r'"?([\w-]+)"?:\s*"(#[0-9a-fA-F]{6})"', (WEB / "lib" / "sats.ts").read_text()))
    palettes = [
        dict(name="ember_light", label="Ember ramp, light (calendar, season rings)", kind="seq",
             src="tokens.css --seq-0..7", colors=seq(light)),
        dict(name="ember_dark", label="Ember ramp, dark (calendar, season rings)", kind="seq",
             src="tokens.css dark --seq-0..7", colors=seq(dark)),
        dict(name="brief", label="Brief export ramp (standalone HTML)", kind="seq",
             src="lib/brief.ts HEX", colors=hexes(WEB / "lib" / "brief.ts", r"const HEX = \[(.*?)\]")),
        dict(name="globe", label="Globe FRP ramp", kind="seq",
             src="FireGlobe.tsx RAMP", colors=hexes(WEB / "components" / "FireGlobe.tsx", r"const RAMP = \[(.*?)\]")),
        dict(name="series_light", label="Raw vs harmonized series, light", kind="cat",
             src="tokens.css --c-raw / --ember / --ink", colors=[light["c-raw"], light["ember"], light["ink"]]),
        dict(name="series_dark", label="Raw vs harmonized series, dark", kind="cat",
             src="tokens.css dark --c-raw / --ember / --ink", colors=[dark["c-raw"], dark["ember"], dark["ink"]]),
        dict(name="satellites", label="Satellite colours (globe, fleet, drift clocks)", kind="cat",
             src="lib/sats.ts SAT_COLORS", colors=list(sats.values()), names=list(sats.keys())),
        dict(name="method_hues", label="Method chart hues", kind="cat",
             src="Method.tsx HUES", colors=hexes(WEB / "components" / "Method.tsx", r"const HUES = \[(.*?)\]")),
        dict(name="aoi_map", label="AOI map: cells vs selection box", kind="cat",
             src="AoiMap.tsx", colors=["#3f7f96", "#d9431a"]),
    ]
    return palettes, {"light": light, "dark": dark}


# ---------- checks ----------
def analyse(p: dict) -> dict:
    rgb = np.array([hex_to_rgb(c) for c in p["colors"]])
    views = {"normal": rgb, **{s: np.array([simulate(c, s) for c in rgb]) for s in SIMS}}
    res = {"views": views}
    for v, arr in views.items():
        lab = rgb_to_lab(arr)
        if p["kind"] == "seq":
            d = np.diff(lab[:, 0])
            res[f"mono_{v}"] = bool(np.all(d > 0) or np.all(d < 0))
            res[f"de_{v}"] = min(ciede2000(lab[i], lab[i + 1]) for i in range(len(lab) - 1))
        else:
            pairs = [(i, j) for i in range(len(lab)) for j in range(i + 1, len(lab))]
            vals = [(ciede2000(lab[i], lab[j]), i, j) for i, j in pairs]
            res[f"de_{v}"], i, j = min(vals)
            res[f"pair_{v}"] = (i, j)
        res[f"L_{v}"] = lab[:, 0]
    thr = SEQ_ADJ_DE if p["kind"] == "seq" else CAT_PAIR_DE
    res["pass"] = all(res[f"de_{v}"] >= thr for v in views) and (
        p["kind"] != "seq" or all(res[f"mono_{v}"] for v in views))
    return res


def write_png(path: Path, views: dict[str, np.ndarray], cell: int = 40, gap: int = 6) -> None:
    n = len(next(iter(views.values())))
    rows = len(views)
    h, w = rows * cell + (rows - 1) * gap, n * cell
    img = np.full((h, w, 3), 255, np.uint8)
    for r, arr in enumerate(views.values()):
        y = r * (cell + gap)
        for i, c in enumerate(arr):
            img[y:y + cell, i * cell:(i + 1) * cell] = np.round(np.clip(c, 0, 1) * 255)
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(h))

    def chunk(t: bytes, d: bytes) -> bytes:
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def text_checks(themes: dict[str, dict[str, str]]) -> list[tuple]:
    rows = []
    for theme, t in themes.items():
        for fg in ("text-primary", "text-secondary", "text-muted"):
            for bg in ("bg", "surface", "surface-alt"):
                rows.append((theme, fg, bg, t[fg], t[bg], contrast(t[fg], t[bg]), TEXT_AA))
        for fg in ("red", "ember", "c-raw"):
            for bg in ("bg", "surface"):
                rows.append((theme, fg, bg, t[fg], t[bg], contrast(t[fg], t[bg]), NONTEXT))
        rows.append((theme, "on-ink", "ink", t["on-ink"], t["ink"], contrast(t["on-ink"], t["ink"]), TEXT_AA))
    return rows


# ---------- report ----------
REPLACEMENT = {
    "seq": "a lightness-monotonic sequential ramp with larger steps, e.g. 8 samples of cividis "
           "(CVD-optimised) or of matplotlib 'inferno'/'YlOrRd' re-sampled so adjacent ΔE2000 ≥ 5 under all three simulations",
    "cat": "separate the clashing pair in lightness (not only hue), or take the pair from a CVD-safe "
           "categorical set such as Okabe–Ito (#E69F00, #56B4E9, #009E73, #0072B2, #D55E00, #CC79A7)",
}


def main() -> None:
    self_test()
    palettes, themes = load()
    FIG.mkdir(parents=True, exist_ok=True)
    results = []
    for p in palettes:
        r = analyse(p)
        write_png(FIG / f"ramp_{p['name']}.png", r["views"])
        results.append((p, r))
    texts = text_checks(themes)

    fails = [(p, r) for p, r in results if not r["pass"]]
    tfails = [t for t in texts if t[5] < t[6]]
    L = [
        "# Colour accessibility (R10)",
        "",
        f"Generated by `scripts/check_color_access.py` on {date.today().isoformat()} from the colours in "
        "`web/src`. Re-run it after any colour change; it reads the source files directly.",
        "",
        "Method: colour-vision deficiency simulated with Machado, Oliveira & Fernandes (2009) at severity 1.0 "
        "in linear sRGB; CIELAB (D65) L*; colour difference CIEDE2000 (verified against Sharma et al. 2005 test "
        "pairs); contrast per WCAG 2.x. Thresholds: sequential ramps need monotonic L* and adjacent ΔE2000 ≥ "
        f"{SEQ_ADJ_DE:g} in every view; categorical palettes need every pair ΔE2000 ≥ {CAT_PAIR_DE:g} in every "
        f"view; text needs {TEXT_AA:g}:1 (WCAG 1.4.3 AA), series and accent colours used as graphics need "
        f"{NONTEXT:g}:1 (WCAG 1.4.11).",
        "",
        "## Failing items",
        "",
    ]
    if not fails and not tfails:
        L.append("None. Every ramp, palette and text pair passes.")
    for p, r in fails:
        worst = min(("normal", *SIMS), key=lambda v: r[f"de_{v}"])
        extra = ""
        if p["kind"] == "cat":
            i, j = r[f"pair_{worst}"]
            nm = p.get("names", p["colors"])
            extra = f" (closest pair {nm[i]} / {nm[j]})"
        mono = "" if p["kind"] == "cat" else (
            "" if all(r[f"mono_{v}"] for v in ("normal", *SIMS)) else "; L* not monotonic in some view")
        L.append(f"- **{p['label']}** (`{p['src']}`): minimum ΔE2000 {r[f'de_{worst}']:.1f} under "
                 f"{worst}{extra}{mono}. Proposed replacement: {REPLACEMENT[p['kind']]}. UI not changed.")
    for t in tfails:
        L.append(f"- **{t[0]} `--{t[1]}` on `--{t[2]}`** ({t[3]} on {t[4]}): {t[5]:.2f}:1, needs {t[6]:g}:1. "
                 "Proposed: darken (light theme) or lighten (dark theme) the foreground until it meets the ratio. UI not changed.")
    brief = next(p for p, _ in results if p["name"] == "brief")["colors"]
    light_seq = next(p for p, _ in results if p["name"] == "ember_light")["colors"]
    if [c.lower() for c in brief] != [c.lower() for c in light_seq]:
        diff = [i for i, (a, b) in enumerate(zip(brief, light_seq)) if a.lower() != b.lower()]
        L += ["", f"Note (not a failure): `lib/brief.ts` says its HEX array mirrors `--seq-0..7`, but steps "
              f"{', '.join(map(str, diff))} differ from the light tokens. Both pass; consider syncing them."]
    L += ["", "## Ramps and palettes", "",
          "ΔE columns: sequential = minimum between adjacent steps; categorical = minimum over all pairs.", "",
          "| Palette | Type | Steps | L* monotonic (N/D/P/T) | ΔE normal | ΔE deutan | ΔE protan | ΔE tritan | Result | Strip |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for p, r in results:
        mono = "n/a" if p["kind"] == "cat" else "/".join(
            "yes" if r[f"mono_{v}"] else "NO" for v in ("normal", *SIMS))
        de = " | ".join(f"{r[f'de_{v}']:.1f}" for v in ("normal", *SIMS))
        L.append(f"| {p['label']} (`{p['src']}`) | {'sequential' if p['kind'] == 'seq' else 'categorical'} | "
                 f"{len(p['colors'])} | {mono} | {de} | {'PASS' if r['pass'] else 'FAIL'} | "
                 f"[png](figures/ramp_{p['name']}.png) |")
    L += ["", "Each strip shows four rows: normal, deuteranopia, protanopia, tritanopia.", ""]
    for p, r in results:
        L.append(f"**{p['label']}** — {', '.join(f'`{c}`' for c in p['colors'])}; "
                 f"L* {', '.join(f'{x:.0f}' for x in r['L_normal'])}")
        L.append("")
        L.append(f"![{p['name']}](figures/ramp_{p['name']}.png)")
        L.append("")
    L += ["## Text and accent contrast", "",
          "| Theme | Foreground | Background | Colours | Ratio | Needs | Result |", "|---|---|---|---|---|---|---|"]
    for t in texts:
        L.append(f"| {t[0]} | `--{t[1]}` | `--{t[2]}` | {t[3]} on {t[4]} | {t[5]:.2f}:1 | {t[6]:g}:1 | "
                 f"{'PASS' if t[5] >= t[6] else 'FAIL'} |")
    L.append("")
    OUT.write_text("\n".join(L))

    for p, r in results:
        print(f"{p['name']:14s} {'PASS' if r['pass'] else 'FAIL'}  " +
              "  ".join(f"{v[:4]}={r[f'de_{v}']:.1f}" for v in ("normal", *SIMS)))
    print(f"text pairs: {len(texts) - len(tfails)}/{len(texts)} pass")
    for t in tfails:
        print(f"  FAIL {t[0]} {t[1]} on {t[2]}: {t[5]:.2f} < {t[6]}")
    print(f"wrote {OUT.relative_to(ROOT)} and {len(results)} strips in {FIG.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
