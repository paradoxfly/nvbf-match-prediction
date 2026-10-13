'use client';

import { DAY_STATUS_LABELS } from '@predict/contracts';
import type { MajorScore, Side } from '@predict/domain';
import { Button } from '@predict/ui/button';
import { EmptyState } from '@predict/ui/states';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarXIcon, ClockIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { isLocked, sortMatches } from '@/components/fixtures';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/text';
import { api } from '@/lib/api';
import { clockOffset, useServerNow } from '@/lib/clock';
import { BOARD_STATUSES } from '@/lib/days';
import { errorCode } from '@/lib/errors';
import { formatCountdown, formatDay, plural } from '@/lib/format';
import type { MatchData, MyDayData, PredictionData } from '@/lib/types';
import { DayStateBanner, EntryBanner } from './banners';
import { loadDrafts, storeDrafts } from './draft-storage';
import { MatchCard, type PickRejection } from './match-card';
import {
  checkDraft,
  draftForMajor,
  draftFromSets,
  sameMajor,
  sameSets,
  type PickDraft,
  type TeamNames,
} from './pick-logic';
import { PicksBar } from './picks-bar';

/** Most picks one save accepts (the API's limit). */
const MAX_PER_SAVE = 40;

const teamNames = (match: MatchData): TeamNames => ({
  home: match.home.shortName,
  away: match.away.shortName,
});

/** Drafts from this device that still matter: for open matches, and newer than the saved pick. */
function restoreDrafts(
  date: string,
  matches: readonly MatchData[],
  saved: ReadonlyMap<string, PredictionData>,
  now: number,
): Record<string, PickDraft> {
  const byId = new Map(matches.map((match) => [match.id, match]));
  const drafts: Record<string, PickDraft> = {};
  for (const [matchId, draft] of Object.entries(loadDrafts(date))) {
    const match = byId.get(matchId);
    if (!match || isLocked(match, now)) continue;
    const savedPick = saved.get(matchId);
    if (savedPick && new Date(savedPick.savedAt).getTime() >= draft.at) continue;
    drafts[matchId] = draft;
  }
  return drafts;
}

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const copy = { ...record };
  delete copy[key];
  return copy;
}

