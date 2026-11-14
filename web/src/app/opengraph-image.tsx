import { ImageResponse } from "next/og";

export const alt = "Emberline — 25 years of fire, one unbroken line";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social card in the house style: cream paper, ember glow, ink mark, serif headline. */
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72,
        background: "radial-gradient(700px 500px at 10% 0%, rgba(255,140,90,0.35), transparent 70%), radial-gradient(600px 500px at 95% 100%, rgba(255,196,100,0.35), transparent 70%), #f7f3e8", color: "#121715" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: "#121715", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#d9431a", boxShadow: "0 0 18px 4px rgba(217,67,26,0.6)" }} />
          </div>
          <div style={{ fontSize: 26, letterSpacing: 8, textTransform: "uppercase" }}>Emberline</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontFamily: "Georgia, serif" }}>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1 }}>25 years of fire.</div>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1.05, color: "#d9431a", fontStyle: "italic" }}>One unbroken line.</div>
        </div>
        <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#5e5a54" }}>NASA FIRMS · MODIS + VIIRS harmonized</div>
      </div>
    ),
    size,
  );
}
