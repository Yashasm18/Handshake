import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono, Newsreader } from "next/font/google";
import { SmoothScroll } from "@/components/smooth-scroll";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["500", "600", "700"] });
// Editorial serif for descriptive copy; the opsz axis keeps small sizes sturdy and large ones refined.
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], axes: ["opsz"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Handshake: safe deals between strangers",
  description:
    "Buy and sell with strangers without getting scammed. Handshake checks the deal with AI and real market prices, and PayPal holds the money until the item is real.",
};

export const viewport: Viewport = { themeColor: "#f3f1ec" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${newsreader.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
