"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import {
  readEligibility,
  readFeed,
  readMandate,
  type FeedEntry,
  type MandateView,
  type StatusView,
} from "./var";

// Polls the mirror for this agent: mandate + tx feed on an interval, eligibility
// on demand (it depends on the amount the user is probing).
export function useVar(agent: Address, amount: string) {
  const [mandate, setMandate] = useState<MandateView | null>(null);
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [status, setStatus] = useState<StatusView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [m, f] = await Promise.all([readMandate(agent), readFeed(agent)]);
      setMandate(m);
      setFeed(f);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [agent]);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await readEligibility(agent, amount));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [agent, amount]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 6000);
    return () => clearInterval(id);
  }, [refresh]);

  return { mandate, feed, status, error, refresh, refreshStatus };
}
