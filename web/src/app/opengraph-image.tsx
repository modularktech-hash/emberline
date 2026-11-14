import { ImageResponse } from "next/og";

export const alt = "Emberline — satellite fire detections, harmonized across the MODIS–VIIRS sensor change";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card in the house style: cream paper, ember glow, ink mark, sans headline. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72,
        background: "radial-gradient(700px 500px at 10% 0%, rgba(255,140,90,0.35), transparent 70%), radial-gradient(600px 500px at 95% 100%, rgba(255,196,100,0.35), transparent 70%), #f7f3e8", color: "#121715" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <svg width="120" height="36" viewBox="0 0 40 12">
            <line x1="3" x2="24.5" y1="6" y2="6" stroke="#171C18" strokeWidth="5" strokeLinecap="round" />
            <circle cx="34" cy="6" r="4" fill="#E64218" />
          </svg>
          <div style={{ fontSize: 28, letterSpacing: 9, textTransform: "uppercase", fontWeight: 600 }}>Emberline</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontWeight: 700 }}>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1 }}>23 years of detections.</div>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1.05, color: "#d9431a" }}>One steady line.</div>
        </div>
        <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#5e5a54" }}>NASA FIRMS · MODIS + VIIRS · per-country fits</div>
      </div>
    ),
    size,
  );
}
