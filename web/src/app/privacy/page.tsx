import { Clause, LegalPage } from "@/components/legal";

export const metadata = { title: "Privacy · Handshake", description: "What Handshake stores, why, who it's shared with, and how to delete it." };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" intro="Handshake keeps only what a deal needs to protect both people, shows each side only what that side needs, and never sees your PayPal password or card.">
      <Clause title="What we collect">
        <ul>
          <li><b>When you sign in with PayPal:</b> your name, email, PayPal account id (payer id) and whether PayPal has verified your account. PayPal shares these only after you approve it on PayPal&apos;s own page. We never see your password.</li>
          <li><b>When you create a deal:</b> the item, price, condition promises, an optional photo, your lowest price if you take offers, and how the item is handed over.</li>
          <li><b>When you pay:</b> PayPal tells us the shipping address on your PayPal account and the ids of the payment, so we can check the label and move the money. Card details go to PayPal, never to us.</li>
          <li><b>When you check a deal:</b> the text, screenshot or link you give us. Scams we catch are remembered (see below).</li>
          <li><b>Email updates:</b> the email PayPal shares with us, or one you type in and confirm from your inbox. It&apos;s only used to tell you when your deal needs you, and every email has a link to stop them.</li>
          <li><b>Rate limits:</b> a one-way, keyed hash of your network address, so abuse can be limited without storing the address itself.</li>
        </ul>
      </Clause>
      <Clause title="Who sees what">
        <p>The buyer sees the seller&apos;s first name and whether their PayPal account is verified, never their email or account id. The seller sees the buyer&apos;s shipping address only for shipped deals, never for in-person handovers. Someone holding a deal link without being part of it sees the item and its status only.</p>
      </Clause>
      <Clause title="Services we use">
        <ul>
          <li><b>PayPal</b> for sign-in, holds, captures and payouts.</li>
          <li><b>OpenRouter</b> (AI models) to read listings, chats, labels and delivery photos, only through providers that don&apos;t store or train on what they&apos;re sent.</li>
          <li><b>Channel3</b> for store prices of the item.</li>
          <li><b>Kernel</b> to open a listing link in a cloud browser.</li>
          <li><b>Elastic</b> for scam memory: the wording, contact details and photo fingerprints of high-risk listings, so the next buyer can be warned.</li>
          <li><b>Render</b> to host the site and store deals.</li>
          <li><b>Gmail</b> or <b>Resend</b> to send deal emails.</li>
          <li><b>EasyPost</b> to follow a shipped parcel with its carrier. It gets the tracking number and carrier only.</li>
        </ul>
        <p>We don&apos;t sell personal data or use it for advertising.</p>
      </Clause>
      <Clause title="Cookies">
        <p>Only the ones the site needs: your PayPal sign-in (30 days), a per-deal cookie that proves which side you are, a short-lived cookie that protects sign-in from forgery, and your light or dark theme. No tracking or advertising cookies.</p>
      </Clause>
      <Clause title="How long we keep it">
        <p>Deals are kept while they&apos;re open and for a year after they close, so a dispute can still be resolved. Signing out removes your session from this browser. To delete your deals and account details, contact us through the repository below and we&apos;ll remove them within 30 days, except where a payment record must be kept.</p>
      </Clause>
      <Clause title="Sandbox">
        <p>Handshake currently runs on the PayPal sandbox. Accounts and money on it are test accounts and test money.</p>
      </Clause>
      <Clause title="Contact">
        <p>Questions or deletion requests: open an issue at <a className="underline" href="https://github.com/Yashasm18/HandShake">github.com/Yashasm18/HandShake</a>.</p>
      </Clause>
    </LegalPage>
  );
}
