'use client';

import type { DayStatus } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, CalendarClock, DoorClosed, DoorOpen, Send, Trophy } from 'lucide-react';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { ErrorAlert } from '@/components/error-alert';
import { WatDateTimeInput } from '@/components/inputs';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { DialogForm } from '@/components/ui/dialog-form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatWat, fromWatInputs, toWatInputs } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { invalidate } from '@/lib/invalidate';
import type { AdminDay } from '@/lib/types';

const STATUS_HELP: Record<DayStatus, string> = {
  draft: 'Draft: only staff can see this day. Publish it to show it to players as coming up.',
  published: 'Coming up: players can see this day. Open it to take entries and picks.',
  open: 'Open: players are joining, paying and picking. Each match locks at its start.',
  closed: 'Closed: no new entries or picks. Confirm every result, then finalize.',
  finalized: 'Final: prizes and the jackpot share are recorded and waiting in Payouts.',
  completed: 'Completed: everything this day owed has been paid.',
  cancelled: 'Cancelled: confirmed entries are refunded in full.',
};

/** Applies a day returned by a mutation and refreshes the lists that show it. */
export function useApplyDay(dayId: string) {
  const queryClient = useQueryClient();
  return (data: AdminDay) => {
    queryClient.setQueryData(api.admin.days.get.queryKey({ input: { id: dayId } }), data);
    void invalidate(
      queryClient,
      api.admin.days.list.key(),
      api.admin.leagues.key(),
      api.admin.results.key(),
    );
  };
}

export function DayActions({
  day,
  onShowTab,
}: {
  day: AdminDay;
  onShowTab: (tab: string) => void;
}) {
  const admin = useAdmin();
  const toast = useToast();
  const queryClient = useQueryClient();
  const applyDay = useApplyDay(day.id);
  const isSuper = can(admin);
  const isOps = can(admin, 'operations');
  const beforeOpen = day.status === 'draft' || day.status === 'published';
  const done =
    day.status === 'finalized' || day.status === 'completed' || day.status === 'cancelled';

  const publish = useMutation(
    api.admin.days.publish.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Day published', description: 'Players can now see it as coming up.' });
      },
    }),
  );
  const open = useMutation(
    api.admin.days.open.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Entries are open', description: 'The day’s settings are now frozen.' });
      },
    }),
  );
  const close = useMutation(
    api.admin.days.close.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Entries closed' });
      },
    }),
  );
  const cancel = useMutation(
    api.admin.results.cancel.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        void invalidate(
          queryClient,
          api.admin.payouts.key(),
          api.admin.contributions.key(),
          api.admin.payments.key(),
        );
        toast({ title: 'Day cancelled', description: 'Refunds are waiting in Payouts.' });
      },
    }),
  );

  const actions = [
    day.status === 'draft' && isOps ? (
      <Button
        key="publish"
        disabled={publish.isPending}
        onClick={() => publish.mutate({ id: day.id })}
      >
        <Send aria-hidden />
        {publish.isPending ? 'Publishing…' : 'Publish'}
      </Button>
    ) : null,
    day.status === 'published' && isSuper ? (
      <ConfirmAction
        key="open"
        trigger={
          <Button disabled={day.openBlockers.length > 0}>
            <DoorOpen aria-hidden />
            Open entries now
          </Button>
        }
        title="Open this day for entries?"
        description="Players can join, pay and pick from now. The day's settings and the bank account players pay into are frozen. This can't be undone."
        confirmLabel="Open entries"
        pendingLabel="Opening…"
        onConfirm={() => open.mutateAsync({ id: day.id })}
      />
    ) : null,
    beforeOpen && isSuper ? <ScheduleOpenDialog key="schedule-open" day={day} /> : null,
    day.status === 'open' && isOps ? (
      <ConfirmAction
        key="close"
        trigger={
          <Button>
            <DoorClosed aria-hidden />
            Close entries now
          </Button>
        }
        title="Close entries now?"
        description="No new entries or picks after this. Matches already locked stay locked. Transfers that reached the account before now can still be confirmed until the day is finalized."
        confirmLabel="Close entries"
        pendingLabel="Closing…"
        onConfirm={() => close.mutateAsync({ id: day.id })}
      />
    ) : null,
    (beforeOpen || day.status === 'open') && isOps ? (
      <ScheduleCloseDialog key="schedule-close" day={day} />
    ) : null,
    day.status === 'closed' ? (
      <Button key="results" onClick={() => onShowTab('leaderboard')}>
        <Trophy aria-hidden />
        Results &amp; finalize
      </Button>
    ) : null,
    !done && isSuper ? (
      <ConfirmAction
        key="cancel"
        trigger={
          <Button variant="destructive">
            <Ban aria-hidden />
            Cancel day
          </Button>
        }
        title="Cancel this match-day?"
        description="Every confirmed entry is refunded in full, sponsor money for the day is returned, and the jackpot gets nothing from it. This can't be undone."
        confirmLabel="Cancel the day"
        pendingLabel="Cancelling…"
        destructive
        reason={{ placeholder: 'e.g. Fewer than half the matches were played (rain).' }}
        onConfirm={(reason) => cancel.mutateAsync({ id: day.id, reason })}
      />
    ) : null,
  ].filter(Boolean);

  return (
    <Card className="gap-4">
      <p className="text-sm">{STATUS_HELP[day.status]}</p>
      {beforeOpen && day.openBlockers.length > 0 ? (
        <Callout variant="warning" title="Before this day can open" items={day.openBlockers} />
      ) : null}
      {day.status === 'published' && day.openBlockers.length === 0 ? (
        <Callout variant="success">Ready to open: nothing is blocking it.</Callout>
      ) : null}
      {actions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
      <ErrorAlert error={publish.error} />
    </Card>
  );
}

