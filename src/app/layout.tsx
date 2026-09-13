import type { Metadata } from "next";
import { DM_Sans, Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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
      </body>
    </html>
  );
}
