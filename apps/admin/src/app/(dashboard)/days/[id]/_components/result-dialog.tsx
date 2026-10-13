'use client';

import type { MatchFormat } from '@predict/contracts';
import {
  buildSetLine,
  defaultSetWinners,
  isValidSetWinners,
  majorOutcomes,
  targetForSet,
  validateSetLine,
  winnerPoints,
  type MajorScore,
  type SetScore,
  type Side,
} from '@predict/domain';
import { Button } from '@predict/ui/button';
import { ChoiceChips } from '@predict/ui/choice-chips';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Textarea } from '@predict/ui/textarea';
import { cn } from '@predict/ui/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { WholeInput } from '@/components/inputs';
import { Callout } from '@/components/ui/callout';
import { DialogForm } from '@/components/ui/dialog-form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { parseWhole } from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { AdminDay, DayMatch } from '@/lib/types';
import { useApplyDay } from './day-actions';
import { setLine } from './matches-tab';

type Mode = 'standard' | 'custom';

interface StandardDraft {
  major: MajorScore | null;
  winners: Side[];
  loser: string[];
}

type CustomDraft = { home: string; away: string }[];

const majorKey = (major: MajorScore) => `${major.homeSets}-${major.awaySets}`;

/** Splits known sets into the standard editor when they follow the set rules, else custom. */
function draftFromSets(sets: SetScore[] | null, format: MatchFormat) {
  const custom: CustomDraft =
    sets && sets.length > 0
      ? sets.map((set) => ({ home: String(set.home), away: String(set.away) }))
      : Array.from({ length: Math.ceil(format.bestOf / 2) }, () => ({ home: '', away: '' }));
  const empty = {
    mode: 'standard' as Mode,
    standard: { major: null, winners: [], loser: [] },
    custom,
  };
  if (!sets || sets.length === 0) return empty;

  const winners: Side[] = [];
  const loser: string[] = [];
  for (const [index, set] of sets.entries()) {
    if (set.home === set.away) return { ...empty, mode: 'custom' as Mode };
    const lost = Math.min(set.home, set.away);
    if (Math.max(set.home, set.away) !== winnerPoints(lost, targetForSet(index, format))) {
      return { ...empty, mode: 'custom' as Mode };
    }
    winners.push(set.home > set.away ? 'home' : 'away');
    loser.push(String(lost));
  }
  const major = {
    homeSets: winners.filter((side) => side === 'home').length,
    awaySets: winners.filter((side) => side === 'away').length,
  };
  if (!isValidSetWinners(winners, major, format)) return { ...empty, mode: 'custom' as Mode };
  return { mode: 'standard' as Mode, standard: { major, winners, loser }, custom };
}

