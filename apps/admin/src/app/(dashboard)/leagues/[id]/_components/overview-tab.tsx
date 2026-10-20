'use client';

import { watDate, watTime } from '@predict/domain';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { DayConfigEditor, DayConfigSummary } from '@/components/day-config-editor';
import { ErrorAlert } from '@/components/error-alert';
import { WatDateTimeInput } from '@/components/inputs';
import { JackpotStatusBadge } from '@/components/status-badges';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { DialogForm } from '@/components/ui/dialog-form';
import { Stat } from '@/components/ui/stat';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatDateTime, formatDay, formatNaira, formatWat, toWatInputs } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { League } from '@/lib/types';

export function OverviewTab({ league }: { league: League }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const canEdit = can(admin, 'operations') && league.status !== 'completed';

  const update = useMutation(
    api.admin.leagues.update.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.leagues.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.list.key());
      },
    }),
  );

  const perCategory = {
    men: league.teams.filter((row) => row.team.category === 'men').length,
    women: league.teams.filter((row) => row.team.category === 'women').length,
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
      <LeagueCard league={league} perCategory={perCategory} canEdit={canEdit} />
      <JackpotCard league={league} />

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Public standings</CardTitle>
          <CardDescription>
            The league table on the players&apos; site. Edit it in the Standings tab.
          </CardDescription>
        </CardHeader>
        <SwitchField
          label="Show the standings to players"
          description={
            league.standingsUpdatedAt
              ? `Last updated ${formatDateTime(league.standingsUpdatedAt)}${league.standingsFinalizedAt ? ' · final' : ''}.`
              : 'Not updated yet.'
          }
          checked={league.standingsPublic}
          disabled={!canEdit || update.isPending}
          onCheckedChange={(checked) =>
            update.mutate(
              { id: league.id, standingsPublic: checked },
              {
                onSuccess: () =>
                  toast({ title: checked ? 'Standings are public' : 'Standings are hidden' }),
              },
            )
          }
        />
        <ErrorAlert error={update.error} />
      </Card>

      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>Default day settings</CardTitle>
          <CardDescription>
            New match-days in this league copy these. Days already created keep their own settings:
            change those on each day before it opens.
          </CardDescription>
        </CardHeader>
        {canEdit ? (
          <DayConfigEditor
            value={league.defaults}
            saveLabel="Save defaults"
            onSave={(defaults) =>
              api.admin.leagues.update.call({ id: league.id, defaults }).then((data) => {
                queryClient.setQueryData(
                  api.admin.leagues.get.queryKey({ input: { id: league.id } }),
                  data,
                );
                toast({ title: 'Default day settings saved' });
              })
            }
          />
        ) : (
          <DayConfigSummary config={league.defaults} />
        )}
      </Card>
    </div>
  );
}

