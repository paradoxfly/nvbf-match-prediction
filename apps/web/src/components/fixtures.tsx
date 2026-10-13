'use client';

import { CATEGORY_LABELS } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { cn } from '@predict/ui/utils';
import { LockIcon } from 'lucide-react';
import { TeamLogo } from '@/components/team-logo';
import { formatScore, formatTime } from '@/lib/format';
import type { MatchData, TeamData } from '@/lib/types';

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

function TeamLine({ team, sets, won }: { team: TeamData; sets?: number; won?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo team={team} size="sm" />
      <span
        className={cn('min-w-0 flex-1 truncate text-sm', won ? 'font-extrabold' : 'font-semibold')}
      >
        {team.name}
      </span>
      {sets !== undefined ? (
        <span className={cn('font-mono text-base', won ? 'font-bold' : 'text-muted-foreground')}>
          {sets}
        </span>
      ) : null}
    </div>
  );
}

function MatchStatusTag({ match, now }: { match: MatchData; now: number }) {
  if (match.status === 'void') {
    return (
      <Badge variant="destructive" title={match.voidReason ?? undefined}>
        void
      </Badge>
    );
  }
  if (match.result) {
    return (
      <Badge variant="success">
        <span className="sr-only">Result </span>
        {formatScore(match.result.homeSets, match.result.awaySets)}
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

/** One fixture: kick-off time, category, both teams and, once known, the result. */
export function FixtureRow({ match, now }: { match: MatchData; now: number }) {
  const result = match.result;
  return (
    <li className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <time dateTime={match.scheduledAt} className="font-mono text-xs font-bold">
            {formatTime(match.scheduledAt)}
          </time>
          <Badge>{CATEGORY_LABELS[match.category]}</Badge>
          {match.venue ? (
            <span className="hidden truncate text-xs text-muted-foreground sm:inline">
              {match.venue}
            </span>
          ) : null}
        </div>
        <MatchStatusTag match={match} now={now} />
      </div>
      <TeamLine
        team={match.home}
        sets={result?.homeSets}
        won={result ? result.homeSets > result.awaySets : undefined}
      />
      <TeamLine
        team={match.away}
        sets={result?.awaySets}
        won={result ? result.awaySets > result.homeSets : undefined}
      />
      {match.status === 'void' && match.voidReason ? (
        <p className="text-xs text-muted-foreground">Void: {match.voidReason}</p>
      ) : null}
    </li>
  );
}

export function FixtureList({ matches, now }: { matches: readonly MatchData[]; now: number }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg bg-card shadow-card">
      {sortMatches(matches).map((match) => (
        <FixtureRow key={match.id} match={match} now={now} />
      ))}
    </ul>
  );
}
