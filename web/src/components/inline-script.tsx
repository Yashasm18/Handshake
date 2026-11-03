"use client";

// A script that runs while the HTML is parsed (before first paint). In the browser React renders it
// as text/plain so it doesn't warn about script tags; suppressHydrationWarning accepts the type change.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