function LeagueCard({
  league,
  perCategory,
  canEdit,
}: {
  league: League;
  perCategory: { men: number; women: number };
  canEdit: boolean;
}) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const activate = useMutation(
    api.admin.leagues.activate.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.leagues.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.list.key(), api.admin.days.key());
        toast({ title: 'League started', description: 'Its days can now be opened.' });
      },
    }),
  );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardHeader>
          <CardTitle>League</CardTitle>
          <CardDescription>
            {formatDay(league.startDate)} – {formatDay(league.endDate)}
          </CardDescription>
        </CardHeader>
        {canEdit ? <EditLeagueDialog league={league} /> : null}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Match-days" value={league.days.length} />
        <Stat label="Men's teams" value={perCategory.men} />
        <Stat label="Women's teams" value={perCategory.women} />
      </div>
      {league.status === 'draft' ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            This league is a draft. Start it once its teams are in: days can only open in a running
            league, and teams can then be added but not removed.
          </p>
          {can(admin) ? (
            <ConfirmAction
              trigger={<Button className="w-fit">Start league</Button>}
              title="Start this league?"
              description="Its match-days can then be opened for entries. You can still add teams, but not remove them."
              confirmLabel="Start league"
              pendingLabel="Starting…"
              onConfirm={() => activate.mutateAsync({ id: league.id })}
            >
              {perCategory.men < 2 && perCategory.women < 2 ? (
                <Callout variant="warning">
                  A category needs at least two teams before the league can start.
                </Callout>
              ) : null}
            </ConfirmAction>
          ) : (
            <p className="text-xs text-muted-foreground">Only a super admin can start a league.</p>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function EditLeagueDialog({ league }: { league: League }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil aria-hidden />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <EditLeagueForm league={league} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditLeagueForm({ league, onDone }: { league: League; onDone: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(league.name);
  const [startDate, setStartDate] = useState(league.startDate);
  const [endDate, setEndDate] = useState(league.endDate);
  const update = useMutation(
    api.admin.leagues.update.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.leagues.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.leagues.list.key(), api.admin.days.key());
        toast({ title: 'League saved' });
        onDone();
      },
    }),
  );
  const nameError = name.trim().length < 3 ? 'Use at least 3 characters.' : undefined;
  const dateError =
    !startDate || !endDate
      ? 'Pick both dates.'
      : endDate < startDate
        ? 'The end date must be on or after the start date.'
        : undefined;

  return (
    <DialogForm
      title="Edit league"
      description="Dates can't move past match-days that already exist."
      submitLabel="Save"
      pending={update.isPending}
      canSubmit={!nameError && !dateError}
      error={update.error}
      onSubmit={() =>
        update.mutate({
          id: league.id,
          name: name.trim(),
          startDate,
          endDate,
        })
      }
    >
      <Field label="Name" error={nameError}>
        <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" error={dateError}>
          <Input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </Field>
        <Field label="End date">
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </Field>
      </div>
    </DialogForm>
  );
}

function JackpotCard({ league }: { league: League }) {
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const toast = useToast();
  const jackpot = league.jackpot;
  const initial = toWatInputs(jackpot?.entryClosesAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const setClose = useMutation(
    api.admin.leagues.setJackpotClose.mutationOptions({
      onSuccess: (data) => {
        queryClient.setQueryData(
          api.admin.leagues.get.queryKey({ input: { id: league.id } }),
          data,
        );
        void invalidate(queryClient, api.admin.jackpot.key());
        // The server may adjust the time (a past one closes entries now): show what it kept.
        const saved = toWatInputs(data.jackpot?.entryClosesAt);
        setDate(saved.date);
        setTime(saved.time);
        toast({
          title:
            data.jackpot?.status === 'closed'
              ? 'Jackpot entries closed'
              : 'Jackpot close time saved',
        });
      },
    }),
  );

  if (!jackpot) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Jackpot</CardTitle>
          <CardDescription>This league has no jackpot.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Movable either way until settlement; players can change their tables until it passes.
  const editable = can(admin) && jackpot.status !== 'settled' && jackpot.status !== 'carried_over';
  const changed = date !== initial.date || time !== initial.time;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardHeader>
          <CardTitle>Jackpot</CardTitle>
          <CardDescription>Entries close {formatWat(jackpot.entryClosesAt)}</CardDescription>
        </CardHeader>
        <JackpotStatusBadge status={jackpot.status} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Guaranteed so far" value={formatNaira(jackpot.guaranteedKobo)} />
        <Stat label="Entries" value={jackpot.entries.toLocaleString('en-NG')} />
      </div>
      {editable ? (
        <form
          className="flex flex-col gap-3 border-t border-border pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (date && time && changed)
              setClose.mutate({ id: league.id, date, time: time.slice(0, 5) });
          }}
        >
          <WatDateTimeInput
            label="Entries close"
            date={date}
            time={time}
            onDateChange={setDate}
            onTimeChange={setTime}
            hint="Players can enter and change their tables until this time. Move it earlier or later; a later time reopens closed entries."
          />
          <ErrorAlert error={setClose.error} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="outline"
              className="w-fit"
              disabled={!date || !time || !changed || setClose.isPending}
            >
              {setClose.isPending ? 'Saving…' : 'Save close time'}
            </Button>
            {jackpot.status === 'open' ? (
              <ConfirmAction
                trigger={
                  <Button type="button" variant="ghost" className="w-fit">
                    Close entries now
                  </Button>
                }
                title="Close jackpot entries now?"
                description="Players can't enter or change their tables after this. You can reopen entries later by setting a new close time."
                confirmLabel="Close entries"
                pendingLabel="Closing…"
                onConfirm={() => {
                  const now = new Date();
                  return setClose.mutateAsync({
                    id: league.id,
                    date: watDate(now),
                    time: watTime(now),
                  });
                }}
              />
            ) : null}
          </div>
        </form>
      ) : null}
    </Card>
  );
}
