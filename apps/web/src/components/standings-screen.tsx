'use client';

import { CATEGORY_LABELS, type Category } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Card } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { useQuery } from '@tanstack/react-query';
import { TableIcon } from 'lucide-react';
import { useState } from 'react';
import { QueryError } from '@/components/query-error';
import { TeamLogo } from '@/components/team-logo';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { PageHeader } from '@/components/ui/text';
import { api } from '@/lib/api';
import { errorCode } from '@/lib/errors';
import { formatMoment } from '@/lib/format';
import type { StandingsData } from '@/lib/types';

type StandingsTable = StandingsData['tables'][number];

const COLUMNS = [
  { key: 'played', label: 'MP', title: 'Matches played' },
  { key: 'lost', label: 'ML', title: 'Matches lost' },
  { key: 'setsWon', label: 'SW', title: 'Sets won' },
  { key: 'setsLost', label: 'SL', title: 'Sets lost' },
] as const;

function StandingsTableView({ table }: { table: StandingsTable }) {
  return (
    <Card className="p-2 sm:p-4">
      <Table>
        <caption className="sr-only">{CATEGORY_LABELS[table.category]} standings</caption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8 px-1.5 sm:w-10 sm:px-3">#</TableHead>
            <TableHead className="px-1.5 sm:px-3">Team</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column.key} className="px-1.5 text-right tracking-[1px] sm:px-3">
                <abbr title={column.title} className="no-underline">
                  {column.label}
                </abbr>
              </TableHead>
            ))}
            <TableHead className="px-1.5 text-right tracking-[1px] sm:px-3">
              <abbr title="Points" className="no-underline">
                Pts
              </abbr>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {table.rows.map((row) => (
            <TableRow key={row.team.id}>
              <TableCell className="px-1.5 font-mono text-xs font-bold sm:px-3">
                {row.position}
              </TableCell>
              <TableCell className="max-w-[7.5rem] px-1.5 sm:max-w-none sm:px-3">
                <span className="flex items-center gap-2">
                  <TeamLogo team={row.team} size="sm" />
                  <span className="truncate font-semibold">{row.team.name}</span>
                </span>
              </TableCell>
              {COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  className="px-1.5 text-right font-mono text-muted-foreground sm:px-3"
                >
                  {row[column.key]}
                </TableCell>
              ))}
              <TableCell className="px-1.5 text-right font-mono font-extrabold sm:px-3">
                {row.points}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

/** The league tables, men's and women's, as the admins publish them. */
export function StandingsScreen() {
  const query = useQuery(api.public.standings.queryOptions({ refetchInterval: 60_000 }));
  const [category, setCategory] = useState<Category | null>(null);

  if (!query.data) {
    if (query.isError) {
      return (
        <div className="flex flex-col gap-6">
          <PageHeader title="standings" />
          {errorCode(query.error) === 'NOT_PUBLISHED' ? (
            <EmptyState
              icon={<TableIcon aria-hidden className="size-8" />}
              title="Standings will appear here once published."
              description="The league tables go up once the organisers turn them on."
            />
          ) : (
            <QueryError error={query.error} onRetry={() => void query.refetch()} />
          )}
        </div>
      );
    }
    return (
      <div role="status" aria-label="Loading the standings" className="flex flex-col gap-6">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const data = query.data;
  const tables = data.tables;
  const active = tables.find((table) => table.category === category) ?? tables[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader kicker={data.leagueName} title="standings">
        <p className="flex flex-wrap items-center gap-2">
          {data.final ? <Badge variant="success">Final table</Badge> : null}
          {data.updatedAt ? <span>Updated {formatMoment(data.updatedAt)}</span> : null}
        </p>
      </PageHeader>

      {!active ? (
        <EmptyState
          icon={<TableIcon aria-hidden className="size-8" />}
          title="Standings will appear here once published."
        />
      ) : tables.length > 1 ? (
        <Tabs
          label="Category"
          items={tables.map((table) => ({
            value: table.category,
            label: CATEGORY_LABELS[table.category],
          }))}
          value={active.category}
          onChange={setCategory}
        >
          <StandingsTableView table={active} />
        </Tabs>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-extrabold">{CATEGORY_LABELS[active.category]}</h2>
          <StandingsTableView table={active} />
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        MP matches played · ML matches lost · SW sets won · SL sets lost · Pts points
      </p>
    </div>
  );
}
