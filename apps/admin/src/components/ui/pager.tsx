'use client';

import { Button } from '@predict/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** "21–40 of 133" with previous/next buttons. Hidden when everything fits on one page. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize && page === 1) return null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 px-1">
      <p className="font-mono text-xs text-muted-foreground">
        {from.toLocaleString('en-NG')}–{to.toLocaleString('en-NG')} of{' '}
        {total.toLocaleString('en-NG')}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft aria-hidden />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
