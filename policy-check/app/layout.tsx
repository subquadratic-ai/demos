import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted from the @fontsource packages (Latin subset, as Google Fonts serves it), so `next build`
// never fetches from Google Fonts. Paths are relative to this file and must be string literals.
const geist = localFont({
  variable: "--font-geist",
  src: "../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
  weight: "100 900",
});
const baskerville = localFont({
  variable: "--font-baskerville",
  src: [
    { path: "../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-400-normal.woff2", weight: "400" },
    { path: "../node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-700-normal.woff2", weight: "700" },
  ],
  adjustFontFallback: "Times New Roman",
});
const robotoMono = localFont({
  variable: "--font-roboto-mono",
  src: [
    { path: "../node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-400-normal.woff2", weight: "400" },
    { path: "../node_modules/@fontsource/roboto-mono/files/roboto-mono-latin-500-normal.woff2", weight: "500" },
  ],
});

export const metadata: Metadata = {
  title: "Is this in policy?",
  description: "Check a claim against a 380-page policy. All of it is read in one request, and every clause the claim contradicts is found in seconds.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${baskerville.variable} ${robotoMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
