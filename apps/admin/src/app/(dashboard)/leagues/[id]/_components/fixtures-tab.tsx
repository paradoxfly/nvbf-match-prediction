'use client';

import { CATEGORY_LABELS } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { Textarea } from '@predict/ui/textarea';
import { cn } from '@predict/ui/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileUp, ListChecks, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { ErrorAlert } from '@/components/error-alert';
import { Callout } from '@/components/ui/callout';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDay, plural } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { FixtureImport, League } from '@/lib/types';

const EXAMPLE = `date,time,category,home,away,venue
2026-10-18,16:00,men,Kano Pillars,Rivers Spikers,Indoor Sports Hall
18/10/2026,4:00 pm,women,KPV,NCD,`;

export function FixturesTab({ league }: { league: League }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const canEdit = can(admin, 'operations') && league.status !== 'completed';
  const [csv, setCsv] = useState('');
  const [checkedCsv, setCheckedCsv] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const check = useMutation(
    api.admin.leagues.importFixtures.mutationOptions({
      onSuccess: (_result, variables) => setCheckedCsv(variables.csv),
    }),
  );
  const commit = useMutation(
    api.admin.leagues.importFixtures.mutationOptions({
      onSuccess: async (result) => {
        if (!result.committed) return;
        await invalidate(queryClient, api.admin.leagues.key(), api.admin.days.key());
        toast({
          title: `${plural(result.rows.length, 'match', 'matches')} imported`,
          description:
            result.newDays.length > 0
              ? `${plural(result.newDays.length, 'new draft day')} created.`
              : undefined,
        });
      },
    }),
  );

  const committed = commit.data?.committed ? commit.data : null;
  const result: FixtureImport | undefined = committed ?? check.data;
  const stale = checkedCsv !== csv;
  const problems = result ? result.rows.filter((row) => row.error !== null).length : 0;

  function reset(nextCsv: string) {
    setCsv(nextCsv);
    setFileError(null);
    if (committed) commit.reset();
  }

  async function readFile(file: File) {
    if (file.size > 200_000) {
      setFileError('That file is too large (200 KB max).');
      return;
    }
    reset(await file.text());
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Import the fixture list</CardTitle>
          <CardDescription>
            Paste the fixtures as CSV or pick a .csv file, check them, then import. Days that
            don&apos;t exist yet are created as drafts. Nothing changes until you press Import.
          </CardDescription>
        </CardHeader>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
          <div className="flex flex-col gap-2">
            <label htmlFor="fixtures-csv" className="text-sm font-semibold">
              Fixtures (CSV)
            </label>
            <Textarea
              id="fixtures-csv"
              value={csv}
              disabled={!canEdit}
              spellCheck={false}
              placeholder={EXAMPLE}
              onChange={(event) => reset(event.target.value)}
              className="min-h-56 font-mono text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canEdit}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp aria-hidden />
                Choose .csv file
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                className="hidden"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void readFile(file);
                }}
              />
              {fileError ? <span className="text-xs text-destructive">{fileError}</span> : null}
            </div>
          </div>
          <div className="flex flex-col gap-2 rounded-sm bg-muted p-4 text-xs leading-relaxed">
            <p className="font-mono text-[10px] tracking-[2px] text-muted-foreground uppercase">
              Format
            </p>
            <p className="font-mono font-bold">date,time,category,home,away,venue</p>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
              <li>The header row is optional. With one, columns can be in any order.</li>
              <li>
                Dates like <span className="font-mono">2026-10-18</span> or{' '}
                <span className="font-mono">18/10/2026</span>.
              </li>
              <li>
                Times like <span className="font-mono">16:00</span> or{' '}
                <span className="font-mono">4:00 pm</span>, in Lagos time.
              </li>
              <li>
                Category <span className="font-mono">men</span> or{' '}
                <span className="font-mono">women</span>.
              </li>
              <li>Teams by name or short name, as set up in Teams. Venue is optional.</li>
              {league.status === 'draft' ? (
                <li>Teams not in this league yet are added to it.</li>
              ) : null}
            </ul>
          </div>
        </div>
        <ErrorAlert error={check.error ?? commit.error} />
        {canEdit ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={csv.trim() === '' || check.isPending}
              onClick={() => {
                commit.reset();
                check.mutate({ id: league.id, csv, commit: false });
              }}
            >
              <ListChecks aria-hidden />
              {check.isPending ? 'Checking…' : 'Check'}
            </Button>
            <Button
              disabled={!result || !result.valid || stale || Boolean(committed) || commit.isPending}
              onClick={() => commit.mutate({ id: league.id, csv, commit: true })}
            >
              <Upload aria-hidden />
              {commit.isPending
                ? 'Importing…'
                : result?.valid && !stale
                  ? `Import ${plural(result.rows.length, 'match', 'matches')}`
                  : 'Import'}
            </Button>
          </div>
        ) : null}
      </Card>

      {result ? (
        <Card>
          <div className="flex flex-col gap-3">
            {committed ? (
              <Callout variant="success" title="Imported">
                {plural(committed.rows.length, 'match', 'matches')} added
                {committed.newDays.length > 0
                  ? `, ${plural(committed.newDays.length, 'new day')} created`
                  : ''}
                .
              </Callout>
            ) : stale ? (
              <Callout variant="warning">
                The list changed since this check. Check it again.
              </Callout>
            ) : result.valid ? (
              <Callout variant="success" title="Ready to import">
                {plural(result.rows.length, 'match', 'matches')}, no problems found.
              </Callout>
            ) : (
              <Callout variant="danger" title="Fix these before importing">
                {result.rows.length === 0
                  ? 'No fixtures found in the list.'
                  : `${plural(problems, 'line')} with problems.`}
              </Callout>
            )}
            {result.newDays.length > 0 && !committed ? (
              <p className="text-sm">
                <span className="font-semibold">New draft days:</span>{' '}
                {result.newDays.map(formatDay).join(' · ')}
              </p>
            ) : null}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Home</TableHead>
                <TableHead>Away</TableHead>
                <TableHead>Problem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.map((row) => (
                <TableRow key={row.line} className={cn(row.error && 'bg-destructive/5')}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.line}
                  </TableCell>
                  <TableCell className="font-mono text-xs whitespace-nowrap">{row.date}</TableCell>
                  <TableCell className="font-mono text-xs">{row.time}</TableCell>
                  <TableCell>{row.category ? CATEGORY_LABELS[row.category] : '—'}</TableCell>
                  <TableCell className="font-semibold">{row.home}</TableCell>
                  <TableCell className="font-semibold">{row.away}</TableCell>
                  <TableCell
                    className={cn(
                      'min-w-48 text-xs',
                      row.error ? 'text-destructive' : 'text-success',
                    )}
                  >
                    {row.error ?? 'OK'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </div>
  );
}
