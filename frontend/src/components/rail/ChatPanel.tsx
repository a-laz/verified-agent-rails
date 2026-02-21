"use client";

import React, { useCallback, useRef, useState } from "react";
import { useChatContext } from "@/contexts/ChatContext";
import ChatStream from "./ChatStream";

export default function ChatPanel() {
  const { messages, loading, error, sendMessage } = useChatContext();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || loading) return;
    sendMessage(text);
    setInput("");
    inputRef.current?.focus();
  }, [input, loading, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
        <ChatStream messages={messages} loading={loading} />
        {error && (
          <div style={{ padding: "8px 12px", margin: "8px 12px", background: "var(--danger-soft)", color: "var(--danger)", borderRadius: "6px", fontSize: "0.85rem" }}>
            {error}
          </div>
        )}
      </div>
      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            rows={2}
            style={{
              flex: 1, resize: "none", padding: "8px 12px", borderRadius: "8px",
              border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)",
              fontSize: "0.9rem", fontFamily: "var(--font-body)", outline: "none",
            }}
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: "8px 16px", borderRadius: "8px", border: "none",
              background: loading || !input.trim() ? "var(--panel-2)" : "var(--accent)",
              color: "var(--text-inverse)", cursor: loading || !input.trim() ? "not-allowed" : "pointer",
              fontSize: "0.85rem", fontFamily: "var(--font-body)", fontWeight: 600,
              opacity: loading || !input.trim() ? 0.5 : 1, alignSelf: "flex-end",
            }}
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