export function ResultDialog({
  day,
  match,
  prefill,
  correcting,
  trigger,
}: {
  day: AdminDay;
  match: DayMatch;
  /** Sets to start from (the latest entered result), if any. */
  prefill: SetScore[] | null;
  /** A confirmed result exists: replacing it needs a reason (super admins). */
  correcting: boolean;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <ResultForm
          day={day}
          match={match}
          prefill={prefill}
          correcting={correcting}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ResultForm({
  day,
  match,
  prefill,
  correcting,
  onDone,
}: {
  day: AdminDay;
  match: DayMatch;
  prefill: SetScore[] | null;
  correcting: boolean;
  onDone: () => void;
}) {
  const format = day.config.format;
  const queryClient = useQueryClient();
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const [initial] = useState(() => draftFromSets(prefill, format));
  const [mode, setMode] = useState<Mode>(initial.mode);
  const [standard, setStandard] = useState<StandardDraft>(initial.standard);
  const [custom, setCustom] = useState<CustomDraft>(initial.custom);
  const [nonStandardReason, setNonStandardReason] = useState('');
  const [note, setNote] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  const enter = useMutation(
    api.admin.results.enter.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        void invalidate(queryClient, api.admin.results.key());
        toast({
          title: 'Result entered',
          description: 'Confirm it to make it count on the leaderboard.',
        });
        onDone();
      },
    }),
  );

  const home = match.home;
  const away = match.away;
  const outcomes = majorOutcomes(format);

  // Standard mode: winners + loser points → full set line.
  const loserPoints = standard.loser.map((text) => parseWhole(text, 0, 99));
  const winnersOk = standard.major
    ? isValidSetWinners(standard.winners, standard.major, format)
    : false;
  const standardSets =
    standard.major && winnersOk && loserPoints.every((points) => points !== null)
      ? buildSetLine(standard.winners, loserPoints as number[], format)
      : null;

  // Custom mode: every number typed.
  const customParsed = custom.map((set) => ({
    home: parseWhole(set.home, 0, 99),
    away: parseWhole(set.away, 0, 99),
  }));
  const customComplete = customParsed.every((set) => set.home !== null && set.away !== null);
  const customSets = customComplete ? (customParsed as SetScore[]) : null;
  const customHomeSets = customSets?.filter((set) => set.home > set.away).length ?? 0;
  const customAwaySets = customSets?.filter((set) => set.away > set.home).length ?? 0;
  const customValidation = customSets ? validateSetLine(customSets, format) : null;
  const customBreaksRules = customValidation !== null && !customValidation.ok;
  const customHasWinner = customSets !== null && customHomeSets !== customAwaySets;

  const sets = mode === 'standard' ? standardSets : customSets;
  const totals = sets
    ? {
        home: sets.filter((set) => set.home > set.away).length,
        away: sets.filter((set) => set.away > set.home).length,
      }
    : null;

  const reasonsOk =
    (!correcting || correctionReason.trim().length >= 3) &&
    (mode === 'standard' || !customBreaksRules || nonStandardReason.trim().length >= 3);
  const canSubmit = sets !== null && reasonsOk && (mode === 'standard' || customHasWinner);

  function pickMajor(key: string) {
    const major = outcomes.find((outcome) => majorKey(outcome) === key);
    if (!major) return;
    enter.reset();
    const total = major.homeSets + major.awaySets;
    setStandard((current) => ({
      major,
      winners: defaultSetWinners(major),
      loser: Array.from({ length: total }, (_, index) => current.loser[index] ?? ''),
    }));
  }

  function setWinner(index: number, side: Side) {
    setStandard((current) => ({
      ...current,
      winners: current.winners.map((winner, at) => (at === index ? side : winner)),
    }));
  }

  const homeWins = outcomes.filter((outcome) => outcome.homeSets > outcome.awaySets);
  const awayWins = outcomes.filter((outcome) => outcome.awaySets > outcome.homeSets);
  const chipLabel = (outcome: MajorScore) => `${outcome.homeSets}–${outcome.awaySets}`;
  const selectedKey = standard.major ? [majorKey(standard.major)] : [];

  return (
    <DialogForm
      title={correcting ? 'Correct the result' : 'Enter the result'}
      description={`${home.name} v ${away.name} · best of ${format.bestOf}. Use the league's official result.`}
      submitLabel={correcting ? 'Enter correction' : 'Enter result'}
      pendingLabel="Saving…"
      pending={enter.isPending}
      canSubmit={canSubmit}
      error={enter.error}
      onSubmit={() => {
        if (!sets) return;
        enter.mutate({
          id: match.id,
          sets,
          nonStandardReason:
            mode === 'custom' && customBreaksRules ? nonStandardReason.trim() : undefined,
          note: note.trim() || undefined,
          correctionReason: correcting ? correctionReason.trim() : undefined,
        });
      }}
    >
      <div
        className="inline-flex w-fit gap-1 rounded-full bg-muted p-1"
        role="group"
        aria-label="Entry mode"
      >
        {(['standard', 'custom'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={mode === item}
            onClick={() => {
              // Carry a finished set-by-set score over into an untouched custom grid.
              if (
                item === 'custom' &&
                standardSets &&
                custom.every((set) => set.home === '' && set.away === '')
              ) {
                setCustom(
                  standardSets.map((set) => ({ home: String(set.home), away: String(set.away) })),
                );
              }
              setMode(item);
              enter.reset();
            }}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-semibold text-muted-foreground',
              mode === item && 'bg-background text-foreground shadow-card',
            )}
          >
            {item === 'standard' ? 'Set by set' : 'Custom score'}
          </button>
        ))}
      </div>

      {mode === 'standard' ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{home.name} won</span>
              <ChoiceChips
                label={`${home.name} won`}
                options={homeWins.map((outcome) => ({
                  value: majorKey(outcome),
                  label: chipLabel(outcome),
                }))}
                value={selectedKey}
                onChange={pickMajor}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">{away.name} won</span>
              <ChoiceChips
                label={`${away.name} won`}
                options={awayWins.map((outcome) => ({
                  value: majorKey(outcome),
                  label: chipLabel(outcome),
                }))}
                value={selectedKey}
                onChange={pickMajor}
              />
            </div>
          </div>

          {standard.major ? (
            <ol className="flex flex-col gap-2">
              {standard.winners.map((winner, index) => {
                const lost = loserPoints[index];
                const target = targetForSet(index, format);
                const won = lost === null || lost === undefined ? null : winnerPoints(lost, target);
                const score =
                  won === null || lost === null || lost === undefined
                    ? null
                    : winner === 'home'
                      ? `${won}–${lost}`
                      : `${lost}–${won}`;
                return (
                  <li
                    key={index}
                    className="flex flex-wrap items-center gap-2 rounded-sm bg-muted/60 p-2"
                  >
                    <span className="flex w-14 flex-col">
                      <span className="text-sm font-bold">Set {index + 1}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        to {target}
                      </span>
                    </span>
                    <span
                      className="order-last flex w-full gap-1 sm:order-none sm:w-auto sm:flex-1"
                      role="group"
                      aria-label={`Set ${index + 1} winner`}
                    >
                      {(['home', 'away'] as const).map((side) => (
                        <button
                          key={side}
                          type="button"
                          aria-pressed={winner === side}
                          onClick={() => setWinner(index, side)}
                          className={cn(
                            'min-w-0 flex-1 truncate rounded-full border px-2 py-1 font-mono text-xs font-bold',
                            winner === side
                              ? 'border-sg-night bg-sg-night text-sg-flash'
                              : 'border-sg-night/15 bg-background',
                          )}
                        >
                          {side === 'home' ? home.shortName : away.shortName}
                        </button>
                      ))}
                    </span>
                    <WholeInput
                      aria-label={`Set ${index + 1}: points of the team that lost the set`}
                      placeholder="Loser"
                      value={standard.loser[index] ?? ''}
                      onChange={(event) =>
                        setStandard((current) => ({
                          ...current,
                          loser: current.loser.map((text, at) =>
                            at === index ? event.target.value : text,
                          ),
                        }))
                      }
                      className="h-9 w-20 px-2 text-center"
                    />
                    <span
                      className="ml-auto w-16 text-right font-mono text-sm font-bold"
                      aria-live="polite"
                    >
                      {score ?? '—'}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Pick the final set score first.</p>
          )}
          {standard.major && !winnersOk ? (
            <Callout variant="danger">
              These set winners don&apos;t give {chipLabel(standard.major)}: the match must only be
              decided in the last set.
            </Callout>
          ) : null}
          {standard.major ? (
            <p className="text-xs text-muted-foreground">
              Tap who won each set and type the loser&apos;s points. The winner&apos;s points fill
              in: the target, or 2 more than the loser in a close set.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ol className="flex flex-col gap-2">
            {custom.map((set, index) => (
              <li
                key={index}
                className="grid grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"
              >
                <span className="text-sm font-bold">Set {index + 1}</span>
                <WholeInput
                  aria-label={`Set ${index + 1}: ${home.name} points`}
                  placeholder={home.shortName}
                  value={set.home}
                  onChange={(event) =>
                    setCustom((current) =>
                      current.map((item, at) =>
                        at === index ? { ...item, home: event.target.value } : item,
                      ),
                    )
                  }
                  className="text-center"
                />
                <WholeInput
                  aria-label={`Set ${index + 1}: ${away.name} points`}
                  placeholder={away.shortName}
                  value={set.away}
                  onChange={(event) =>
                    setCustom((current) =>
                      current.map((item, at) =>
                        at === index ? { ...item, away: event.target.value } : item,
                      ),
                    )
                  }
                  className="text-center"
                />
              </li>
            ))}
          </ol>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={custom.length >= format.bestOf}
              onClick={() => setCustom((current) => [...current, { home: '', away: '' }])}
            >
              <Plus aria-hidden />
              Add set
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={custom.length <= 1}
              onClick={() => setCustom((current) => current.slice(0, -1))}
            >
              <Minus aria-hidden />
              Remove last set
            </Button>
          </div>
          {customSets && !customHasWinner ? (
            <Callout variant="danger">
              A result needs a winner: one team must win more sets.
            </Callout>
          ) : null}
          {customValidation && !customValidation.ok ? (
            <Callout
              variant="warning"
              title="This breaks the normal set rules"
              items={customValidation.issues.map((issue) => issue.message)}
            />
          ) : null}
          <Field
            label="Why this score is unusual"
            hint={
              customBreaksRules
                ? 'Required, e.g. "Forfeit: awarded 25–0 in each set" or "Retired injured in set 4".'
                : 'Only needed when the score breaks the normal set rules.'
            }
          >
            <Textarea
              value={nonStandardReason}
              maxLength={300}
              className="min-h-16"
              onChange={(event) => setNonStandardReason(event.target.value)}
            />
          </Field>
        </div>
      )}

      {sets && totals ? (
        <div className="rounded-sm bg-sg-night px-4 py-3 text-white">
          <p className="font-mono text-[10px] tracking-[2px] text-white/60 uppercase">Result</p>
          <p className="text-lg font-black">
            {home.shortName} {totals.home}–{totals.away} {away.shortName}
          </p>
          <p className="font-mono text-xs text-white/80">{setLine(sets)}</p>
        </div>
      ) : null}

      <Field label="Note" hint="Optional, e.g. where the result came from.">
        <Textarea
          value={note}
          maxLength={300}
          className="min-h-16"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      {correcting ? (
        <Field
          label="Why it's being corrected"
          hint="Required: this replaces a confirmed result. At least 3 characters, saved in the audit log."
        >
          <Textarea
            value={correctionReason}
            maxLength={500}
            className="min-h-16"
            onChange={(event) => setCorrectionReason(event.target.value)}
          />
        </Field>
      ) : null}
    </DialogForm>
  );
}
