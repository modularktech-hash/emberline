import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Apple touch icon: the "ember + line" mark on a cream tile (iOS rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FBF0E3" }}>
        <svg width="132" height="40" viewBox="0 0 40 12">
          <line x1="3" x2="24.5" y1="6" y2="6" stroke="#171C18" strokeWidth="5" strokeLinecap="round" />
          <circle cx="34" cy="6" r="4" fill="#E64218" />
        </svg>
      </div>
    ),
    size,
  );
}
