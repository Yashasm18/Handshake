import { Nav } from "@/components/chrome";
import { Footer } from "@/components/feature";
import { StatusBoard } from "@/components/status-board";

export const metadata = { title: "Status · Handshake", description: "Live health of every service Handshake runs on: PayPal, the AI agents, Channel3, Kernel, Elastic, EasyPost, email and the deadline timer." };

export default function StatusPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-dvh max-w-[1100px] px-5 pb-24 pt-28 md:px-10 md:pt-36">
        <p className="label text-muted">Status</p>
        <h1 className="display mt-4 text-[clamp(44px,7vw,96px)]">Is everything working?</h1>
        <p className="mt-5 max-w-[620px] text-[18px] leading-relaxed text-muted">
          Every service Handshake depends on, checked live with real requests. If one goes down, the team gets an email, and money never moves on a guess: deals simply wait.
        </p>
        <StatusBoard />
      </main>
      <Footer />
    </>
  );
}
