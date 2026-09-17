import type { Metadata, Viewport } from "next";
import { DM_Sans, Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RevealObserver } from "@/components/motion/RevealObserver";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const editorialSans = DM_Sans({ variable: "--font-editorial-sans", subsets: ["latin"], display: "swap" });
const editorialSerif = Fraunces({ variable: "--font-editorial-serif", subsets: ["latin"], style: ["normal", "italic"], display: "swap" });

export const metadata: Metadata = {
  title: "Packaging Studio",
  description: "Design a printable surface and preview it live on a 3D product model.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the colour at the very top of the page, so the phone's status bar
  // reads as part of the chrome rather than a band above it.
  themeColor: "#F5F1E8",
  // The studio palette is light-only; saying so stops the browser inverting
  // form controls for a dark theme the app does not have.
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${editorialSans.variable} ${editorialSerif.variable} h-full antialiased`}
    >
      {/* Extensions commonly decorate <body> before React hydrates; the
          suppression is scoped to this element only. */}
      <body suppressHydrationWarning className="flex min-h-full flex-col bg-[var(--st-bg)]">
        {children}
        {/* Renders nothing; reveals [data-reveal] surfaces as they scroll in. */}
        <RevealObserver />
      </body>
    </html>
  );
}
