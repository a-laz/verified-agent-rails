import type { ReactNode } from "react";

export const metadata = {
  title: "Verified Agent Rails",
  description: "Scoped onchain authority for AI agents, verified by World ID, settled on Arc",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
