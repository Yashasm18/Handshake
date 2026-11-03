import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: the same two interlocking rings as the logo, on ink. iOS rounds the corners itself.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#111110" }}>
        <svg width="120" height="120" viewBox="0 0 32 32">
          <circle cx="12" cy="16" r="9" fill="none" stroke="#f3f1ec" strokeWidth="2.4" />
          <circle cx="20" cy="16" r="9" fill="none" stroke="#f3f1ec" strokeWidth="2.4" />
        </svg>
      </div>
    ),
    size,
  );
}
