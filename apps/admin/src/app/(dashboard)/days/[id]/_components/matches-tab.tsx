'use client';

import { CATEGORY_LABELS, type Category } from '@predict/contracts';
import { watDate, watTime } from '@predict/domain';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { Textarea } from '@predict/ui/textarea';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ban, CalendarClock, Lock, LockOpen, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { WatDateTimeInput } from '@/components/inputs';
import { QueryState } from '@/components/query-state';
import { CheckboxField } from '@/components/ui/checkbox';
import { MatchStatusBadge } from '@/components/status-badges';
import { MatchTeams } from '@/components/team-logo';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { DialogForm } from '@/components/ui/dialog-form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatTime, formatWat, fromWatInputs } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import type { AdminDay, DayMatch, LeagueTeam } from '@/lib/types';
import { useApplyDay } from './day-actions';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export const sortMatches = (matches: DayMatch[]) =>
  [...matches].sort(
    (a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.category.localeCompare(b.category),
  );

export const setLine = (sets: { home: number; away: number }[]) =>
  sets.map((set) => `${set.home}–${set.away}`).join(', ');

const MINUTE_MS = 60_000;

/**
 * When a locked match would lock again if its picks reopened: its start minus the lead time,
 * capped by a scheduled close. Null when reopening can't help (the day isn't open, the match
 * has a result, or that moment has passed). The API checks again, including a marked early start.
 */
function reopenUntil(day: AdminDay, match: DayMatch, now: number): number | null {
  if (day.status !== 'open' || match.status !== 'scheduled' || !match.locked || match.result) {
    return null;
  }
  let lock = new Date(match.scheduledAt).getTime() - day.config.lockLeadMin * MINUTE_MS;
  if (day.submissionsCloseAt) lock = Math.min(lock, new Date(day.submissionsCloseAt).getTime());
  return lock > now ? lock : null;
}

export function MatchesTab({ day }: { day: AdminDay }) {
  const admin = useAdmin();
  const now = useNow(30_000);
  const isOps = can(admin, 'operations');
  const beforeOpen = day.status === 'draft' || day.status === 'published';
  const running = day.status === 'open' || day.status === 'closed';
  const matches = sortMatches(day.matches);

  return (
    <div className="flex flex-col gap-4">
      {beforeOpen && isOps ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Times are in Lagos time. Matches can be added, moved and removed until the day opens.
          </p>
          <AddMatchDialog day={day} />
        </div>
      ) : running ? (
        <p className="text-sm text-muted-foreground">
          The fixture list is fixed now. If a match starts early, is called off or moves, record it
          here. A match that locked but was postponed to later today can have its picks reopened
          once it&apos;s rescheduled.
        </p>
      ) : null}

      {matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          description={
            beforeOpen
              ? 'Add matches here, or import the fixture list from the league.'
              : 'This day has no matches.'
          }
        />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader className="hidden md:table-header-group">
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Status</TableHead>
                {isOps && (beforeOpen || running) ? (
                  <TableHead className="text-right">Actions</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matches.map((match) => {
                const lockDiffers = match.lockAt !== match.scheduledAt;
                const relockAt = running && isOps ? reopenUntil(day, match, now) : null;
                return (
                  <TableRow
                    key={match.id}
                    className={cn(
                      'flex flex-col gap-2 py-3 md:table-row md:py-0',
                      match.status === 'void' && 'opacity-60',
                    )}
                  >
                    <TableCell className="block py-0 align-top whitespace-nowrap md:table-cell md:py-3">
                      <span className="flex items-center justify-between gap-2 md:block">
                        <span className="font-mono font-bold">{formatTime(match.scheduledAt)}</span>
                        <span className="md:hidden">
                          <MatchStatusBadge status={match.status} />
                        </span>
                      </span>
                      {match.locked ? (
                        <span className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Lock className="size-3" aria-hidden />
                          locked{lockDiffers ? ` ${formatTime(match.lockAt)}` : ''}
                        </span>
                      ) : lockDiffers ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          picks lock {formatTime(match.lockAt)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="block py-0 align-top md:table-cell md:min-w-64 md:py-3">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="muted">{CATEGORY_LABELS[match.category]}</Badge>
                        <MatchTeams home={match.home} away={match.away} />
                      </span>
                      <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                        {match.venue ? <span>{match.venue}</span> : null}
                        {match.result ? (
                          <span className="font-mono font-bold text-foreground">
                            {match.result.homeSets}–{match.result.awaySets} ·{' '}
                            <span className="font-normal text-muted-foreground">
                              {setLine(match.result.sets)}
                            </span>
                          </span>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="hidden align-top md:table-cell">
                      <MatchStatusBadge status={match.status} />
                      {match.voidReason ? (
                        <span className="mt-1 block max-w-48 text-xs text-muted-foreground">
                          {match.voidReason}
                        </span>
                      ) : null}
                    </TableCell>
                    {match.voidReason ? (
                      <TableCell className="block py-0 text-xs text-muted-foreground md:hidden">
                        Void: {match.voidReason}
                      </TableCell>
                    ) : null}
                    {isOps && (beforeOpen || running) ? (
                      <TableCell className="block py-0 align-top md:table-cell md:py-3">
                        <div className="flex flex-wrap gap-1 md:justify-end">
                          {beforeOpen ? (
                            <>
                              <EditMatchDialog day={day} match={match} />
                              <RemoveMatchButton day={day} match={match} />
                            </>
                          ) : match.status === 'void' ? null : (
                            <>
                              {match.status === 'scheduled' ? (
                                <>
                                  <MarkStartedDialog day={day} match={match} />
                                  <RescheduleDialog day={day} match={match} />
                                </>
                              ) : null}
                              {relockAt !== null ? (
                                <ReopenPicksButton day={day} match={match} until={relockAt} />
                              ) : null}
                              <VoidMatchButton day={day} match={match} />
                              <EditMatchDialog day={day} match={match} venueOnly />
                            </>
                          )}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function DialogButton({
  trigger,
  children,
}: {
  trigger: ReactElement;
  children: (close: () => void) => ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>{children(() => setOpen(false))}</DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Before the day opens

function AddMatchDialog({ day }: { day: AdminDay }) {
  return (
    <DialogButton
      trigger={
        <Button>
          <Plus aria-hidden />
          Add match
        </Button>
      }
    >
      {(close) => <AddMatchForm day={day} onDone={close} />}
    </DialogButton>
  );
}

function AddMatchForm({ day, onDone }: { day: AdminDay; onDone: () => void }) {
  const league = useQuery(api.admin.leagues.get.queryOptions({ input: { id: day.leagueId } }));
  return (
    <QueryState query={league} errorTitle="Could not load the league's teams">
      {(data) => <AddMatchFields day={day} teams={data.teams} onDone={onDone} />}
    </QueryState>
  );
}

function AddMatchFields({
  day,
  teams,
  onDone,
}: {
  day: AdminDay;
  teams: LeagueTeam[];
  onDone: () => void;
}) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const last = sortMatches(day.matches).at(-1);
  const [category, setCategory] = useState<Category>(last?.category ?? 'men');
  const [homeId, setHomeId] = useState('');
  const [awayId, setAwayId] = useState('');
  const [time, setTime] = useState('');
  const [venue, setVenue] = useState(last?.venue ?? '');
  const add = useMutation(
    api.admin.days.addMatch.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Match added' });
        onDone();
      },
    }),
  );
  const inCategory = teams
    .filter((row) => row.team.category === category && !row.withdrawn)
    .map((row) => row.team)
    .sort((a, b) => a.name.localeCompare(b.name));
  const valid = homeId !== '' && awayId !== '' && homeId !== awayId && /^\d{2}:\d{2}/.test(time);

  return (
    <DialogForm
      title="Add a match"
      description={`Both teams must be in this league's ${CATEGORY_LABELS[category].toLowerCase()}'s table. Time is Lagos time on this day.`}
      submitLabel="Add match"
      pendingLabel="Adding…"
      pending={add.isPending}
      canSubmit={valid}
      error={add.error}
      onSubmit={() =>
        add.mutate({
          id: day.id,
          homeTeamId: homeId,
          awayTeamId: awayId,
          time: time.slice(0, 5),
          venue: venue.trim() || undefined,
        })
      }
    >
      <Field label="Category">
        <Select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value as Category);
            setHomeId('');
            setAwayId('');
          }}
        >
          {CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {CATEGORY_LABELS[item]}
            </option>
          ))}
        </Select>
      </Field>
      {inCategory.length < 2 ? (
        <Callout variant="warning">
          This league has fewer than two {CATEGORY_LABELS[category].toLowerCase()}&apos;s teams. Add
          teams to the league first.
        </Callout>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Home">
          <Select value={homeId} onChange={(event) => setHomeId(event.target.value)}>
            <option value="">Choose a team</option>
            {inCategory.map((team) => (
              <option key={team.id} value={team.id} disabled={team.id === awayId}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Away">
          <Select value={awayId} onChange={(event) => setAwayId(event.target.value)}>
            <option value="">Choose a team</option>
            {inCategory.map((team) => (
              <option key={team.id} value={team.id} disabled={team.id === homeId}>
                {team.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <Field label="Start (WAT)">
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>
        <Field label="Venue" hint="Optional.">
          <Input value={venue} maxLength={80} onChange={(event) => setVenue(event.target.value)} />
        </Field>
      </div>
    </DialogForm>
  );
}

function EditMatchDialog({
  day,
  match,
  venueOnly = false,
}: {
  day: AdminDay;
  match: DayMatch;
  venueOnly?: boolean;
}) {
  return (
    <DialogButton
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Edit ${venueOnly ? 'venue of ' : ''}${match.home.shortName} v ${match.away.shortName}`}
          title={venueOnly ? 'Edit venue' : 'Edit time and venue'}
        >
          <Pencil aria-hidden />
        </Button>
      }
    >
      {(close) => <EditMatchForm day={day} match={match} venueOnly={venueOnly} onDone={close} />}
    </DialogButton>
  );
}

function EditMatchForm({
  day,
  match,
  venueOnly,
  onDone,
}: {
  day: AdminDay;
  match: DayMatch;
  venueOnly: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const [time, setTime] = useState(formatTime(match.scheduledAt));
  const [venue, setVenue] = useState(match.venue ?? '');
  const update = useMutation(
    api.admin.days.updateMatch.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Match saved' });
        onDone();
      },
    }),
  );
  const timeOk = venueOnly || /^\d{2}:\d{2}/.test(time);

  return (
    <DialogForm
      title={venueOnly ? 'Edit venue' : 'Edit match'}
      description={`${match.home.name} v ${match.away.name}`}
      submitLabel="Save"
      pending={update.isPending}
      canSubmit={timeOk}
      error={update.error}
      onSubmit={() =>
        update.mutate({
          id: match.id,
          time: venueOnly ? undefined : time.slice(0, 5),
          venue: venue.trim() || null,
        })
      }
    >
      {venueOnly ? null : (
        <Field label="Start (WAT)">
          <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </Field>
      )}
      <Field label="Venue">
        <Input value={venue} maxLength={80} onChange={(event) => setVenue(event.target.value)} />
      </Field>
    </DialogForm>
  );
}

function RemoveMatchButton({ day, match }: { day: AdminDay; match: DayMatch }) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const remove = useMutation(
    api.admin.days.removeMatch.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Match removed' });
      },
    }),
  );
  return (
    <ConfirmAction
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${match.home.shortName} v ${match.away.shortName}`}
          title="Remove match"
        >
          <Trash2 aria-hidden />
        </Button>
      }
      title="Remove this match?"
      description={`${match.home.name} v ${match.away.name} at ${formatTime(match.scheduledAt)}.`}
      confirmLabel="Remove match"
      pendingLabel="Removing…"
      destructive
      onConfirm={() => remove.mutateAsync({ id: match.id })}
    />
  );
}

// ---------------------------------------------------------------------------------------------
// After the day opens

function MarkStartedDialog({ day, match }: { day: AdminDay; match: DayMatch }) {
  return (
    <DialogButton
      trigger={
        <Button variant="outline" size="sm">
          <Play aria-hidden />
          Started early
        </Button>
      }
    >
      {(close) => <MarkStartedForm day={day} match={match} onDone={close} />}
    </DialogButton>
  );
}

function MarkStartedForm({
  day,
  match,
  onDone,
}: {
  day: AdminDay;
  match: DayMatch;
  onDone: () => void;
}) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const now = useNow(15_000);
  const [date, setDate] = useState(() => watDate(new Date(now)));
  const [time, setTime] = useState(() => watTime(new Date(now)));
  const [reason, setReason] = useState('');
  const mark = useMutation(
    api.admin.days.markStarted.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Match marked as started', description: 'Picks for it are locked.' });
        onDone();
      },
    }),
  );
  const iso = fromWatInputs(date, time);
  const future = iso !== null && new Date(iso).getTime() > now;

  return (
    <DialogForm
      title="Match started early"
      description={`${match.home.name} v ${match.away.name} was scheduled for ${formatWat(match.scheduledAt)}. Picks lock from the time you enter, and only payments that arrived before it count for this match.`}
      submitLabel="Lock the match"
      pendingLabel="Saving…"
      pending={mark.isPending}
      canSubmit={iso !== null && !future && reason.trim().length >= 3}
      error={mark.error}
      onSubmit={() => {
        if (iso) mark.mutate({ id: match.id, startedAt: iso, reason: reason.trim() });
      }}
    >
      <WatDateTimeInput
        label="It actually started at"
        date={date}
        time={time}
        onDateChange={setDate}
        onTimeChange={setTime}
        error={future ? 'That is in the future.' : undefined}
      />
      <Field label="Reason" hint="At least 3 characters. Saved in the audit log.">
        <Textarea
          value={reason}
          maxLength={500}
          className="min-h-20"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </DialogForm>
  );
}

function RescheduleDialog({ day, match }: { day: AdminDay; match: DayMatch }) {
  return (
    <DialogButton
      trigger={
        <Button variant="outline" size="sm">
          <CalendarClock aria-hidden />
          Reschedule
        </Button>
      }
    >
      {(close) => <RescheduleForm day={day} match={match} onDone={close} />}
    </DialogButton>
  );
}

function RescheduleForm({
  day,
  match,
  onDone,
}: {
  day: AdminDay;
  match: DayMatch;
  onDone: () => void;
}) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const [time, setTime] = useState(formatTime(match.scheduledAt));
  const [reason, setReason] = useState('');
  const reschedule = useMutation(
    api.admin.days.reschedule.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Match rescheduled' });
        onDone();
      },
    }),
  );

  return (
    <DialogForm
      title="Reschedule match"
      description={`${match.home.name} v ${match.away.name}, same day. If its picks already locked, they stay locked until you reopen them.`}
      submitLabel="Save new time"
      pending={reschedule.isPending}
      canSubmit={/^\d{2}:\d{2}/.test(time) && reason.trim().length >= 3}
      error={reschedule.error}
      onSubmit={() =>
        reschedule.mutate({ id: match.id, time: time.slice(0, 5), reason: reason.trim() })
      }
    >
      <Field label="New start (WAT)">
        <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
      </Field>
      <Field label="Reason" hint="At least 3 characters. Saved in the audit log.">
        <Textarea
          value={reason}
          maxLength={500}
          className="min-h-20"
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </DialogForm>
  );
}

function ReopenPicksButton({
  day,
  match,
  until,
}: {
  day: AdminDay;
  match: DayMatch;
  /** When picks lock again (ms). */
  until: number;
}) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const [notStarted, setNotStarted] = useState(false);
  const reopen = useMutation(
    api.admin.days.reopenMatch.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({
          title: 'Picks reopened',
          description: `They lock again at ${formatTime(new Date(until))}.`,
        });
      },
    }),
  );
  return (
    <ConfirmAction
      trigger={
        <Button variant="outline" size="sm">
          <LockOpen aria-hidden />
          Reopen picks
        </Button>
      }
      title="Reopen picks for this match?"
      description={`${match.home.name} v ${match.away.name} is now at ${formatTime(match.scheduledAt)}. Players can pick it again until ${formatTime(new Date(until))}, and payments that arrive before then count for it.`}
      confirmLabel="Reopen picks"
      pendingLabel="Reopening…"
      reason={{ placeholder: 'e.g. Postponed from 12:00 by the federation; not started.' }}
      confirmDisabled={!notStarted}
      onConfirm={(reason) => reopen.mutateAsync({ id: match.id, reason })}
    >
      <CheckboxField
        label="This match hasn't started"
        description="Only reopen a match nobody has seen any of yet."
        checked={notStarted}
        onCheckedChange={setNotStarted}
      />
    </ConfirmAction>
  );
}

function VoidMatchButton({ day, match }: { day: AdminDay; match: DayMatch }) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const voidMatch = useMutation(
    api.admin.days.voidMatch.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Match voided' });
      },
    }),
  );
  return (
    <ConfirmAction
      trigger={
        <Button variant="destructive" size="sm">
          <Ban aria-hidden />
          Void
        </Button>
      }
      title="Void this match?"
      description={`${match.home.name} v ${match.away.name} won't count for anyone. If too few matches are left to play, the day has to be cancelled with full refunds.`}
      confirmLabel="Void match"
      pendingLabel="Voiding…"
      destructive
      reason={{ placeholder: 'e.g. Postponed by the federation.' }}
      onConfirm={(reason) => voidMatch.mutateAsync({ id: match.id, reason })}
    />
  );
}
