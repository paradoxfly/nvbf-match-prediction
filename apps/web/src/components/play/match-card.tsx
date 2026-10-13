'use client';

import { CATEGORY_LABELS, type DayStatus } from '@predict/contracts';
import {
  majorOutcomes,
  scoreMatch,
  targetForSet,
  type MajorScore,
  type MatchFormat,
  type ScoringConfig,
  type Side,
} from '@predict/domain';
import { Alert } from '@predict/ui/alert';
import { Badge } from '@predict/ui/badge';
import { cn } from '@predict/ui/utils';
import { CheckIcon, ChevronDownIcon, LockIcon, Undo2Icon } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { TeamLogo } from '@/components/team-logo';
import { formatCountdown, formatScore, formatSets, formatTime } from '@/lib/format';
import type { MatchData, PredictionData, TeamData } from '@/lib/types';
import {
  majorLabel,
  majorText,
  moveSetWinner,
  sameMajor,
  shownWinnerPoints,
  type DraftCheck,
  type PickDraft,
  type TeamNames,
} from './pick-logic';

export interface PickRejection {
  reason: string;
  message: string;
}

export interface MatchCardProps {
  match: MatchData;
  format: MatchFormat;
  scoring: ScoringConfig;
  now: number;
  /** Picks can't change: the day isn't open, or this match has locked. */
  locked: boolean;
  dayStatus: DayStatus;
  saved: PredictionData | null;
  /** What the player sees in the editor: their unsaved edit, else the saved pick. */
  current: PickDraft | null;
  check: DraftCheck | null;
  dirty: boolean;
  rejection: PickRejection | null;
  entryConfirmed: boolean;
  /** Folded cards show a one-line summary instead of the editor. */
  expanded: boolean;
  onToggle: () => void;
  onPickMajor: (major: MajorScore) => void;
  onSetWinner: (index: number, winners: Side[]) => void;
  onLoserChange: (index: number, value: string) => void;
  onUndo: () => void;
}

function TeamColumn({ team }: { team: TeamData }) {
  return (
    <span className="flex min-w-0 flex-col items-center gap-1.5 text-center">
      <TeamLogo team={team} size="lg" />
      <span className="line-clamp-2 text-sm leading-tight font-extrabold">{team.name}</span>
    </span>
  );
}

function LockInfo({
  match,
  locked,
  dayStatus,
  now,
}: {
  match: MatchData;
  locked: boolean;
  dayStatus: DayStatus;
  now: number;
}) {
  if (match.status === 'void') return <Badge variant="destructive">void</Badge>;
  if (locked) {
    if (dayStatus === 'published' || dayStatus === 'cancelled') return null;
    return (
      <Badge>
        <LockIcon aria-hidden />
        Locked
      </Badge>
    );
  }
  const left = new Date(match.lockAt).getTime() - now;
  return (
    <span className="font-mono text-[11px] text-muted-foreground">
      locks in{' '}
      <time dateTime={match.lockAt} className="font-bold text-foreground">
        {formatCountdown(left)}
      </time>
    </span>
  );
}

function MajorChips({
  format,
  names,
  fullNames,
  selected,
  onPick,
}: {
  format: MatchFormat;
  names: TeamNames;
  fullNames: TeamNames;
  selected: MajorScore | null;
  onPick: (major: MajorScore) => void;
}) {
  const outcomes = majorOutcomes(format);
  const perRow = outcomes.length / 2;
  return (
    <div
      role="group"
      aria-label="Result"
      className={cn('grid gap-2', perRow === 3 ? 'grid-cols-3' : 'grid-cols-2')}
    >
      {outcomes.map((major) => {
        const pressed = selected !== null && sameMajor(selected, major);
        const winner: Side = major.homeSets > major.awaySets ? 'home' : 'away';
        return (
          <button
            key={`${major.homeSets}-${major.awaySets}`}
            type="button"
            aria-pressed={pressed}
            aria-label={`${fullNames[winner]} win ${majorText(major)}`}
            onClick={() => onPick(major)}
            className={cn(
              'h-10 min-w-0 truncate rounded-full border px-2 font-mono text-[13px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
              pressed
                ? 'border-sg-night bg-sg-night text-sg-flash'
                : 'border-sg-night/15 bg-background hover:bg-muted',
            )}
          >
            {majorLabel(major, names)}
          </button>
        );
      })}
    </div>
  );
}

