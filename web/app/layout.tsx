import type { ReactNode } from "react";
import Providers from "./providers";

export const metadata = {
  title: "Verified Agent Rails",
  description: "Scoped onchain authority for AI agents, verified by World ID, settled on Arc",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
