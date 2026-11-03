import { Suspense } from "react";
import { Nav } from "@/components/chrome";
import { DealRoom } from "@/components/deal-room";

export const metadata = { title: "Deal · Handshake" };

export default function DealPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-dvh max-w-[1280px] px-5 pb-24 pt-28 md:px-10 md:pt-32">
        <Suspense>
          <DealRoom />
        </Suspense>
      </main>
    </>
  );
}
