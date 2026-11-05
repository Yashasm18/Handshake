import type { ReactNode } from "react";
import { Nav } from "./chrome";
import { Footer } from "./feature";

export const LEGAL_UPDATED = "November 5, 2026";

export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-28 md:px-10 md:pt-36">
        <p className="label text-muted">Updated {LEGAL_UPDATED}</p>
        <h1 className="display mt-4 text-[clamp(44px,7vw,88px)]">{title}</h1>
        <p className="mt-6 text-[19px] leading-relaxed text-muted">{intro}</p>
        <div className="mt-14 space-y-12">{children}</div>
      </main>
      <Footer />
    </>
  );
}

export function Clause({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[24px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[17px] leading-relaxed text-ink/80 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1">{children}</div>
    </section>
  );
}
