'use client';

import { CATEGORY_LABELS, type Category, type DayStatus } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { cn } from '@predict/ui/utils';
import { ClockIcon, LockIcon } from 'lucide-react';
import { majorLabel } from '@/components/play/pick-logic';
import { TeamLogo } from '@/components/team-logo';
import { formatScore, formatSets, formatTime } from '@/lib/format';
import type { MatchData, PredictionData, TeamData } from '@/lib/types';

/** Matches in kick-off order (earliest first), then men before women. */
export function sortMatches<T extends { scheduledAt: string; category: string }>(
  matches: readonly T[],
) {
  return [...matches].sort(
    (a, b) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime() ||
      a.category.localeCompare(b.category),
  );
}

/** Locked by the server, or its lock time has passed on the (server-synced) clock. */
export function isLocked(match: MatchData, now: number): boolean {
  return match.locked || match.status !== 'scheduled' || now >= new Date(match.lockAt).getTime();
}

const CATEGORY_TONES: Record<Category, string> = {
  men: 'bg-sg-night text-sg-chalk',
  women: 'bg-sg-flash text-sg-night',
};

/** Men or women: a solid tag in its own colour, so the two are hard to mix up. */
export function CategoryTag({ category }: { category: Category }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-[1.5px] uppercase',
        CATEGORY_TONES[category],
      )}
    >
      {CATEGORY_LABELS[category]}
    </span>
  );
}

function TeamSide({ team, side, won }: { team: TeamData; side: 'home' | 'away'; won?: boolean }) {
  return (
    <span className={cn('flex min-w-0 items-center gap-2', side === 'away' && 'flex-row-reverse')}>
      <TeamLogo team={team} size="sm" />
      <span
        className={cn(
          'line-clamp-2 min-w-0 text-sm leading-tight',
          side === 'away' && 'text-right',
          won === false ? 'font-semibold text-muted-foreground' : 'font-extrabold',
        )}
      >
        {team.name}
      </span>
    </span>
  );
}

function MatchStatusTag({
  match,
  now,
  dayStatus,
}: {
  match: MatchData;
  now: number;
  dayStatus: DayStatus;
}) {
  if (match.status === 'void') {
    return (
      <Badge variant="destructive" title={match.voidReason ?? undefined}>
        void
      </Badge>
    );
  }
  if (match.result) return <Badge variant="success">Final</Badge>;
  // Picks for a day that hasn't opened aren't locked, just not open yet.
  if (dayStatus === 'published') {
    return (
      <Badge>
        <ClockIcon aria-hidden />
        Opens soon
      </Badge>
    );
  }
  if (isLocked(match, now)) {
    return (
      <Badge>
        <LockIcon aria-hidden />
        Locked
      </Badge>
    );
  }
  return null;
}

function YourPick({ match, pick }: { match: MatchData; pick: PredictionData }) {
  const names = { home: match.home.shortName, away: match.away.shortName };
  const decided = pick.homeSets !== pick.awaySets;
  return (
    <p className="rounded-sm bg-muted px-3 py-2 text-xs md:max-w-xl">
      <span className="font-semibold">You predicted </span>
      <span className="font-mono font-bold">
        {decided ? majorLabel({ homeSets: pick.homeSets, awaySets: pick.awaySets }, names) : '—'}
      </span>
      {pick.sets.length > 0 ? (
        <span className="font-mono text-muted-foreground"> ({formatSets(pick.sets)})</span>
      ) : null}
    </p>
  );
}

/** One fixture: kick-off time, category, home vs away and, once known, the result. */
export function FixtureRow({
  match,
  now,
  dayStatus,
  pick,
}: {
  match: MatchData;
  now: number;
  dayStatus: DayStatus;
  /** The signed-in player's saved pick for this match, if any. */
  pick?: PredictionData;
}) {
  const result = match.result;
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <time dateTime={match.scheduledAt} className="font-mono text-xs font-bold">
            {formatTime(match.scheduledAt)}
          </time>
          <CategoryTag category={match.category} />
          {match.venue ? (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {match.venue}
            </span>
          ) : null}
        </div>
        <MatchStatusTag match={match} now={now} dayStatus={dayStatus} />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 md:max-w-xl">
        <TeamSide
          team={match.home}
          side="home"
          won={result ? result.homeSets > result.awaySets : undefined}
        />
        {result ? (
          <span className="font-mono text-base font-bold">
            <span className="sr-only">Result </span>
            {formatScore(result.homeSets, result.awaySets)}
          </span>
        ) : (
          <span className="font-mono text-xs font-bold text-muted-foreground">vs</span>
        )}
        <TeamSide
          team={match.away}
          side="away"
          won={result ? result.awaySets > result.homeSets : undefined}
        />
      </div>
      {pick ? <YourPick match={match} pick={pick} /> : null}
      {match.status === 'void' && match.voidReason ? (
        <p className="text-xs text-muted-foreground">Void: {match.voidReason}</p>
      ) : null}
    </li>
  );
}

export function FixtureList({
  matches,
  now,
  dayStatus,
  picks,
}: {
  matches: readonly MatchData[];
  now: number;
  dayStatus: DayStatus;
  /** The signed-in player's saved picks, by match id. */
  picks?: ReadonlyMap<string, PredictionData>;
}) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-card">
      {sortMatches(matches).map((match) => (
        <FixtureRow
          key={match.id}
          match={match}
          now={now}
          dayStatus={dayStatus}
          pick={picks?.get(match.id)}
        />
      ))}
    </ul>
  );
}
