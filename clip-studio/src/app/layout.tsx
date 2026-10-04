import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// Geist is the interface face (body, headings, controls); Geist Mono is
// reserved for the "Clip Studio" wordmark and the all-caps eyebrow label
// above every page heading (BIBLIOTECA, AUTOMAÇÃO, ADMINISTRAÇÃO). Both
// are exposed as CSS variables and composed into --font-sans/--font-mono
// in globals.css. Weights match the design system: 400/500/600 only.
const sans = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-geist-sans",
});

const mono = Geist_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Clip Studio",
  description: "Gerencia o envio de vídeos e os cortes gerados pela esteira n8n.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
