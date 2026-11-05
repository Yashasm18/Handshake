import Link from "next/link";
import { Clause, LegalPage } from "@/components/legal";

export const metadata = { title: "Terms · Handshake", description: "The rules of a Handshake deal: how holds, delivery checks, claims and payouts work." };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" intro="Handshake helps two strangers trade safely: PayPal holds the buyer's money, and it's only paid to the seller once the item is checked. By using Handshake you agree to these terms.">
      <Clause title="What Handshake is">
        <p>Handshake is a tool on top of PayPal. It is not a bank, an escrow agent or a party to your sale. Money is held, captured and paid out by PayPal, under <a className="underline" href="https://www.paypal.com/us/legalhub/paypal/useragreement-full">PayPal&apos;s User Agreement</a>.</p>
      </Clause>
      <Clause title="Your account">
        <p>You sign in with your own PayPal account and are responsible for what happens with it. Sellers are paid into the PayPal account they signed in with. Don&apos;t create deals for someone else, or for items you don&apos;t have.</p>
      </Clause>
      <Clause title="How a deal works">
        <ul>
          <li>The buyer&apos;s payment is authorized by PayPal and held, not charged, until the deal settles.</li>
          <li>For shipped deals, the seller ships to the buyer&apos;s PayPal address within the deadline shown on the deal. A label to a different address is stopped.</li>
          <li>For in-person deals, the buyer pays the seller at the meetup by scanning the seller&apos;s handover code.</li>
          <li>If the item arrives as described, the buyer confirms and the seller is paid, minus PayPal&apos;s fee. If the buyer doesn&apos;t respond in time, the deal settles automatically.</li>
          <li>If it doesn&apos;t match the listing, the buyer reports it with a photo. Handshake proposes a partial refund based on real part prices; both sides must accept it. Otherwise the case goes to PayPal&apos;s Resolution Center.</li>
          <li>If a deadline passes before shipping, the hold is released and the buyer isn&apos;t charged.</li>
        </ul>
      </Clause>
      <Clause title="The AI checks">
        <p>Scam checks, price comparisons, negotiation and claim reviews are made by AI models and real store data. They are guidance to help you decide, not a guarantee that a deal is safe or an item is genuine. Money only moves under the rules above, never on the AI&apos;s word alone.</p>
      </Clause>
      <Clause title="Not allowed">
        <p>Illegal, stolen, counterfeit or prohibited items (see PayPal&apos;s Acceptable Use Policy); using Handshake to scam, harass or collect someone&apos;s details; and trying to break or overload the service.</p>
      </Clause>
      <Clause title="Liability">
        <p>Handshake is provided as is. We aren&apos;t liable for the items traded, for what buyers and sellers do, or for decisions PayPal makes about a payment. Nothing here limits rights you have under PayPal&apos;s own buyer and seller protection.</p>
      </Clause>
      <Clause title="Sandbox">
        <p>Handshake currently runs on the PayPal sandbox: no real money moves. These terms will be updated before it handles real payments.</p>
      </Clause>
      <Clause title="Privacy">
        <p>How we handle your data is in the <Link className="underline" href="/privacy">Privacy policy</Link>.</p>
      </Clause>
    </LegalPage>
  );
}