function ScheduleOpenDialog({ day }: { day: AdminDay }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock aria-hidden />
          {day.opensAt ? `Opens ${formatWat(day.opensAt)}` : 'Schedule opening'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ScheduleForm
          day={day}
          field="opensAt"
          title="Open automatically"
          description="The day opens by itself at this time, as long as nothing is blocking it. It's the same as pressing Open, so only super admins can set it."
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleCloseDialog({ day }: { day: AdminDay }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarClock aria-hidden />
          {day.submissionsCloseAt
            ? `Closes ${formatWat(day.submissionsCloseAt)}`
            : 'Schedule closing'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <ScheduleForm
          day={day}
          field="submissionsCloseAt"
          title="Close automatically"
          description="Entries and picks stop at this time. Each match still locks at its own start if that comes first."
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ScheduleForm({
  day,
  field,
  title,
  description,
  onDone,
}: {
  day: AdminDay;
  field: 'opensAt' | 'submissionsCloseAt';
  title: string;
  description: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const now = useNow(30_000);
  const current = day[field];
  const initial = current ? toWatInputs(current) : { date: day.date, time: '' };
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const update = useMutation(
    api.admin.days.update.mutationOptions({
      onSuccess: (data, variables) => {
        applyDay(data);
        toast({ title: variables[field] ? 'Schedule saved' : 'Schedule removed' });
        onDone();
      },
    }),
  );
  const iso = fromWatInputs(date, time);
  const inPast = iso !== null && new Date(iso).getTime() <= now;
  const save = (value: string | null) =>
    update.mutate(
      field === 'opensAt'
        ? { id: day.id, opensAt: value }
        : { id: day.id, submissionsCloseAt: value },
    );

  return (
    <DialogForm
      title={title}
      description={description}
      submitLabel="Save schedule"
      pending={update.isPending}
      canSubmit={iso !== null && !inPast}
      error={update.error}
      onSubmit={() => {
        if (iso) save(iso);
      }}
    >
      <WatDateTimeInput
        label={field === 'opensAt' ? 'Opens at' : 'Closes at'}
        date={date}
        time={time}
        onDateChange={setDate}
        onTimeChange={setTime}
        error={inPast ? 'Pick a time in the future.' : undefined}
      />
      {current ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-muted px-3 py-2 text-sm">
          <span>Now set for {formatWat(current)}.</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={update.isPending}
            onClick={() => save(null)}
          >
            Remove schedule
          </Button>
        </div>
      ) : null}
    </DialogForm>
  );
}
