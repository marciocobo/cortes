import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Matches the prototype's monospace brand mark ("CLIP STUDIO") and the
// blue all-caps eyebrow label above every page heading (BIBLIOTECA,
// AUTOMAÇÃO, ADMINISTRAÇÃO).
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Clip Studio",
  description: "Gerencia o envio de vídeos e os cortes gerados pela esteira n8n.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={mono.variable}>
      <body>{children}</body>
    </html>
  );
}