function PlayBoard({ date, data, offset }: { date: string; data: MyDayData; offset: number }) {
  const queryClient = useQueryClient();
  const now = useServerNow(offset);
  const { day, entry } = data;
  const format = day.settings.format;
  const canEdit = day.status === 'open' && !entry?.disqualified;
  const matches = useMemo(() => sortMatches(day.matches), [day.matches]);
  const savedById = useMemo(
    () => new Map(data.predictions.map((prediction) => [prediction.matchId, prediction])),
    [data.predictions],
  );

  const [drafts, setDrafts] = useState<Record<string, PickDraft>>(() =>
    restoreDrafts(date, matches, savedById, now),
  );
  const [rejections, setRejections] = useState<Record<string, PickRejection>>({});
  // Cards the player opened or folded by hand; the rest are open only while they need a pick.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => storeDrafts(date, drafts), [date, drafts]);

  const rows = matches.map((match) => {
    const locked = !canEdit || isLocked(match, now);
    const saved = savedById.get(match.id) ?? null;
    const draft = locked ? null : (drafts[match.id] ?? null);
    const check = draft ? checkDraft(draft, format, teamNames(match)) : null;
    const dirty =
      draft !== null && !(check?.ok === true && saved !== null && sameSets(check.sets, saved.sets));
    const current = draft ?? (saved ? draftFromSets(saved.sets, 0) : null);
    const needsPick = !locked && match.status !== 'void' && (saved === null || dirty);
    const expanded = toggled[match.id] ?? needsPick;
    return { match, locked, saved, draft, check, dirty, current, expanded };
  });
  const allExpanded = rows.every((row) => row.expanded);

  const playable = rows.filter((row) => row.match.status !== 'void');
  const picked = playable.filter((row) => row.saved !== null || row.check?.ok === true).length;
  const toSave = rows.flatMap((row) =>
    !row.locked && row.dirty && row.check && row.check.ok
      ? [{ matchId: row.match.id, sets: row.check.sets }]
      : [],
  );
  const toFix = rows.filter((row) => !row.locked && row.dirty && row.check?.ok === false).length;
  const rejectedCount = rows.filter((row) => row.dirty && rejections[row.match.id]).length;
  const hasUnsaved = toSave.length + toFix > 0;
  const editableCount = rows.filter((row) => !row.locked).length;

  // Leaving with unsaved picks: the drafts survive on this device, but say so anyway.
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  const save = useMutation(
    api.predictions.save.mutationOptions({
      onSuccess: (result, variables) => {
        const sent = new Map(variables.predictions.map((pick) => [pick.matchId, pick.sets]));
        const savedAt = new Map(result.saved.map((item) => [item.matchId, item.savedAt]));

        // Show the new picks as saved straight away; the refetch below fills in the rest.
        queryClient.setQueryData(api.entries.myDay.queryKey({ input: { date } }), (old) => {
          if (!old) return old;
          const predictions = [...old.predictions];
          for (const [matchId, at] of savedAt) {
            const sets = sent.get(matchId);
            if (!sets) continue;
            const homeSets = sets.filter((set) => set.home > set.away).length;
            const index = predictions.findIndex((pick) => pick.matchId === matchId);
            const next = {
              matchId,
              sets,
              homeSets,
              awaySets: sets.length - homeSets,
              savedAt: at,
              counts: index >= 0 ? (predictions[index]?.counts ?? false) : false,
            };
            if (index >= 0) predictions[index] = next;
            else predictions.push(next);
          }
          return { ...old, predictions };
        });

        // Saved cards fold up again; ones that were turned down stay open to fix.
        setToggled((previous) => {
          const next = { ...previous };
          for (const matchId of sent.keys()) delete next[matchId];
          return next;
        });

        // Drop the drafts that were saved, unless they changed while the request was out.
        setDrafts((previous) => {
          const next = { ...previous };
          for (const [matchId, sets] of sent) {
            const draft = next[matchId];
            const match = matches.find((item) => item.id === matchId);
            if (!draft || !match || !savedAt.has(matchId)) continue;
            const check = checkDraft(draft, format, teamNames(match));
            if (check.ok && sameSets(check.sets, sets)) delete next[matchId];
          }
          return next;
        });

        setRejections(
          Object.fromEntries(
            result.rejected.map((item) => [
              item.matchId,
              { reason: item.reason, message: item.message },
            ]),
          ),
        );
        setAnnouncement(
          [
            result.saved.length > 0 ? `Saved ${plural(result.saved.length, 'pick')}.` : '',
            result.rejected.length > 0
              ? `${plural(result.rejected.length, 'pick')} could not be saved.`
              : '',
          ]
            .filter(Boolean)
            .join(' '),
        );
        void queryClient.invalidateQueries({ queryKey: api.entries.key() });
      },
      onError: (error) => {
        setAnnouncement('Your picks were not saved. Try again.');
        const code = errorCode(error);
        if (code === 'DAY_NOT_OPEN' || code === 'ENTRY_CLOSED' || code === 'DISQUALIFIED') {
          void queryClient.invalidateQueries({ queryKey: api.entries.key() });
        }
      },
    }),
  );

  // Drafts are stamped with the ticking server clock, to compare with when picks were saved.
  function editDraft(match: MatchData, change: (base: PickDraft | null) => PickDraft | null) {
    const at = now;
    const saved = savedById.get(match.id) ?? null;
    setDrafts((previous) => {
      const base = previous[match.id] ?? (saved ? draftFromSets(saved.sets, at) : null);
      const next = change(base);
      if (!next) return without(previous, match.id);
      return { ...previous, [match.id]: { ...next, at } };
    });
    setRejections((previous) => without(previous, match.id));
  }

  function pickMajor(match: MatchData, major: MajorScore) {
    editDraft(match, (base) =>
      base && sameMajor(base, major) ? base : draftForMajor(major, format, base, now),
    );
  }

  function setWinners(match: MatchData, winners: Side[]) {
    editDraft(match, (base) => (base ? { ...base, winners } : base));
  }

  function setLoser(match: MatchData, index: number, value: string) {
    editDraft(match, (base) => {
      if (!base) return base;
      const losers = [...base.losers];
      losers[index] = value;
      return { ...base, losers };
    });
  }

  function undo(match: MatchData) {
    setDrafts((previous) => without(previous, match.id));
    setRejections((previous) => without(previous, match.id));
  }

  function onSave() {
    if (toSave.length === 0 || save.isPending) return;
    setAnnouncement('Saving your picks…');
    save.mutate({ date, predictions: toSave.slice(0, MAX_PER_SAVE) });
  }

  const cutoffLeft = day.entryCutoff ? new Date(day.entryCutoff).getTime() - now : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker={`${formatDay(day.date)} · ${DAY_STATUS_LABELS[day.status]}`}
        title="your picks"
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/rules?date=${day.date}`}>Rules</Link>
            </Button>
            {BOARD_STATUSES.has(day.status) ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/leaderboard/${day.date}`}>Leaderboard</Link>
              </Button>
            ) : null}
          </>
        }
      >
        <p>
          {day.title ?? day.leagueName} · {plural(day.matches.length, 'match', 'matches')}
        </p>
        {day.status === 'open' && cutoffLeft !== null ? (
          <p className="mt-1 flex items-center gap-1.5 font-semibold text-foreground">
            <ClockIcon aria-hidden className="size-4" />
            {cutoffLeft > 0 ? (
              <span>
                Last picks close in{' '}
                <time dateTime={day.entryCutoff ?? undefined} className="font-mono">
                  {formatCountdown(cutoffLeft)}
                </time>
              </span>
            ) : (
              'All picks are closed for today.'
            )}
          </p>
        ) : null}
      </PageHeader>

      {day.status !== 'open' ? <DayStateBanner day={day} /> : null}
      <EntryBanner day={day} entry={entry} hasSavedPicks={data.predictions.length > 0} />

      {matches.length === 0 ? (
        <EmptyState
          title="No matches yet"
          description="The fixtures for this day haven't been added yet. Check back soon."
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setToggled(Object.fromEntries(rows.map((row) => [row.match.id, !allExpanded])))
              }
            >
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </Button>
          </div>
          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2">
            {rows.map((row) => (
              <MatchCard
                key={row.match.id}
                match={row.match}
                format={format}
                scoring={day.settings.scoring}
                now={now}
                locked={row.locked}
                dayStatus={day.status}
                saved={row.saved}
                current={row.current}
                check={row.check}
                dirty={row.dirty}
                rejection={rejections[row.match.id] ?? null}
                entryConfirmed={entry?.status === 'confirmed'}
                expanded={row.expanded}
                onToggle={() =>
                  setToggled((previous) => ({ ...previous, [row.match.id]: !row.expanded }))
                }
                onPickMajor={(major) => pickMajor(row.match, major)}
                onSetWinner={(_, winners) => setWinners(row.match, winners)}
                onLoserChange={(index, value) => setLoser(row.match, index, value)}
                onUndo={() => undo(row.match)}
              />
            ))}
          </div>
        </div>
      )}

      {canEdit && editableCount > 0 ? (
        <>
          <div aria-hidden className="h-20" />
          <PicksBar
            picked={picked}
            total={playable.length}
            toSave={toSave.length}
            toFix={toFix}
            rejected={rejectedCount}
            pending={save.isPending}
            error={save.isError ? save.error : null}
            announcement={announcement}
            onSave={onSave}
          />
        </>
      ) : null}
    </div>
  );
}

