import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
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
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#060a14] text-gray-100 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
