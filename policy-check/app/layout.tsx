import type { Metadata } from "next";
import { Geist, Libre_Baskerville, Roboto_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const baskerville = Libre_Baskerville({
  variable: "--font-baskerville",
  subsets: ["latin"],
  weight: ["400", "700"],
});
const robotoMono = Roboto_Mono({
  variable: "--font-roboto-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
