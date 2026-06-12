"use client";

import { DynamicWidget } from "@dynamic-labs/sdk-react-core";

export default function Home() {
  return (
    <main style={{ fontFamily: "monospace", padding: "4rem" }}>
      <h1>Verified Agent Rails</h1>
      <DynamicWidget />
    </main>
  );
}
