import type { ReactNode } from "react";
import { Space_Grotesk, Hanken_Grotesk, JetBrains_Mono } from "next/font/google";
import Providers from "./providers";
import "./var/tokens.css";

// Rein design system typefaces — self-hosted by next/font, exposed as the
// CSS variables tokens.css reads (--font-space-grotesk, etc.).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});
const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken-grotesk",
  display: "swap",
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata = {
  title: "Verified Agent Rails",
  description: "Scoped onchain authority for AI agents, verified by World ID, settled on Arc",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${hankenGrotesk.variable} ${jetBrainsMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
