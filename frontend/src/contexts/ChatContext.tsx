"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const CHAT_ENDPOINT =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? "/api/proxy/chat/stream"
    : `${RAW_API_URL}/api/chat/stream`;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ChatContextValue {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (content: string) => void;
  resetChat: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChatContext(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChatContext must be used within <ChatProvider>");
  return ctx;
}

let _nextId = 1;
function genId(): string {
  return `msg-${Date.now()}-${_nextId++}`;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim()) return;
      if (abortRef.current) abortRef.current.abort();

      const userMsg: ChatMessage = {
        id: genId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setLoading(true);
      setError(null);

      const assistantId = genId();
      const allMessages = [...messages, userMsg];
      const apiMessages = allMessages.map((m) => ({ role: m.role, content: m.content }));

      const controller = new AbortController();
      abortRef.current = controller;

      fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, agent: "Orchestrator" }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          const reader = response.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";
          let assistantCreated = false;

          const ensureAssistantMessage = () => {
            if (!assistantCreated) {
              assistantCreated = true;
              setMessages((prev) => [
                ...prev,
                { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
              ]);
            }
          };

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            let eventType = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                const dataStr = line.slice(6);
                try {
                  const data = JSON.parse(dataStr);
                  switch (eventType || "message") {
                    case "text":
                      ensureAssistantMessage();
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantId ? { ...m, content: m.content + (data.delta || "") } : m
                        )
                      );
                      break;
                    case "done":
                      setLoading(false);
                      break;
                    case "error":
                      setError(data.message || "Unknown error");
                      setLoading(false);
                      break;
                  }
                } catch { /* skip parse errors */ }
                eventType = "";
              } else if (line === "") {
                eventType = "";
              }
            }
          }
          setLoading(false);
        })
        .catch((err: Error) => {
          if (err.name === "AbortError") return;
          setError(err.message || "Connection failed");
          setLoading(false);
        });
    },
    [messages]
  );

  const resetChat = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setError(null);
    setLoading(false);
  }, []);

  const value = useMemo<ChatContextValue>(
    () => ({ messages, loading, error, sendMessage, resetChat }),
    [messages, loading, error, sendMessage, resetChat]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
