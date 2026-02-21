"use client";

import React, { useEffect, useRef } from "react";
import type { ChatMessage } from "@/contexts/ChatContext";

interface ChatStreamProps {
  messages: ChatMessage[];
  loading: boolean;
}

export default function ChatStream({ messages, loading }: ChatStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, loading]);

  return (
    <div style={{ padding: "12px", fontFamily: "var(--font-body)" }}>
      {messages.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 16px", color: "var(--muted)", fontSize: "0.9rem" }}>
          <p>Start a conversation with the AI assistant.</p>
          <p style={{ fontSize: "0.8rem", marginTop: "8px", color: "var(--subtle)" }}>
            Try asking a question to see the agents in action.
          </p>
        </div>
      )}

      {messages.map((m) => (
        <div
          key={m.id}
          style={{
            marginBottom: "12px",
            display: "flex",
            flexDirection: "column",
            alignItems: m.role === "user" ? "flex-end" : "flex-start",
          }}
        >
          <div
            style={{
              maxWidth: "85%",
              padding: "8px 12px",
              borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
              background: m.role === "user" ? "var(--accent)" : "var(--glass-bg-dense)",
              color: m.role === "user" ? "var(--text-inverse)" : "var(--text)",
              border: m.role === "assistant" ? "1px solid var(--glass-border)" : "none",
              fontSize: "0.9rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {m.content || (loading && m.role === "assistant" ? "\u2588" : "")}
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "2px" }}>
            {m.role === "user" ? "You" : "Assistant"}
          </div>
        </div>
      ))}

      {loading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", color: "var(--accent)", fontSize: "0.85rem" }}>
          Thinking...
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