function SideToggle({
  label,
  fullLabel,
  pressed,
  disabled,
  onClick,
}: {
  label: string;
  fullLabel: string;
  pressed: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={`${fullLabel} wins this set`}
      disabled={disabled && !pressed}
      onClick={onClick}
      className={cn(
        'h-9 min-w-0 flex-1 truncate rounded-full border px-2 font-mono text-[11px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/60 disabled:opacity-35',
        pressed
          ? 'border-sg-night bg-sg-night text-sg-chalk'
          : 'border-sg-night/15 bg-background hover:bg-muted',
      )}
    >
      {label}
    </button>
  );
}

function SetRows({
  draft,
  format,
  names,
  fullNames,
  onSetWinner,
  onLoserChange,
}: {
  draft: PickDraft;
  format: MatchFormat;
  names: TeamNames;
  fullNames: TeamNames;
  onSetWinner: (index: number, winners: Side[]) => void;
  onLoserChange: (index: number, value: string) => void;
}) {
  const hintId = useId();
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={hintId}>
      <legend className="sr-only">Points in each set</legend>
      <p id={hintId} className="text-xs text-muted-foreground">
        Tap who wins each set, then type the loser&apos;s points. We fill in the winner&apos;s.
      </p>
      {draft.winners.map((winner, index) => {
        const loserSide: Side = winner === 'home' ? 'away' : 'home';
        const winnerShown = shownWinnerPoints(draft.losers[index], index, format);
        const target = targetForSet(index, format);
        const input = (
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={2}
            value={draft.losers[index] ?? ''}
            aria-label={`Set ${index + 1}: ${fullNames[loserSide]} points`}
            onChange={(event) => onLoserChange(index, event.target.value.replace(/\D/g, ''))}
            onFocus={(event) => event.target.select()}
            className="h-10 w-12 rounded-sm border border-input bg-sg-surface/60 text-center font-mono text-base font-bold outline-none focus-visible:border-sg-night/30 focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        );
        const fixed = (
          <span className="inline-flex h-10 w-10 items-center justify-center font-mono text-base font-bold">
            <span className="sr-only">{fullNames[winner]}: </span>
            {winnerShown}
          </span>
        );
        return (
          <div
            key={index}
            role="group"
            aria-label={`Set ${index + 1}`}
            className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2"
          >
            <span className="flex flex-col leading-tight">
              <span className="font-mono text-[11px] font-bold uppercase">Set {index + 1}</span>
              <span className="font-mono text-[10px] text-muted-foreground">to {target}</span>
            </span>
            <span className="flex min-w-0 gap-1">
              {(['home', 'away'] as const).map((side) => {
                const next = moveSetWinner(draft.winners, index, side);
                return (
                  <SideToggle
                    key={side}
                    label={names[side]}
                    fullLabel={fullNames[side]}
                    pressed={winner === side}
                    disabled={next === null}
                    onClick={() => {
                      if (next && winner !== side) onSetWinner(index, next);
                    }}
                  />
                );
              })}
            </span>
            <span className="flex items-center gap-1">
              {winner === 'home' ? fixed : input}
              <span aria-hidden className="text-muted-foreground">
                –
              </span>
              {winner === 'away' ? fixed : input}
            </span>
          </div>
        );
      })}
    </fieldset>
  );
}

function PickSummary({
  title,
  sets,
  names,
}: {
  title: string;
  sets: readonly { home: number; away: number }[];
  names: TeamNames;
}) {
  const homeSets = sets.filter((set) => set.home > set.away).length;
  const awaySets = sets.length - homeSets;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground uppercase">
        {title}
      </span>
      <span className="font-mono text-sm font-bold">
        {homeSets !== awaySets ? majorLabel({ homeSets, awaySets }, names) : '—'}
      </span>
      <span className="font-mono text-xs text-muted-foreground">{formatSets(sets)}</span>
    </div>
  );
}

/** Points a saved pick earned, once the match has a confirmed result. */
function pointsFor(match: MatchData, saved: PredictionData | null, scoring: ScoringConfig) {
  const result = match.result;
  return saved && result && match.status === 'final'
    ? scoreMatch(
        { homeSets: saved.homeSets, awaySets: saved.awaySets },
        { homeSets: result.homeSets, awaySets: result.awaySets },
        scoring,
      ).points
    : null;
}

