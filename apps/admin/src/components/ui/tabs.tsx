'use client';

import { cn } from '@predict/ui/utils';
import {
  createContext,
  useContext,
  useId,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

interface TabsState {
  value: string;
  onValueChange: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsState | null>(null);

function useTabs(): TabsState {
  const state = useContext(TabsContext);
  if (!state) throw new Error('Tabs parts must be used inside <Tabs>');
  return state;
}

const safeId = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_');

/** Controlled tabs (WAI-ARIA tabs pattern). Inactive panels are not rendered. */
export function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: ReactNode;
}) {
  const baseId = useId();
  return (
    <TabsContext.Provider value={{ value, onValueChange, baseId }}>
      <div className={cn('flex min-w-0 flex-col gap-4', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
  const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (!keys.includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
  );
  const current = tabs.findIndex((tab) => tab === document.activeElement);
  if (current === -1 || tabs.length === 0) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus();
  tabs[next]?.click();
}

export function TabsList({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className="max-w-full overflow-x-auto">
      <div
        role="tablist"
        onKeyDown={moveFocus}
        className={cn('inline-flex min-w-max gap-1 rounded-full bg-muted p-1', className)}
        {...props}
      >
        {children}
      </div>
    </div>
  );
}

export function TabsTrigger({
  value,
  className,
  children,
  count,
  ...props
}: Omit<ComponentProps<'button'>, 'value'> & { value: string; count?: number | null }) {
  const tabs = useTabs();
  const selected = tabs.value === value;
  return (
    <button
      type="button"
      role="tab"
      id={`${tabs.baseId}-tab-${safeId(value)}`}
      aria-selected={selected}
      aria-controls={`${tabs.baseId}-panel-${safeId(value)}`}
      tabIndex={selected ? 0 : -1}
      onClick={() => tabs.onValueChange(value)}
      className={cn(
        'inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-40',
        selected && 'bg-background text-foreground shadow-card',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && count !== null ? (
        <span
          className={cn(
            'rounded-full px-1.5 font-mono text-[10px] leading-4',
            count > 0 ? 'bg-sg-night text-sg-flash' : 'bg-sg-night/10 text-muted-foreground',
          )}
        >
          {count > 999 ? '999+' : count}
        </span>
      ) : null}
    </button>
  );
}

export function TabsContent({
  value,
  className,
  children,
  ...props
}: Omit<ComponentProps<'div'>, 'value'> & { value: string }) {
  const tabs = useTabs();
  if (tabs.value !== value) return null;
  return (
    <div
      role="tabpanel"
      id={`${tabs.baseId}-panel-${safeId(value)}`}
      aria-labelledby={`${tabs.baseId}-tab-${safeId(value)}`}
      className={cn('min-w-0 outline-none', className)}
      {...props}
    >
      {children}
    </div>
  );
}
