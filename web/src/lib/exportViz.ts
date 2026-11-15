/**
 * R12: the current view as files. SVG and PNG of the calendar and the annual
 * chart, built from exactly the values on screen (no re-computation), and the
 * analytics as JSON. Pure client-side; nothing is uploaded.
 */
import { calendarSvg } from "@/lib/brief";
import { fmt, type YearTotal } from "@/lib/ember";

export { calendarSvg };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Annual totals as a standalone SVG line chart (raw and harmonized; the shown series drawn solid). */
export function annualSvg(o: { title: string; raw: YearTotal[]; harm: YearTotal[]; mode: "raw" | "harmonized"; note: string }): string {
  const W = 760, H = 300, L = 64, R = 16, T = 40, B = 48;
  const all = [...o.raw, ...o.harm].map((t) => t.value ?? 0);
  const max = Math.max(1, ...all) * 1.06;
  const years = o.raw.map((t) => t.year);
  const x = (y: number) => L + ((y - years[0]) / Math.max(1, years.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (ts: YearTotal[]) => ts.filter((t) => t.value != null).map((t, i) => `${i ? "L" : "M"}${x(t.year).toFixed(1)},${y(t.value!).toFixed(1)}`).join(" ");
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Helvetica, Arial, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
    `<text x="${L}" y="20" font-size="14" fill="#111">${esc(o.title)}</text>`];
  for (const f of [0, 0.25, 0.5, 0.75, 1]) {
    const v = f * max;
    out.push(`<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#ddd"/><text x="${L - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#555">${fmt(Math.round(v))}</text>`);
  }
  for (const yr of years) if (yr % 5 === 0 || yr === years[0] || yr === years[years.length - 1]) out.push(`<text x="${x(yr)}" y="${H - B + 16}" font-size="10" text-anchor="middle" fill="#555">${yr}</text>`);
  if (years[0] <= 2011 && years[years.length - 1] >= 2012) out.push(`<line x1="${x(2011.5)}" x2="${x(2011.5)}" y1="${T}" y2="${H - B}" stroke="#b3261e" stroke-dasharray="3 3"/><text x="${x(2011.5) + 4}" y="${T + 10}" font-size="10" fill="#b3261e">sensor change 2012</text>`);
  out.push(`<path d="${line(o.raw)}" fill="none" stroke="#7a6f5c" stroke-width="${o.mode === "raw" ? 2.5 : 1.2}" ${o.mode === "raw" ? "" : 'stroke-dasharray="4 3"'}/>`);
  out.push(`<path d="${line(o.harm)}" fill="none" stroke="#c93f1c" stroke-width="${o.mode === "harmonized" ? 2.5 : 1.2}" ${o.mode === "harmonized" ? "" : 'stroke-dasharray="4 3"'}/>`);
  out.push(`<text x="${L}" y="${H - 14}" font-size="10" fill="#555"><tspan fill="#7a6f5c">— raw (uncorrected)</tspan>  <tspan fill="#c93f1c">— harmonized (Aqua-equivalent)</tspan>  ${esc(o.note)}</text>`);
  out.push("</svg>");
  return out.join("");
}

export function downloadBlob(name: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const downloadSvg = (name: string, svg: string) => downloadBlob(name, new Blob([svg], { type: "image/svg+xml" }));

/** Rasterise an SVG string at `scale`x on a white background. */
export function downloadPng(name: string, svg: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = Math.ceil(img.width * scale); c.height = Math.ceil(img.height * scale);
      const g = c.getContext("2d");
      if (!g) { reject(new Error("no 2D canvas")); return; }
      g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => { if (b) { downloadBlob(name, b); resolve(); } else reject(new Error("PNG encoding failed")); }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("SVG could not be rendered")); };
    img.src = url;
  });
}