function ReadOnlyPick({
  match,
  saved,
  names,
  scoring,
  dayStatus,
  entryConfirmed,
}: {
  match: MatchData;
  saved: PredictionData | null;
  names: TeamNames;
  scoring: ScoringConfig;
  dayStatus: DayStatus;
  entryConfirmed: boolean;
}) {
  if (dayStatus === 'published') {
    return (
      <p className="rounded-sm bg-muted p-3 text-sm text-muted-foreground">
        You can pick this match once the day opens.
      </p>
    );
  }

  const result = match.result;
  const points = pointsFor(match, saved, scoring);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 rounded-sm bg-muted p-3">
        {saved ? (
          <PickSummary title="Your pick" sets={saved.sets} names={names} />
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground uppercase">
              Your pick
            </span>
            <span className="text-sm font-bold">No pick</span>
          </div>
        )}
        {result ? (
          <PickSummary title="Result" sets={result.sets} names={names} />
        ) : (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[10px] tracking-[1px] text-muted-foreground uppercase">
              Result
            </span>
            <span className="text-sm font-bold">
              {match.status === 'void' ? 'Void' : 'Not in yet'}
            </span>
          </div>
        )}
      </div>
      {match.status === 'void' ? (
        <p className="text-xs text-muted-foreground">
          This match doesn&apos;t count{match.voidReason ? `: ${match.voidReason}` : '.'}
        </p>
      ) : saved ? (
        <p className="text-xs">
          {saved.counts ? (
            <span className="font-bold text-success">
              <CheckIcon aria-hidden className="mr-1 inline size-3.5" />
              Counts{points !== null ? ` · ${points} ${points === 1 ? 'point' : 'points'}` : ''}
            </span>
          ) : entryConfirmed ? (
            <span className="text-muted-foreground">
              Doesn&apos;t count: your payment reached us after this match locked.
            </span>
          ) : (
            <span className="text-muted-foreground">
              Only counts if your payment reached us before {formatTime(match.lockAt)}.
            </span>
          )}
        </p>
      ) : null}
    </div>
  );
}

type BadgeProps = Pick<
  MatchCardProps,
  'match' | 'locked' | 'dayStatus' | 'saved' | 'current' | 'check' | 'dirty'
>;

function stateBadge({ match, locked, dayStatus, saved, current, check, dirty }: BadgeProps) {
  if (match.status === 'void' || dayStatus === 'published' || dayStatus === 'cancelled') {
    return null;
  }
  if (locked) {
    // The header already says "Locked"; only a missed match needs saying again.
    return saved ? null : <Badge variant="destructive">Missed</Badge>;
  }
  if (dirty) {
    return check && !check.ok ? (
      <Badge variant="destructive">Needs fixing</Badge>
    ) : (
      <Badge variant="default">Unsaved changes</Badge>
    );
  }
  if (saved) {
    return (
      <Badge variant="success">
        <CheckIcon aria-hidden />
        Saved
      </Badge>
    );
  }
  return current ? null : <Badge>Not picked</Badge>;
}

function CardState(props: BadgeProps & Pick<MatchCardProps, 'onUndo'>) {
  const { locked, saved, dirty, onUndo } = props;
  const badge: ReactNode = stateBadge(props);
  const canUndo = !locked && dirty;
  if (!badge && !canUndo) return null;
  return (
    <div className="flex min-h-8 items-center justify-between gap-2">
      <span>{badge}</span>
      {canUndo ? (
        <button
          type="button"
          onClick={onUndo}
          className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-4"
        >
          <Undo2Icon aria-hidden className="size-3.5" />
          {saved ? 'Undo changes' : 'Clear'}
        </button>
      ) : null}
    </div>
  );
}

/** What a folded card shows: the pick (and result) in one line, with its state. */
function FoldedSummary(props: BadgeProps & { scoring: ScoringConfig; names: TeamNames }) {
  const { match, locked, dayStatus, saved, check, dirty, scoring, names } = props;
  const pickText = (sets: readonly { home: number; away: number }[]) => {
    const homeSets = sets.filter((set) => set.home > set.away).length;
    const text = `${majorLabel({ homeSets, awaySets: sets.length - homeSets }, names)} · ${formatSets(sets)}`;
    // Word joiners around each dash: a long pick wraps between scores, never inside "25–20".
    return text.replaceAll('–', '\u2060–\u2060');
  };

  // A plain hint when there's nothing to show yet, otherwise "Your pick: …".
  let hint: string | null = null;
  let pick: string | null = null;
  if (dayStatus === 'published') hint = 'You can pick once the day opens.';
  else if (!locked && dirty) {
    if (check?.ok) pick = pickText(check.sets);
    else hint = 'Your pick needs fixing. Tap to open it.';
  } else if (saved) pick = pickText(saved.sets);
  else if (locked) pick = 'No pick';
  else hint = 'Tap to make your pick.';

  const points = pointsFor(match, saved, scoring);
  const badge =
    locked && saved && points !== null ? (
      saved.counts ? (
        <Badge variant="success">
          <CheckIcon aria-hidden />
          {points} {points === 1 ? 'pt' : 'pts'}
        </Badge>
      ) : (
        <Badge>Doesn&apos;t count</Badge>
      )
    ) : (
      stateBadge(props)
    );

  // Spans only: the summary sits inside the card's toggle button.
  return (
    <span className="flex w-full items-start justify-between gap-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        {pick !== null ? (
          <span className="font-mono text-xs font-bold break-words">
            <span className="font-sans font-normal text-muted-foreground">Your pick: </span>
            {pick}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">{hint}</span>
        )}
        {match.result ? (
          <span className="font-mono text-xs break-words">
            <span className="font-sans text-muted-foreground">Result: </span>
            {pickText(match.result.sets)}
          </span>
        ) : null}
      </span>
      {badge ? <span className="shrink-0">{badge}</span> : null}
    </span>
  );
}

