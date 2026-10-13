'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** The current time in ms, refreshed every `intervalMs` (for "changed recently", countdowns…). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * The active tab, kept in `?tab=` so links can open a tab and reloads keep it. Needs a
 * <Suspense> boundary above it (it reads search params).
 */
export function useTabParam<T extends string>(
  tabs: readonly T[],
  fallback: T,
): [T, (tab: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get('tab');
  const tab = raw !== null && (tabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
  const setTab = (next: string) => {
    const search = new URLSearchParams(params.toString());
    search.set('tab', next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };
  return [tab, setTab];
}
