'use client';

import { cn } from '@predict/ui/utils';
import { CircleAlert, CircleCheck, XIcon } from 'lucide-react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastVariant = 'default' | 'success' | 'destructive';

interface ToastInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Short confirmations after an action ("Payment confirmed"). Errors stay inline in forms. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (toast: ToastInput) => {
      nextId.current += 1;
      const id = nextId.current;
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), toast.variant === 'destructive' ? 9000 : 5000);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === 'destructive' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg bg-sg-night p-4 text-sm text-white shadow-card',
              toast.variant === 'destructive' && 'bg-destructive',
            )}
          >
            {toast.variant === 'destructive' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-sg-flash" aria-hidden />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="font-bold">{toast.title}</p>
              {toast.description ? <p className="text-white/80">{toast.description}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="rounded-full p-0.5 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <XIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
