'use client';

import { useEffect, useState } from 'react';

/**
 * Milliseconds to add to this device's clock to get the server's, from a response's `serverNow`
 * and the moment it arrived (a query's `dataUpdatedAt`). Phones are often minutes off.
 */
export function clockOffset(serverNow: string | null | undefined, receivedAt: number): number {
  if (!serverNow || !receivedAt) return 0;
  const server = new Date(serverNow).getTime();
  return Number.isNaN(server) ? 0 : server - receivedAt;
}

/** The server's time right now (ms), ticking every `intervalMs`. */
export function useServerNow(offsetMs: number, intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now + offsetMs;
}
