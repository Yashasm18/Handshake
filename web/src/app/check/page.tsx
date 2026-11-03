import { Suspense } from "react";
import { Nav } from "@/components/chrome";
import { CheckFlow } from "@/components/check-flow";

export const metadata = { title: "Check a deal · Handshake" };

export default function CheckPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-dvh max-w-[1100px] px-5 pb-24 pt-28 md:px-10 md:pt-36">
        <Suspense>
          <CheckFlow />
        </Suspense>
      </main>
    </>
  );
}
