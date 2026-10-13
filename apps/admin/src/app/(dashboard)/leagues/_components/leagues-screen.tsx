'use client';

import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trophy } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { WatDateTimeInput } from '@/components/inputs';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { LeagueStatusBadge } from '@/components/status-badges';
import { DialogForm } from '@/components/ui/dialog-form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDay } from '@/lib/format';

export function LeaguesScreen() {
  const admin = useAdmin();
  const leagues = useQuery(api.admin.leagues.list.queryOptions());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Setup"
        title="leagues"
        description="A league runs about two weeks with a men's and a women's table. Its match-days share one jackpot."
        actions={can(admin, 'operations') ? <NewLeagueDialog /> : null}
      />
      <QueryState query={leagues}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<Trophy className="size-6" />}
              title="No leagues yet"
              description="Create a league, add its teams, then create its match-days or import the fixture list."
            />
          ) : (
            <Card className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>League</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Teams</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((league) => (
                    <TableRow key={league.id} className="hover:bg-muted/40">
                      <TableCell>
                        <Link
                          href={`/leagues/${league.id}`}
                          className="font-bold underline-offset-4 hover:underline"
                        >
                          {league.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <LeagueStatusBadge status={league.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatDay(league.startDate)} – {formatDay(league.endDate)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{league.dayCount}</TableCell>
                      <TableCell className="text-right font-mono">{league.teamCount}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        }
      </QueryState>
    </div>
  );
}

function NewLeagueDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          New league
        </Button>
      </DialogTrigger>
      <DialogContent>
        <NewLeagueForm />
      </DialogContent>
    </Dialog>
  );
}

function NewLeagueForm() {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [touched, setTouched] = useState(false);

  const create = useMutation(
    api.admin.leagues.create.mutationOptions({
      onSuccess: async (league) => {
        await queryClient.invalidateQueries({ queryKey: api.admin.leagues.key() });
        toast({ title: `${league.name} created`, description: 'Next: add its teams.' });
        router.push(`/leagues/${league.id}?tab=teams`);
      },
    }),
  );

  const errors = {
    name: name.trim().length < 3 ? 'Use at least 3 characters.' : undefined,
    startDate: startDate ? undefined : 'Pick the first day.',
    endDate: !endDate
      ? 'Pick the last day.'
      : startDate && endDate < startDate
        ? 'The end date must be on or after the start date.'
        : undefined,
    close: !closeDate || !closeTime ? 'Pick the date and time jackpot entries close.' : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);

  return (
    <DialogForm
      title="New league"
      description="Days are created as drafts, copying the default day settings from Settings."
      submitLabel="Create league"
      pendingLabel="Creating…"
      pending={create.isPending}
      error={create.error}
      onSubmit={() => {
        setTouched(true);
        if (!valid) return;
        create.mutate({
          name: name.trim(),
          startDate,
          endDate,
          jackpotEntryClosesOn: closeDate,
          jackpotEntryClosesAt: closeTime.slice(0, 5),
        });
      }}
    >
      <Field label="Name" error={touched ? errors.name : undefined}>
        <Input
          value={name}
          maxLength={80}
          placeholder="e.g. NVBF Premier League 2026"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" error={touched ? errors.startDate : undefined}>
          <Input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>
        <Field label="End date" error={touched ? errors.endDate : undefined}>
          <Input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </Field>
      </div>
      <WatDateTimeInput
        label="Jackpot entries close"
        date={closeDate}
        time={closeTime}
        onDateChange={setCloseDate}
        onTimeChange={setCloseTime}
        hint="Players can predict the final tables until then. Earlier entries win ties."
        error={touched ? errors.close : undefined}
      />
    </DialogForm>
  );
}
