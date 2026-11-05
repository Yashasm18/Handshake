import { Suspense } from "react";
import { Nav } from "@/components/chrome";
import { EmailLink } from "@/components/email-link";

export const metadata = { title: "Email updates · Handshake", robots: { index: false } };

export default function EmailPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto min-h-dvh max-w-[720px] px-5 pb-24 pt-28 md:px-10 md:pt-40">
        <Suspense>
          <EmailLink />
        </Suspense>
      </main>
    </>
  );
}
