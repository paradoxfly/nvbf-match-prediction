'use client';

import { cn } from '@predict/ui/utils';
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): arrow keys move between tabs, only the selected tab
 * is in the tab order, and the panel is labelled by its tab.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  children,
  className,
}: {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const tabId = (item: T) => `${baseId}-tab-${item}`;
  const panelId = `${baseId}-panel`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = items.findIndex((item) => item.value === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${CSS.escape(tabId(target.value))}`)
      ?.focus();
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div
        ref={listRef}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="inline-flex w-fit gap-1 rounded-full bg-muted p-1"
      >
        {items.map((item) => {
          const selected = item.value === value;
          return (
            <button
              key={item.value}
              id={tabId(item.value)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(item.value)}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
                selected
                  ? 'bg-sg-night text-sg-flash'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={tabId(value)} tabIndex={0}>
        {children}
      </div>
    </div>
  );
}
