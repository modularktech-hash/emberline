import { ImageResponse } from "next/og";

export const alt = "Emberline: joining the MODIS and VIIRS fire records makes 2012 look like a jump in fire. We remove that step.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card: off-white, a dot grid, ink type and the one red dot. */
export default function Image() {
  const dots = Array.from({ length: 28 }, (_, i) => i);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f4f4f2", color: "#0b0b0b" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="120" height="36" viewBox="0 0 40 12">
            <line x1="3" x2="24.5" y1="6" y2="6" stroke="#0b0b0b" strokeWidth="5" strokeLinecap="round" />
            <circle cx="34" cy="6" r="4" fill="#d71921" />
          </svg>
          <div style={{ fontSize: 28, letterSpacing: 10, textTransform: "uppercase", fontWeight: 600 }}>Emberline</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontWeight: 700, fontSize: 68, letterSpacing: -2, lineHeight: 1.06 }}>
          <div>Joining two satellite records</div>
          <div>makes 2012 look like a fire jump.</div>
          <div style={{ color: "#6a6a66" }}>We remove that step.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10 }}>{dots.map((i) => <div key={i} style={{ width: 10, height: 10, borderRadius: 10, background: i === 9 ? "#d71921" : i < 9 ? "#c8c8c4" : "#0b0b0b" }} />)}</div>
          <div style={{ fontSize: 20, letterSpacing: 4, textTransform: "uppercase", color: "#6a6a66" }}>NASA FIRMS · MODIS + VIIRS · 2003–2025</div>
        </div>
      </div>
    ),
    size,
  );
}
