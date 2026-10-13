'use client';

import { useEffect, useRef } from 'react';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
      size?: 'normal' | 'flexible' | 'compact';
    },
  ): string;
  reset(widgetId?: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile failed to load'));
    document.head.appendChild(script);
  });
  return scriptLoading;
}

/** True when this deployment protects "text me a code" with Cloudflare Turnstile. */
export const turnstileEnabled = Boolean(SITE_KEY);

/**
 * Cloudflare's bot check for the "text me a code" form (texts cost money, so bots shouldn't
 * trigger them). Renders nothing when no site key is configured.
 */
export function Turnstile({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void;
  /** Change it to get a fresh token (each token works once). */
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  // Keep the latest callback without re-rendering the widget when it changes.
  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    if (!SITE_KEY || !container.current) return;
    let cancelled = false;
    void loadScript()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widget.current = window.turnstile.render(container.current, {
          sitekey: SITE_KEY,
          size: 'flexible',
          callback: (token) => callback.current(token),
          'expired-callback': () => callback.current(null),
          'error-callback': () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey === undefined || !widget.current || !window.turnstile) return;
    callback.current(null);
    window.turnstile.reset(widget.current);
  }, [resetKey]);

  if (!SITE_KEY) return null;
  return <div ref={container} className="min-h-[65px]" />;
}
