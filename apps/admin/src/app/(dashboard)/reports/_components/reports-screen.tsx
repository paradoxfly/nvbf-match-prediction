'use client';

import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChartColumn, Download } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { PageHeader } from '@/components/page-header';
import { NoAccess, QueryState } from '@/components/query-state';
import { DayStatusBadge } from '@/components/status-badges';
import { Stat } from '@/components/ui/stat';
import { api } from '@/lib/api';
import { formatDateTime, formatNaira, formatShortDay } from '@/lib/format';
import type { Reconciliation } from '@/lib/types';

type Report = Reconciliation;
type Totals = Report['totals'];

/** Ledger columns, in the order money flows: in, allocated, then paid out. */
const COLUMNS: { key: keyof Totals; label: string; title: string }[] = [
  { key: 'collections', label: 'Entry fees', title: 'Confirmed entry fees collected' },
  {
    key: 'contributions',
    label: 'Sponsors & top-ups',
    title: 'Allocated sponsor, operator and rollover money',
  },
  { key: 'prizesAwarded', label: 'Prizes', title: 'Prize money awarded to winners' },
  { key: 'jackpotCut', label: 'To jackpot', title: 'Share sent to the league jackpot' },
  { key: 'jackpotAwarded', label: 'Jackpot won', title: 'Jackpot prize awarded' },
  { key: 'operations', label: 'Operations', title: 'Operations share, including rounding' },
  { key: 'refundsOwed', label: 'Refunds owed', title: 'Refunds recorded as owed' },
  { key: 'payoutsPaid', label: 'Prizes paid', title: 'Prize and jackpot transfers sent' },
  { key: 'refundsPaid', label: 'Refunds paid', title: 'Refund transfers sent' },
];

