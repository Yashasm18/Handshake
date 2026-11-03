"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";

type PayPalNamespace = {
  Buttons: (opts: {
    style?: Record<string, unknown>;
    createOrder: () => Promise<string>;
    onApprove: (data: { orderID: string }) => Promise<void>;
    onError?: (err: unknown) => void;
    onCancel?: () => void;
  }) => { render: (el: HTMLElement) => Promise<void>; close: () => void };
};

let sdk: Promise<PayPalNamespace> | null = null;

function loadSdk(clientId: string) {
  sdk ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&intent=authorize&currency=USD&components=buttons&disable-funding=paylater`;
    s.onload = () => resolve((window as unknown as { paypal: PayPalNamespace }).paypal);
    s.onerror = () => {
      sdk = null;
      reject(new Error("Couldn't load PayPal."));
    };
    document.head.appendChild(s);
  });
  return sdk;
}

// The buyer approves in PayPal's own window; our server then turns the approval into a hold.
export function PayPalButton({ dealId, onHeld, onError }: { dealId: string; onHeld: () => void; onError: (m: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let buttons: { close: () => void } | null = null;
    let cancelled = false;
    (async () => {
      try {
        const { paypalClientId } = await api<{ paypalClientId: string }>("/api/config");
        const paypal = await loadSdk(paypalClientId);
        if (cancelled || !ref.current) return;
        const b = paypal.Buttons({
          style: { layout: "vertical", shape: "pill", color: "gold", label: "pay", height: 52 },
          createOrder: async () => (await api<{ orderId: string }>(`/api/deals/${dealId}/pay`, {})).orderId,
          onApprove: async ({ orderID }) => {
            await api(`/api/deals/${dealId}/confirm-payment`, { orderId: orderID });
            onHeld();
          },
          onError: () => onError("PayPal couldn't complete that. Try again."),
        });
        buttons = b;
        await b.render(ref.current);
        setReady(true);
      } catch (e) {
        onError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      buttons?.close();
    };
  }, [dealId, onHeld, onError]);

  return (
    <div className="relative min-h-[56px]">
      {!ready && <div className="absolute inset-0 animate-pulse rounded-full bg-[#ffc439]/40" />}
      <div ref={ref} />
    </div>
  );
}
