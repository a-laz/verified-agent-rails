"use client";

import React from "react";

import { ThemeProvider } from "@/contexts/ThemeContext";
import { BoxCacheProvider } from "@/contexts/BoxCacheContext";
import { ChatProvider } from "@/contexts/ChatContext";
import { AgentManifestProvider } from "@/contexts/AgentManifestContext";
import AppShell from "@/components/shell/AppShell";

export default function Home() {
  return (
    <ThemeProvider>
      <BoxCacheProvider>
        <ChatProvider>
          <AgentManifestProvider>
            <AppShell />
          </AgentManifestProvider>
        </ChatProvider>
      </BoxCacheProvider>
    </ThemeProvider>
  );
}