/** Exact naira with 2 decimals for spreadsheets ("1234.50"), from integer kobo. */
function nairaDecimal(kobo: number): string {
  const sign = kobo < 0 ? '-' : '';
  const abs = Math.abs(kobo);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

const csvCell = (value: string) =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

function toCsv(report: Report): string {
  const header = [
    'date',
    'status',
    ...COLUMNS.map((column) => column.key),
    'outstanding',
    'balanced',
  ];
  const lines = [header.join(',')];
  for (const day of report.days) {
    lines.push(
      [
        day.date,
        day.status,
        ...COLUMNS.map((column) => nairaDecimal(day.totals[column.key])),
        nairaDecimal(day.outstandingKobo),
        day.balanced === null ? 'not final' : day.balanced ? 'yes' : 'no',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  lines.push(
    ['total', '', ...COLUMNS.map((column) => nairaDecimal(report.totals[column.key])), '', '']
      .map(csvCell)
      .join(','),
  );
  lines.push('');
  lines.push('transfers,received,applied,refunded,unused');
  lines.push(
    [
      '',
      nairaDecimal(report.transfers.receivedKobo),
      nairaDecimal(report.transfers.appliedKobo),
      nairaDecimal(report.transfers.refundedKobo),
      nairaDecimal(report.transfers.unappliedKobo),
    ].join(','),
  );
  return `${lines.join('\n')}\n`;
}

function download(report: Report, leagueName: string | null) {
  const blob = new Blob([toCsv(report)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = leagueName ? `-${leagueName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
  link.href = url;
  link.download = `reconciliation${slug}-${report.generatedAt.slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function ReportsScreen() {
  const admin = useAdmin();
  const finance = can(admin, 'finance');
  const [leagueId, setLeagueId] = useState('');
  const leagues = useQuery(api.admin.leagues.list.queryOptions({ enabled: finance }));
  const report = useQuery(
    api.admin.reports.reconciliation.queryOptions({
      input: { leagueId: leagueId || undefined },
      enabled: finance,
      placeholderData: keepPreviousData,
    }),
  );

  if (!finance) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader kicker="Money" title="reports" />
        <NoAccess what="money reports" />
      </div>
    );
  }

  const leagueName = leagues.data?.items.find((league) => league.id === leagueId)?.name ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Money"
        title="reports"
        description="Reconciliation from the money journal. A final day balances when entry fees plus sponsor money equal prizes plus the jackpot share plus operations."
        actions={
          <Button
            variant="outline"
            disabled={!report.data}
            onClick={() => {
              if (report.data) download(report.data, leagueName);
            }}
          >
            <Download aria-hidden />
            Download CSV
          </Button>
        }
      />
      <Field label="League" className="max-w-xs">
        <Select value={leagueId} onChange={(event) => setLeagueId(event.target.value)}>
          <option value="">All leagues</option>
          {leagues.data?.items.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name}
            </option>
          ))}
        </Select>
      </Field>
      <QueryState query={report} errorTitle="Could not build the report">
        {(data) => (
          <div className={cn('flex flex-col gap-4', report.isPlaceholderData && 'opacity-60')}>
            <Card>
              <CardHeader>
                <CardTitle>Bank transfers</CardTitle>
                <CardDescription>
                  Money on the statement against what it paid for. Generated{' '}
                  {formatDateTime(data.generatedAt)}.
                </CardDescription>
              </CardHeader>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <Stat label="Received" value={formatNaira(data.transfers.receivedKobo)} emphasis />
                <Stat label="Used for entries" value={formatNaira(data.transfers.appliedKobo)} />
                <Stat label="Refunded" value={formatNaira(data.transfers.refundedKobo)} />
                <Stat
                  label="Unused"
                  value={
                    data.transfers.unappliedKobo > 0 ? (
                      <Link
                        href="/payments/transfers?unused=1"
                        className="text-destructive underline decoration-2 underline-offset-4"
                      >
                        {formatNaira(data.transfers.unappliedKobo)}
                      </Link>
                    ) : (
                      formatNaira(0)
                    )
                  }
                />
              </div>
            </Card>

            {data.days.length === 0 ? (
              <EmptyState
                icon={<ChartColumn className="size-6" />}
                title="No match-days yet"
                description="Days appear here once they exist."
              />
            ) : (
              <Card className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 z-[1] bg-card">Day</TableHead>
                      <TableHead>Status</TableHead>
                      {COLUMNS.map((column) => (
                        <TableHead key={column.key} className="text-right" title={column.title}>
                          {column.label}
                        </TableHead>
                      ))}
                      <TableHead className="text-right" title="Prizes and refunds still to send">
                        Still to pay
                      </TableHead>
                      <TableHead>Check</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.days.map((day) => (
                      <TableRow
                        key={day.dayId}
                        className={cn(day.balanced === false && 'bg-destructive/5')}
                      >
                        <TableCell className="sticky left-0 z-[1] bg-card whitespace-nowrap">
                          <Link
                            href={`/days/${day.dayId}`}
                            className="font-semibold underline-offset-4 hover:underline"
                          >
                            {formatShortDay(day.date)}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <DayStatusBadge status={day.status} />
                        </TableCell>
                        {COLUMNS.map((column) => (
                          <TableCell
                            key={column.key}
                            className="text-right font-mono text-xs whitespace-nowrap"
                          >
                            {formatNaira(day.totals[column.key])}
                          </TableCell>
                        ))}
                        <TableCell
                          className={cn(
                            'text-right font-mono text-xs whitespace-nowrap',
                            day.outstandingKobo > 0 && 'font-bold',
                          )}
                        >
                          {formatNaira(day.outstandingKobo)}
                        </TableCell>
                        <TableCell>
                          {day.balanced === null ? (
                            <Badge variant="muted">Not final</Badge>
                          ) : day.balanced ? (
                            <Badge variant="success">Balanced</Badge>
                          ) : (
                            <Badge variant="destructive">Doesn&apos;t balance</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="border-t-2 border-sg-night/20 bg-muted/40">
                      <TableCell className="sticky left-0 z-[1] bg-muted font-bold">
                        Total
                      </TableCell>
                      <TableCell />
                      {COLUMNS.map((column) => (
                        <TableCell
                          key={column.key}
                          className="text-right font-mono text-xs font-bold whitespace-nowrap"
                        >
                          {formatNaira(data.totals[column.key])}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono text-xs font-bold whitespace-nowrap">
                        {formatNaira(data.days.reduce((sum, day) => sum + day.outstandingKobo, 0))}
                      </TableCell>
                      <TableCell>
                        {data.days.some((day) => day.balanced === false) ? (
                          <Badge variant="destructive">Check</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>
            )}
          </div>
        )}
      </QueryState>
    </div>
  );
}
