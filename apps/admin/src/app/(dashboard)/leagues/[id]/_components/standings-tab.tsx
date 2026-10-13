'use client';

import { CATEGORY_LABELS, type Category } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Calculator, Lock } from 'lucide-react';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { ErrorAlert } from '@/components/error-alert';
import { WholeInput } from '@/components/inputs';
import { QueryState } from '@/components/query-state';
import { TeamLogo } from '@/components/team-logo';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import { ConfirmAction } from '@/components/ui/confirm-action';
import {
  DragHandle,
  MoveButtons,
  moveItem,
  SortableList,
  useSortableRow,
} from '@/components/ui/sortable';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDateTime, parseWhole } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { League, LeagueTeam, Standings, StandingsInputRow, TeamRef } from '@/lib/types';

export function StandingsTab({ league }: { league: League }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const standings = useQuery(api.admin.standings.get.queryOptions({ input: { id: league.id } }));
  const finalize = useMutation(
    api.admin.standings.finalize.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.standings.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.key(), api.admin.jackpot.key());
        toast({ title: 'Final standings locked' });
      },
    }),
  );

  return (
    <QueryState query={standings}>
      {(data) => (
        <div className="flex flex-col gap-4">
          <Card className="flex-row flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="flex items-center gap-2 font-bold">
                {data.finalizedAt ? (
                  <>
                    <Lock className="size-4" aria-hidden /> Final standings
                  </>
                ) : (
                  'Standings in progress'
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {data.finalizedAt
                  ? `Locked ${formatDateTime(data.finalizedAt)}. The jackpot is decided from these tables.`
                  : data.updatedAt
                    ? `Last saved ${formatDateTime(data.updatedAt)}. Tables are in order: drag rows or use the arrows.`
                    : 'Not saved yet. Fill from results or type the numbers, then save each table.'}
              </p>
            </div>
            {!data.finalizedAt && can(admin) ? (
              <ConfirmAction
                trigger={<Button variant="outline">Finalize standings</Button>}
                title="Lock the final standings?"
                description="Both tables become the official final standings and the jackpot is decided from them. Save any edits first. This can't be undone."
                confirmLabel="Finalize standings"
                pendingLabel="Locking…"
                onConfirm={() => finalize.mutateAsync({ id: league.id })}
              />
            ) : null}
          </Card>
          {data.tables.length === 0 ? (
            <EmptyState
              title="No teams in this league yet"
              description="Add teams in the Teams tab to build the tables."
            />
          ) : (
            data.tables.map((table) => (
              <StandingsEditor
                key={`${table.category}:${data.updatedAt ?? ''}:${data.finalizedAt ?? ''}`}
                leagueId={league.id}
                category={table.category}
                rows={table.rows}
                locked={Boolean(data.finalizedAt) || !can(admin, 'operations')}
              />
            ))
          )}
        </div>
      )}
    </QueryState>
  );
}

interface EditRow {
  teamId: string;
  team: TeamRef;
  played: string;
  lost: string;
  setsWon: string;
  setsLost: string;
  points: string;
  withdrawn: boolean;
}

const NUMBER_FIELDS = [
  { key: 'played', label: 'MP', title: 'Matches played', max: 200 },
  { key: 'lost', label: 'ML', title: 'Matches lost', max: 200 },
  { key: 'setsWon', label: 'SW', title: 'Sets won', max: 1000 },
  { key: 'setsLost', label: 'SL', title: 'Sets lost', max: 1000 },
  { key: 'points', label: 'Pts', title: 'Points', max: 1000 },
] as const;

const toEditRow = (row: LeagueTeam): EditRow => ({
  teamId: row.team.id,
  team: row.team,
  played: String(row.played),
  lost: String(row.lost),
  setsWon: String(row.setsWon),
  setsLost: String(row.setsLost),
  points: String(row.points),
  withdrawn: row.withdrawn,
});

/** Order and numbers of a table, to tell whether it changed. */
const signature = (rows: EditRow[]) =>
  JSON.stringify(
    rows.map((row) => [
      row.teamId,
      row.played,
      row.lost,
      row.setsWon,
      row.setsLost,
      row.points,
      row.withdrawn,
    ]),
  );

type NumberField = (typeof NUMBER_FIELDS)[number]['key'];

function parseRow(row: EditRow): StandingsInputRow | null {
  const played = parseWhole(row.played, 0, 200);
  const lost = parseWhole(row.lost, 0, 200);
  const setsWon = parseWhole(row.setsWon, 0, 1000);
  const setsLost = parseWhole(row.setsLost, 0, 1000);
  const points = parseWhole(row.points, 0, 1000);
  if (
    played === null ||
    lost === null ||
    setsWon === null ||
    setsLost === null ||
    points === null
  ) {
    return null;
  }
  if (lost > played) return null;
  return { teamId: row.teamId, played, lost, setsWon, setsLost, points, withdrawn: row.withdrawn };
}

function StandingsEditor({
  leagueId,
  category,
  rows: initialRows,
  locked,
}: {
  leagueId: string;
  category: Category;
  rows: LeagueTeam[];
  locked: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [rows, setRows] = useState<EditRow[]>(() => initialRows.map(toEditRow));
  const [filled, setFilled] = useState(false);
  const teams = new Map(initialRows.map((row) => [row.team.id, row.team]));

  const fill = useMutation({
    mutationFn: () => api.admin.standings.fromResults.call({ id: leagueId, category }),
    onSuccess: (data) => {
      setRows(
        data.rows.map((row) => ({
          teamId: row.teamId,
          team: teams.get(row.teamId) ?? {
            id: row.teamId,
            name: 'Unknown team',
            shortName: '?',
            category,
            logoUrl: null,
          },
          played: String(row.played),
          lost: String(row.lost),
          setsWon: String(row.setsWon),
          setsLost: String(row.setsLost),
          points: String(row.points),
          withdrawn: row.withdrawn ?? false,
        })),
      );
      setFilled(true);
    },
  });

  const save = useMutation(
    api.admin.standings.save.mutationOptions({
      onSuccess: (data: Standings) => {
        queryClient.setQueryData(
          api.admin.standings.get.queryKey({ input: { id: leagueId } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.key(), api.admin.jackpot.key());
        toast({ title: `${CATEGORY_LABELS[category]}'s table saved` });
      },
    }),
  );

  const parsed = rows.map(parseRow);
  const valid = parsed.every((row) => row !== null);
  const dirty = signature(rows) !== signature(initialRows.map(toEditRow));
  const move = (from: number, to: number) => setRows((current) => moveItem(current, from, to));
  const updateRow = (teamId: string, patch: Partial<Omit<EditRow, 'teamId' | 'team'>>) =>
    setRows((current) =>
      current.map((row) => (row.teamId === teamId ? { ...row, ...patch } : row)),
    );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardHeader>
          <CardTitle>{CATEGORY_LABELS[category]}</CardTitle>
          <CardDescription>
            MP played · ML lost · SW sets won · SL sets lost · Pts points. Withdrawn teams are left
            out of the jackpot.
          </CardDescription>
        </CardHeader>
        {!locked ? (
          <Button
            variant="outline"
            size="sm"
            disabled={fill.isPending}
            onClick={() => fill.mutate()}
          >
            <Calculator aria-hidden />
            {fill.isPending ? 'Calculating…' : 'Fill from results'}
          </Button>
        ) : null}
      </div>
      {filled && dirty ? (
        <Callout variant="warning">
          Filled from confirmed results (FIVB points). Check the order and numbers, then save.
        </Callout>
      ) : null}
      <ErrorAlert error={fill.error} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">#</TableHead>
            <TableHead>Team</TableHead>
            {NUMBER_FIELDS.map((field) => (
              <TableHead key={field.key} className="text-center" title={field.title}>
                {field.label}
              </TableHead>
            ))}
            <TableHead className="text-center">Withdrawn</TableHead>
            {!locked ? <TableHead className="sr-only">Move</TableHead> : null}
          </TableRow>
        </TableHeader>
        <SortableList ids={rows.map((row) => row.teamId)} onMove={move} disabled={locked}>
          <TableBody>
            {rows.map((row, index) => (
              <StandingsRow
                key={row.teamId}
                row={row}
                index={index}
                count={rows.length}
                locked={locked}
                invalid={parsed[index] === null}
                onMove={move}
                onField={(key, value) => updateRow(row.teamId, { [key]: value })}
                onWithdrawn={(withdrawn) => updateRow(row.teamId, { withdrawn })}
              />
            ))}
          </TableBody>
        </SortableList>
      </Table>
      {!valid ? (
        <p className="text-xs text-destructive">
          Use whole numbers (0 or more). A team can&apos;t lose more matches than it played.
        </p>
      ) : null}
      <ErrorAlert error={save.error} />
      {!locked ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setRows(initialRows.map(toEditRow));
              setFilled(false);
            }}
          >
            Reset
          </Button>
          <Button
            disabled={!dirty || !valid || save.isPending}
            onClick={() =>
              save.mutate({
                id: leagueId,
                category,
                rows: parsed.filter((row): row is StandingsInputRow => row !== null),
              })
            }
          >
            {save.isPending ? 'Saving…' : 'Save table'}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function StandingsRow({
  row,
  index,
  count,
  locked,
  invalid,
  onMove,
  onField,
  onWithdrawn,
}: {
  row: EditRow;
  index: number;
  count: number;
  locked: boolean;
  invalid: boolean;
  onMove: (from: number, to: number) => void;
  onField: (key: NumberField, value: string) => void;
  onWithdrawn: (withdrawn: boolean) => void;
}) {
  const { rowProps, handleProps, isDragging } = useSortableRow(row.teamId);
  return (
    <TableRow
      {...rowProps}
      className={cn(
        'bg-background',
        isDragging && 'shadow-card',
        invalid && 'bg-destructive/5',
        row.withdrawn && 'text-muted-foreground',
      )}
    >
      <TableCell className="py-1.5">
        <span className="flex items-center gap-1">
          {!locked ? (
            <DragHandle handleProps={handleProps} label={`Drag ${row.team.name}`} />
          ) : null}
          <span className="font-mono text-sm font-bold">{index + 1}</span>
        </span>
      </TableCell>
      <TableCell className="py-1.5">
        <span className="flex min-w-40 items-center gap-2">
          <TeamLogo name={row.team.name} logoUrl={row.team.logoUrl} size="sm" />
          <span className="font-semibold">{row.team.name}</span>
          {row.withdrawn ? <Badge variant="muted">Withdrawn</Badge> : null}
        </span>
      </TableCell>
      {NUMBER_FIELDS.map((field) => (
        <TableCell key={field.key} className="py-1.5 text-center">
          {locked ? (
            <span className="font-mono">{row[field.key]}</span>
          ) : (
            <WholeInput
              aria-label={`${field.title}, ${row.team.name}`}
              value={row[field.key]}
              onChange={(event) => onField(field.key, event.target.value)}
              className="h-9 w-14 px-2 text-center"
            />
          )}
        </TableCell>
      ))}
      <TableCell className="py-1.5 text-center">
        <Checkbox
          aria-label={`${row.team.name} withdrawn`}
          checked={row.withdrawn}
          disabled={locked}
          onCheckedChange={onWithdrawn}
        />
      </TableCell>
      {!locked ? (
        <TableCell className="py-1.5">
          <MoveButtons index={index} count={count} onMove={onMove} label={row.team.name} />
        </TableCell>
      ) : null}
    </TableRow>
  );
}