/** One match: pick the set score and the points in every set, or see the locked pick. */
export function MatchCard(props: MatchCardProps) {
  const {
    match,
    format,
    scoring,
    now,
    locked,
    dayStatus,
    saved,
    current,
    check,
    rejection,
    expanded,
  } = props;
  const headingId = useId();
  const bodyId = useId();
  const names: TeamNames = { home: match.home.shortName, away: match.away.shortName };
  const fullNames: TeamNames = { home: match.home.name, away: match.away.name };
  const selected = current ? { homeSets: current.homeSets, awaySets: current.awaySets } : null;
  const score = match.result ? formatScore(match.result.homeSets, match.result.awaySets) : 'vs';

  return (
    <article
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-lg bg-card p-4 shadow-card sm:p-5',
        !expanded && 'gap-3',
        props.dirty && !locked && 'ring-2 ring-sg-night/80',
      )}
    >
      <h3 id={headingId}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? bodyId : undefined}
          onClick={props.onToggle}
          className={cn(
            'flex w-full flex-col rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60',
            expanded ? 'gap-4' : 'gap-3',
          )}
        >
          <span className="flex w-full items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <Badge>{CATEGORY_LABELS[match.category]}</Badge>
              <time dateTime={match.scheduledAt} className="font-mono text-xs font-bold">
                {formatTime(match.scheduledAt)}
              </time>
            </span>
            <span className="flex items-center gap-2">
              <LockInfo match={match} locked={locked} dayStatus={dayStatus} now={now} />
              <ChevronDownIcon
                aria-hidden
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  expanded && 'rotate-180',
                )}
              />
            </span>
          </span>
          {expanded ? (
            <span className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
              <TeamColumn team={match.home} />
              <span className="self-center font-mono text-xs font-bold text-muted-foreground">
                {score}
              </span>
              <TeamColumn team={match.away} />
            </span>
          ) : (
            <span className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <TeamLogo team={match.home} size="sm" />
                <span className="truncate text-sm font-extrabold">{match.home.name}</span>
              </span>
              <span className="font-mono text-xs font-bold text-muted-foreground">{score}</span>
              <span className="flex min-w-0 items-center justify-end gap-2">
                <span className="truncate text-right text-sm font-extrabold">
                  {match.away.name}
                </span>
                <TeamLogo team={match.away} size="sm" />
              </span>
            </span>
          )}
          {expanded ? null : (
            <FoldedSummary
              match={match}
              locked={locked}
              dayStatus={dayStatus}
              saved={saved}
              current={current}
              check={check}
              dirty={props.dirty}
              scoring={scoring}
              names={names}
            />
          )}
        </button>
      </h3>

      {expanded ? (
        <div id={bodyId} className="flex flex-col gap-4">
          {locked ? (
            <ReadOnlyPick
              match={match}
              saved={saved}
              names={names}
              scoring={scoring}
              dayStatus={dayStatus}
              entryConfirmed={props.entryConfirmed}
            />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">Who wins, and in how many sets?</p>
                <MajorChips
                  format={format}
                  names={names}
                  fullNames={fullNames}
                  selected={selected}
                  onPick={props.onPickMajor}
                />
              </div>
              {current ? (
                <SetRows
                  draft={current}
                  format={format}
                  names={names}
                  fullNames={fullNames}
                  onSetWinner={props.onSetWinner}
                  onLoserChange={props.onLoserChange}
                />
              ) : null}
              {check && !check.ok ? (
                <ul className="flex flex-col gap-1 text-xs text-destructive">
                  {check.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}

          {rejection ? <Alert variant="destructive">{rejection.message}</Alert> : null}

          <CardState
            match={match}
            locked={locked}
            dayStatus={dayStatus}
            saved={saved}
            current={current}
            check={check}
            dirty={props.dirty}
            onUndo={props.onUndo}
          />
        </div>
      ) : null}

      {/* Always mounted (and out of the layout), so screen readers hear problems as they appear. */}
      <p className="sr-only" aria-live="polite">
        {!locked && check && !check.ok ? check.issues.join(' ') : ''}
      </p>
    </article>
  );
}
