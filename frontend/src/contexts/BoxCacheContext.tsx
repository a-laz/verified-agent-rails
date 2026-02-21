"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";

const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_URL =
  typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? ""
    : RAW_API_URL;
const BOX_ENDPOINT = API_URL
  ? `${API_URL}/api/box/Orchestrator`
  : `/api/proxy/box/Orchestrator`;
const POLL_INTERVAL_MS = 2000;

interface BoxCacheContextValue {
  cache: Record<string, unknown>;
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => Record<string, unknown>;
}

const BoxCacheContext = createContext<BoxCacheContextValue | null>(null);

export function BoxCacheProvider({ children }: { children: React.ReactNode }) {
  const cacheRef = useRef<Record<string, unknown>>({});
  const listenersRef = useRef<Set<() => void>>(new Set());

  const subscribe = useCallback((cb: () => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  const getSnapshot = useCallback(() => cacheRef.current, []);

  const notifyAll = useCallback(() => {
    listenersRef.current.forEach((cb) => cb());
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const res = await fetch(BOX_ENDPOINT);
        if (!res.ok) return;
        const data = await res.json();
        const newJson = JSON.stringify(data);
        const oldJson = JSON.stringify(cacheRef.current);
        if (newJson !== oldJson) {
          cacheRef.current = data as Record<string, unknown>;
          notifyAll();
        }
      } catch {
        // Backend may be down — suppress
      }
    };

    poll();
    const intervalId = setInterval(() => { if (active) poll(); }, POLL_INTERVAL_MS);
    return () => { active = false; clearInterval(intervalId); };
  }, [notifyAll]);

  const value = useMemo<BoxCacheContextValue>(
    () => ({ cache: cacheRef.current, subscribe, getSnapshot }),
    [subscribe, getSnapshot]
  );

  return <BoxCacheContext.Provider value={value}>{children}</BoxCacheContext.Provider>;
}

export function useBox<T = unknown>(key: string): T | null {
  const ctx = useContext(BoxCacheContext);
  if (!ctx) throw new Error("useBox must be used within <BoxCacheProvider>");
  const { subscribe, getSnapshot } = ctx;
  const cache = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const value = cache[key];
  return (value as T) ?? null;
}
