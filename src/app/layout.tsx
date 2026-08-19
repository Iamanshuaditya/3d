import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Extensions commonly decorate <body> before React hydrates; the
          suppression is scoped to this element only. */}
      <body suppressHydrationWarning className="flex min-h-full flex-col bg-[var(--st-bg)]">
        {children}
      </body>
    </html>
  );
}
