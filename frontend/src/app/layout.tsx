import type { Metadata } from "next";

// Design system CSS
import "@agent-stack/ui/styles/tokens.css";
import "@agent-stack/ui/styles/themes/index.css";
import "@agent-stack/ui/styles/calm-widgets.css";

export const metadata: Metadata = {
  title: "Agent Stack App",
  description: "Multi-agent AI application powered by Agent Stack",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="cyberpunk">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700&family=Share+Tech&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, padding: 0, overflow: "hidden", fontFamily: "var(--font-body)", background: "var(--bg)", color: "var(--text)" }}>
        {children}
      </body>
    </html>
  );
}