function PlaySkeleton() {
  return (
    <div role="status" aria-label="Loading your picks" className="flex flex-col gap-6">
      <Skeleton className="h-20 w-2/3" />
      <Skeleton className="h-24" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

/** The core screen: a day's matches, the player's picks and their entry. */
export function PlayScreen({ date }: { date: string }) {
  const query = useQuery(
    api.entries.myDay.queryOptions({
      input: { date },
      // Payment confirmations, locks and results change while the day runs.
      refetchInterval: (current) => {
        const status = current.state.data?.day.status;
        return status === 'open' || status === 'closed' ? 30_000 : false;
      },
    }),
  );

  if (!query.data) {
    if (query.isError) {
      if (errorCode(query.error) === 'NOT_FOUND') {
        return (
          <EmptyState
            icon={<CalendarXIcon aria-hidden className="size-8" />}
            title="No match day on this date"
            description="There's no contest for this date. Today's matches are on the home page."
            action={
              <Button asChild>
                <Link href="/">Back to today</Link>
              </Button>
            }
          />
        );
      }
      return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
    }
    return <PlaySkeleton />;
  }

  return (
    <PlayBoard
      key={date}
      date={date}
      data={query.data}
      offset={clockOffset(query.data.serverNow, query.dataUpdatedAt)}
    />
  );
}
