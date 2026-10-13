'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { NoAccess, QueryState } from '@/components/query-state';
import { Kicker } from '@/components/ui/stat';
import { Pager } from '@/components/ui/pager';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';

const PAGE_SIZE = 50;

/** Audit target types the API records, with where each one lives in the admin. */
const TARGETS: Record<string, { label: string; href?: (id: string) => string }> = {
  match_day: { label: 'Match-day', href: (id) => `/days/${id}` },
  match: { label: 'Match' },
  entry: { label: 'Entry' },
  league: { label: 'League', href: (id) => `/leagues/${id}` },
  team: { label: 'Team' },
  jackpot: { label: 'Jackpot' },
  bank_payment: { label: 'Bank transfer' },
  payout_obligation: { label: 'Payout' },
  prize_contribution: { label: 'Sponsor money' },
  user: { label: 'Player', href: (id) => `/players/${id}` },
  admin_user: { label: 'Staff account' },
  settings: { label: 'Settings', href: () => '/settings' },
};

export function AuditScreen() {
  const admin = useAdmin();
  if (!can(admin)) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader kicker="Oversight" title="audit log" />
        <NoAccess what="the audit log" />
      </div>
    );
  }
  return <AuditLog />;
}

function AuditLog() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const targetType = params.get('targetType') ?? '';
  const targetId = params.get('targetId') ?? '';
  const [action, setAction] = useState(params.get('action') ?? '');
  const [idText, setIdText] = useState(targetId);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const actionPrefix = useDebounced(action.trim(), 350);

  const log = useQuery(
    api.admin.audit.list.queryOptions({
      input: {
        page,
        pageSize: PAGE_SIZE,
        targetType: targetType || undefined,
        targetId: targetId || undefined,
        action: actionPrefix || undefined,
      },
      placeholderData: keepPreviousData,
    }),
  );

  function setParam(key: 'targetType' | 'targetId', value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    setPage(1);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Oversight"
        title="audit log"
        description="Every change to money, results and settings, who made it and why. Newest first."
      />
      <div className="grid gap-3 md:grid-cols-[12rem_minmax(0,1fr)_minmax(0,16rem)]">
        <Field label="About">
          <Select
            value={targetType}
            onChange={(event) => setParam('targetType', event.target.value)}
          >
            <option value="">Anything</option>
            {Object.entries(TARGETS).map(([value, target]) => (
              <option key={value} value={value}>
                {target.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Record ID" hint="Paste an ID to see one record's history.">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setParam('targetId', idText.trim());
            }}
          >
            <Input
              value={idText}
              maxLength={80}
              spellCheck={false}
              className="font-mono text-xs"
              onChange={(event) => setIdText(event.target.value)}
            />
            <Button type="submit" variant="outline">
              Filter
            </Button>
            {targetId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setIdText('');
                  setParam('targetId', '');
                }}
              >
                Clear
              </Button>
            ) : null}
          </form>
        </Field>
        <Field label="Action starts with" hint="e.g. entry. or day.finalized">
          <Input
            value={action}
            maxLength={80}
            spellCheck={false}
            className="font-mono text-xs"
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>

      <QueryState query={log}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<ScrollText className="size-6" />}
              title="Nothing logged for this filter"
            />
          ) : (
            <div className="flex flex-col gap-3">
              <Card className={cn('p-0', log.isPlaceholderData && 'opacity-60')}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <span className="sr-only">Details</span>
                      </TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Who</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>About</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((entry) => {
                      const expanded = open.has(entry.id);
                      const target = TARGETS[entry.targetType];
                      const hasDetails =
                        entry.before !== null || entry.after !== null || entry.metadata !== null;
                      return (
                        <Fragment key={entry.id}>
                          <TableRow className={cn(expanded && 'border-b-0 bg-muted/40')}>
                            <TableCell className="py-2">
                              {hasDetails ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-expanded={expanded}
                                  aria-label={expanded ? 'Hide details' : 'Show details'}
                                  onClick={() => toggle(entry.id)}
                                >
                                  {expanded ? (
                                    <ChevronDown aria-hidden />
                                  ) : (
                                    <ChevronRight aria-hidden />
                                  )}
                                </Button>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {formatDateTime(entry.createdAt)}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <span className="font-semibold">{entry.actorName ?? 'Unknown'}</span>
                              <Badge variant="muted" className="ml-2">
                                {entry.actorType === 'admin'
                                  ? 'Staff'
                                  : entry.actorType === 'user'
                                    ? 'Player'
                                    : 'System'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-xs font-bold">
                              {entry.action}
                            </TableCell>
                            <TableCell className="text-xs">
                              <span className="block">{target?.label ?? entry.targetType}</span>
                              {entry.targetId ? (
                                target?.href ? (
                                  <Link
                                    href={target.href(entry.targetId)}
                                    className="font-mono text-muted-foreground underline-offset-4 hover:underline"
                                  >
                                    {entry.targetId.slice(0, 8)}
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    title="Show this record's history"
                                    className="font-mono text-muted-foreground underline-offset-4 hover:underline"
                                    onClick={() => {
                                      setIdText(entry.targetId ?? '');
                                      setParam('targetId', entry.targetId ?? '');
                                    }}
                                  >
                                    {entry.targetId.slice(0, 8)}
                                  </button>
                                )
                              ) : null}
                            </TableCell>
                            <TableCell className="max-w-72 text-xs text-muted-foreground">
                              {entry.reason ?? '—'}
                            </TableCell>
                          </TableRow>
                          {expanded ? (
                            <TableRow className="bg-muted/40">
                              <TableCell colSpan={6} className="pt-0">
                                <div className="grid gap-3 lg:grid-cols-3">
                                  <JsonBlock label="Before" value={entry.before} />
                                  <JsonBlock label="After" value={entry.after} />
                                  <JsonBlock label="Details" value={entry.metadata} />
                                </div>
                                {entry.targetId ? (
                                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                                    {entry.targetType} {entry.targetId}
                                  </p>
                                ) : null}
                              </TableCell>
                            </TableRow>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
              <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: Record<string, unknown> | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Kicker>{label}</Kicker>
      {value === null ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <pre className="max-h-80 overflow-auto rounded-sm bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
