import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GLENS — GenLayer Intelligent Contract Analyzer",
  description:
    "Analyze, debug, and fix GenLayer Intelligent Contracts on-chain. Real validator consensus with 5 validators, AI-powered auditing, and automated remediation.",
  icons: {
    icon: "/glens-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)] font-[var(--font-display)] antialiased">
        {children}
      </body>
    </html>
  );
}
