import type { Metadata, Viewport } from "next";
import { Geist, Inter, Inter_Tight, JetBrains_Mono, Newsreader } from "next/font/google";
import { SmoothScroll } from "@/components/smooth-scroll";
import { InlineScript } from "@/components/inline-script";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["500", "600", "700"] });
// Editorial serif for descriptive copy; the opsz axis keeps small sizes sturdy and large ones refined.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], axes: ["opsz"] });
// Used sparingly, for small interface rows that need a crisper, more modern voice than Inter.
const geist = Geist({ variable: "--font-geist", subsets: ["latin"], weight: ["400", "500"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Handshake: safe deals between strangers",
  description:
    "Buy and sell with strangers without getting scammed. Handshake checks the deal with AI and real market prices, and PayPal holds the money until the item is real.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f1ec" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0e" },
  ],
};

// Runs before first paint so dark-mode visitors never see a light flash. A saved choice wins;
// otherwise the page follows the device setting, live.
const themeScript = `(function(){try{var d=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var t=localStorage.getItem("theme");d.dataset.theme=t==="light"||t==="dark"?t:m.matches?"dark":"light"}a();m.addEventListener("change",a)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${interTight.variable} ${newsreader.variable} ${jetbrains.variable} ${geist.variable}`}>
      <head>
        <InlineScript html={themeScript} />
      </head>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
