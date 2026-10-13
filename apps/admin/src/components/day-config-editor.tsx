'use client';

import { DayConfig, TIE_BREAKER_LABELS, type TieBreaker } from '@predict/contracts';
import {
  computePool,
  DEFAULT_PRIZE_TIERS_BPS,
  MAX_PRIZE_PLACES,
  maxPointsPerMatch,
  ordinal,
  placeAmounts,
  validatePrizeTiers,
} from '@predict/domain';
import { Button } from '@predict/ui/button';
import { Field } from '@predict/ui/field';
import { Select } from '@predict/ui/select';
import { cn } from '@predict/ui/utils';
import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { ErrorAlert } from '@/components/error-alert';
import { NairaInput, PercentInput, WholeInput } from '@/components/inputs';
import { Callout } from '@/components/ui/callout';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DragHandle,
  MoveButtons,
  moveItem,
  SortableList,
  useSortableRow,
} from '@/components/ui/sortable';
import { Kicker } from '@/components/ui/stat';
import { SwitchField } from '@/components/ui/switch';
import {
  bpsToPercentInput,
  formatBps,
  formatNaira,
  koboToInput,
  parseNaira,
  parseWhole,
  percentInputToBps,
} from '@/lib/format';

const ALL_TIE_BREAKERS: TieBreaker[] = ['closeness', 'exactScores', 'correctWinners'];
const EXAMPLE_PLAYERS = 100;

interface Draft {
  entryFee: string;
  prizePercent: string;
  jackpotPercent: string;
  tiers: string[];
  winner: string;
  setCount: string;
  exactScore: string;
  bonusNeedsWinner: boolean;
  bestOf: 3 | 5;
  setTarget: string;
  decidingSetTarget: string;
  tieBreakers: { id: TieBreaker; used: boolean }[];
  lockLeadMin: string;
  minScoredMatches: string;
}

type DraftErrors = Partial<
  Record<
    | 'entryFee'
    | 'prizePercent'
    | 'jackpotPercent'
    | 'winner'
    | 'setCount'
    | 'exactScore'
    | 'setTarget'
    | 'decidingSetTarget'
    | 'lockLeadMin'
    | 'minScoredMatches',
    string
  >
>;

interface Parsed {
  config: DayConfig | null;
  errors: DraftErrors;
  tierErrors: (string | null)[];
  tierProblems: string[];
  tiersBps: (number | null)[];
  schemaProblems: string[];
}

function toDraft(config: DayConfig): Draft {
  const used = config.tieBreakers.filter((id) => ALL_TIE_BREAKERS.includes(id));
  return {
    entryFee: koboToInput(config.entryFeeKobo),
    prizePercent: bpsToPercentInput(config.prizeBps),
    jackpotPercent: bpsToPercentInput(config.jackpotBps),
    tiers: config.prizeTiersBps.map(bpsToPercentInput),
    winner: String(config.scoring.winner),
    setCount: String(config.scoring.setCount),
    exactScore: String(config.scoring.exactScore),
    bonusNeedsWinner: config.scoring.bonusNeedsWinner,
    bestOf: config.format.bestOf,
    setTarget: String(config.format.setTarget),
    decidingSetTarget: String(config.format.decidingSetTarget),
    tieBreakers: [
      ...used.map((id) => ({ id, used: true })),
      ...ALL_TIE_BREAKERS.filter((id) => !used.includes(id)).map((id) => ({ id, used: false })),
    ],
    lockLeadMin: String(config.lockLeadMin),
    minScoredMatches: config.minScoredMatches === null ? '' : String(config.minScoredMatches),
  };
}

const PERCENT_ERROR = 'Use a percentage from 0 to 100 (up to 2 decimals).';

function parseDraft(draft: Draft): Parsed {
  const errors: DraftErrors = {};
  const fee = parseNaira(draft.entryFee, { min: 100 });
  if (fee.error) errors.entryFee = fee.error;
  const prizeBps = percentInputToBps(draft.prizePercent);
  if (prizeBps === null) errors.prizePercent = PERCENT_ERROR;
  const jackpotBps = percentInputToBps(draft.jackpotPercent);
  if (jackpotBps === null) errors.jackpotPercent = PERCENT_ERROR;

  const tiersBps = draft.tiers.map((text) => percentInputToBps(text));
  const tierErrors = tiersBps.map((bps) =>
    bps === null ? PERCENT_ERROR : bps === 0 ? 'Every paid place needs more than 0%.' : null,
  );
  const tierProblems =
    draft.tiers.length === 0
      ? ['Add at least one prize place.']
      : tierErrors.every((error) => error === null)
        ? validatePrizeTiers(tiersBps as number[])
        : [];

  const whole = (key: keyof DraftErrors, text: string, min: number, max: number) => {
    const value = parseWhole(text, min, max);
    if (value === null) errors[key] = `Use a whole number from ${min} to ${max}.`;
    return value;
  };
  const winner = whole('winner', draft.winner, 0, 100);
  const setCount = whole('setCount', draft.setCount, 0, 100);
  const exactScore = whole('exactScore', draft.exactScore, 0, 100);
  const setTarget = whole('setTarget', draft.setTarget, 5, 50);
  const decidingSetTarget = whole('decidingSetTarget', draft.decidingSetTarget, 5, 50);
  const lockLeadMin = whole('lockLeadMin', draft.lockLeadMin, 0, 240);
  const minScoredMatches =
    draft.minScoredMatches.trim() === ''
      ? null
      : whole('minScoredMatches', draft.minScoredMatches, 1, 50);

  const tiersOk = tierErrors.every((error) => error === null) && tierProblems.length === 0;
  if (
    Object.keys(errors).length > 0 ||
    !tiersOk ||
    fee.kobo === null ||
    prizeBps === null ||
    jackpotBps === null ||
    winner === null ||
    setCount === null ||
    exactScore === null ||
    setTarget === null ||
    decidingSetTarget === null ||
    lockLeadMin === null
  ) {
    return { config: null, errors, tierErrors, tierProblems, tiersBps, schemaProblems: [] };
  }

  const candidate: DayConfig = {
    entryFeeKobo: fee.kobo,
    prizeBps,
    jackpotBps,
    prizeTiersBps: tiersBps as number[],
    scoring: { winner, setCount, exactScore, bonusNeedsWinner: draft.bonusNeedsWinner },
    format: { bestOf: draft.bestOf, setTarget, decidingSetTarget },
    tieBreakers: draft.tieBreakers.filter((item) => item.used).map((item) => item.id),
    lockLeadMin,
    minScoredMatches,
  };
  const checked = DayConfig.safeParse(candidate);
  if (!checked.success) {
    return {
      config: null,
      errors,
      tierErrors,
      tierProblems,
      tiersBps,
      schemaProblems: checked.error.issues.map((issue) => issue.message),
    };
  }
  return { config: checked.data, errors, tierErrors, tierProblems, tiersBps, schemaProblems: [] };
}

/** Even split in basis points; leftover goes to the top places so it never increases. */
function evenSplit(places: number): string[] {
  const base = Math.floor(10_000 / places);
  const extra = 10_000 - base * places;
  return Array.from({ length: places }, (_, index) =>
    bpsToPercentInput(base + (index < extra ? 1 : 0)),
  );
}

/** The scores one match can give, e.g. "0, 3, 5 or 7". */
function possibleScores(winner: number, setCount: number, exact: number, needsWinner: boolean) {
  const values = new Set([0, winner, winner + setCount, winner + setCount + exact]);
  if (!needsWinner) values.add(setCount);
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 1
    ? String(sorted[0])
    : `${sorted.slice(0, -1).join(', ')} or ${sorted[sorted.length - 1]}`;
}

const configKey = (config: DayConfig) => JSON.stringify(config);

interface DayConfigEditorProps {
  /** The saved settings (the form resets whenever they change). */
  value: DayConfig;
  /** Saves the edited settings; resolve on success, reject to show the API error. */
  onSave: (config: DayConfig) => Promise<unknown>;
  saveLabel?: string;
  /** Number of matches on the day, to check the minimum played matches. */
  matchCount?: number;
  /** Shown above the save button (e.g. "Applies to days created from now on"). */
  footnote?: ReactNode;
}

/**
 * Edits everything that decides money and ranking for a match-day (or a league's / the app's
 * defaults) and produces a validated `DayConfig`.
 */
export function DayConfigEditor(props: DayConfigEditorProps) {
  return <DayConfigForm key={configKey(props.value)} {...props} />;
}

function DayConfigForm({
  value,
  onSave,
  saveLabel = 'Save settings',
  matchCount,
  footnote,
}: DayConfigEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const parsed = parseDraft(draft);
  const dirty = parsed.config ? configKey(parsed.config) !== configKey(value) : true;
  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  async function save() {
    if (!parsed.config) return;
    setPending(true);
    setError(null);
    try {
      await onSave(parsed.config);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const fee = parseNaira(draft.entryFee, { min: 100 }).kobo;
  const prizeBps = percentInputToBps(draft.prizePercent);
  const jackpotBps = percentInputToBps(draft.jackpotPercent);
  const example =
    fee !== null && prizeBps !== null && jackpotBps !== null
      ? computePool({
          confirmedCount: EXAMPLE_PLAYERS,
          entryFeeKobo: fee,
          prizeBps,
          jackpotBps,
          contributionsKobo: 0,
        })
      : null;
  const tiersValid =
    parsed.tierErrors.every((tierError) => tierError === null) && parsed.tierProblems.length === 0;
  const exampleAmounts =
    example && tiersValid
      ? placeAmounts(example.dailyPoolKobo, parsed.tiersBps as number[], EXAMPLE_PLAYERS)
      : null;
  const tierTotal = parsed.tiersBps.reduce<number>((sum, bps) => sum + (bps ?? 0), 0);
  const minMatches = parseWhole(draft.minScoredMatches, 1, 50);

  const winnerPts = parseWhole(draft.winner, 0, 100);
  const setCountPts = parseWhole(draft.setCount, 0, 100);
  const exactPts = parseWhole(draft.exactScore, 0, 100);
  const scoring =
    winnerPts !== null && setCountPts !== null && exactPts !== null
      ? {
          winner: winnerPts,
          setCount: setCountPts,
          exactScore: exactPts,
          bonusNeedsWinner: draft.bonusNeedsWinner,
        }
      : null;

  const moveTieBreaker = (from: number, to: number) =>
    update({ tieBreakers: moveItem(draft.tieBreakers, from, to) });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed.config && dirty && !pending) void save();
      }}
    >
      <EditorSection title="Entry fee and prize money">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Entry fee" error={parsed.errors.entryFee}>
            <NairaInput
              value={draft.entryFee}
              onChange={(event) => update({ entryFee: event.target.value })}
            />
          </Field>
          <Field
            label="Prize money"
            hint="Share of entry fees paid out. The rest covers operations."
            error={parsed.errors.prizePercent}
          >
            <PercentInput
              value={draft.prizePercent}
              onChange={(event) => update({ prizePercent: event.target.value })}
            />
          </Field>
          <Field
            label="To the league jackpot"
            hint="Share of the prize money set aside for the jackpot."
            error={parsed.errors.jackpotPercent}
          >
            <PercentInput
              value={draft.jackpotPercent}
              onChange={(event) => update({ jackpotPercent: event.target.value })}
            />
          </Field>
        </div>
        {example ? (
          <p className="rounded-sm bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            With {EXAMPLE_PLAYERS} players: <Money>{formatNaira(example.revenueKobo)}</Money> in
            fees → <Money>{formatNaira(example.participantShareKobo)}</Money> prize money (
            <Money>{formatNaira(example.operationsKobo)}</Money> operations) →{' '}
            <Money>{formatNaira(example.jackpotCutKobo)}</Money> to the jackpot →{' '}
            <Money strong>{formatNaira(example.dailyPoolKobo)}</Money> for the day&apos;s winners.
          </p>
        ) : null}
      </EditorSection>

      <EditorSection
        title="Prize split"
        description="Percent of the day's pool per place. Lower places can never get more than higher places."
        actions={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => update({ tiers: DEFAULT_PRIZE_TIERS_BPS.map(bpsToPercentInput) })}
            >
              <RotateCcw aria-hidden />
              Default top 10
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={draft.tiers.length === 0}
              onClick={() => update({ tiers: evenSplit(draft.tiers.length) })}
            >
              Split evenly
            </Button>
          </>
        }
      >
        <ol className="flex flex-col gap-2">
          {draft.tiers.map((tier, index) => (
            <li key={index} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-sm font-bold">
                  {ordinal(index + 1)}
                </span>
                <PercentInput
                  aria-label={`${ordinal(index + 1)} place share`}
                  aria-invalid={parsed.tierErrors[index] ? true : undefined}
                  className="w-28"
                  value={tier}
                  onChange={(event) =>
                    update({
                      tiers: draft.tiers.map((item, at) =>
                        at === index ? event.target.value : item,
                      ),
                    })
                  }
                />
                <span className="min-w-0 flex-1 truncate text-right font-mono text-xs text-muted-foreground sm:text-left">
                  {exampleAmounts?.[index] !== undefined ? formatNaira(exampleAmounts[index]) : ''}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${ordinal(index + 1)} place`}
                  disabled={draft.tiers.length === 1}
                  onClick={() => update({ tiers: draft.tiers.filter((_, at) => at !== index) })}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {parsed.tierErrors[index] ? (
                <p className="pl-14 text-xs text-destructive">{parsed.tierErrors[index]}</p>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={draft.tiers.length >= MAX_PRIZE_PLACES}
            onClick={() =>
              update({ tiers: [...draft.tiers, draft.tiers[draft.tiers.length - 1] ?? '100'] })
            }
          >
            <Plus aria-hidden />
            Add place
          </Button>
          <p
            className={cn(
              'font-mono text-sm font-bold',
              tierTotal === 10_000 ? 'text-success' : 'text-destructive',
            )}
            aria-live="polite"
          >
            Total {formatBps(tierTotal)}
          </p>
        </div>
        {parsed.tierProblems.length > 0 ? (
          <Callout variant="danger" items={parsed.tierProblems} />
        ) : null}
        {exampleAmounts ? (
          <p className="text-xs text-muted-foreground">
            Amounts are for a {EXAMPLE_PLAYERS}-player day. With fewer players than places, unused
            shares are spread over the places that have winners.
          </p>
        ) : null}
      </EditorSection>

      <EditorSection
        title="Scoring"
        description={
          scoring
            ? `A match scores ${possibleScores(scoring.winner, scoring.setCount, scoring.exactScore, scoring.bonusNeedsWinner)} points (at most ${maxPointsPerMatch(scoring)}).`
            : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Correct winner" error={parsed.errors.winner}>
            <WholeInput
              value={draft.winner}
              onChange={(event) => update({ winner: event.target.value })}
            />
          </Field>
          <Field label="Right number of sets" error={parsed.errors.setCount}>
            <WholeInput
              value={draft.setCount}
              onChange={(event) => update({ setCount: event.target.value })}
            />
          </Field>
          <Field label="Exact set score" error={parsed.errors.exactScore}>
            <WholeInput
              value={draft.exactScore}
              onChange={(event) => update({ exactScore: event.target.value })}
            />
          </Field>
        </div>
        <SwitchField
          label="Bonuses need the right winner"
          description="When on, the sets and exact-score bonuses only count if the winner is right."
          checked={draft.bonusNeedsWinner}
          onCheckedChange={(checked) => update({ bonusNeedsWinner: checked })}
        />
      </EditorSection>

      <EditorSection
        title="Breaking ties"
        description="Points always come first. Then these, in order. Players still tied share the prize money of the places they occupy."
      >
        <SortableList ids={draft.tieBreakers.map((item) => item.id)} onMove={moveTieBreaker}>
          <ol className="flex flex-col gap-2">
            {draft.tieBreakers.map((item, index) => (
              <TieBreakerRow
                key={item.id}
                id={item.id}
                index={index}
                count={draft.tieBreakers.length}
                used={item.used}
                onMove={moveTieBreaker}
                onToggle={(used) =>
                  update({
                    tieBreakers: draft.tieBreakers.map((other) =>
                      other.id === item.id ? { ...other, used } : other,
                    ),
                  })
                }
              />
            ))}
          </ol>
        </SortableList>
      </EditorSection>

      <EditorSection title="Locks and minimum matches">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Lock picks before each match (minutes)"
            hint="0 locks each match at its scheduled start."
            error={parsed.errors.lockLeadMin}
          >
            <WholeInput
              value={draft.lockLeadMin}
              onChange={(event) => update({ lockLeadMin: event.target.value })}
            />
          </Field>
          <Field
            label="Minimum played matches"
            hint={
              matchCount !== undefined && minMatches !== null && minMatches > matchCount
                ? `Higher than the ${matchCount} matches on this day: the day couldn't open.`
                : "Leave blank for half the day's matches (fixed when the day opens). Fewer played matches cancels the day with full refunds."
            }
            error={parsed.errors.minScoredMatches}
          >
            <WholeInput
              placeholder="Half the matches"
              value={draft.minScoredMatches}
              onChange={(event) => update({ minScoredMatches: event.target.value })}
            />
          </Field>
        </div>
      </EditorSection>

      <details className="group rounded-sm border border-border px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold select-none">
          Match format{' '}
          <span className="font-normal text-muted-foreground">
            · best of {draft.bestOf}, sets to {draft.setTarget || '?'}, deciding set to{' '}
            {draft.decidingSetTarget || '?'}
          </span>
        </summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Best of">
            <Select
              value={String(draft.bestOf)}
              onChange={(event) => update({ bestOf: event.target.value === '3' ? 3 : 5 })}
            >
              <option value="5">5 sets (first to 3)</option>
              <option value="3">3 sets (first to 2)</option>
            </Select>
          </Field>
          <Field label="Points per set" error={parsed.errors.setTarget}>
            <WholeInput
              value={draft.setTarget}
              onChange={(event) => update({ setTarget: event.target.value })}
            />
          </Field>
          <Field label="Points in the deciding set" error={parsed.errors.decidingSetTarget}>
            <WholeInput
              value={draft.decidingSetTarget}
              onChange={(event) => update({ decidingSetTarget: event.target.value })}
            />
          </Field>
        </div>
      </details>

      {parsed.schemaProblems.length > 0 ? (
        <Callout variant="danger" title="Check these settings" items={parsed.schemaProblems} />
      ) : null}
      <ErrorAlert error={error} />
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">{footnote}</div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setError(null);
              setDraft(toDraft(value));
            }}
          >
            Reset
          </Button>
          <Button type="submit" disabled={!parsed.config || !dirty || pending}>
            {pending ? 'Saving…' : dirty ? saveLabel : 'No changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}

function TieBreakerRow({
  id,
  index,
  count,
  used,
  onMove,
  onToggle,
}: {
  id: TieBreaker;
  index: number;
  count: number;
  used: boolean;
  onMove: (from: number, to: number) => void;
  onToggle: (used: boolean) => void;
}) {
  const { rowProps, handleProps, isDragging } = useSortableRow(id);
  const label = TIE_BREAKER_LABELS[id];
  return (
    <li
      {...rowProps}
      className={cn(
        'flex items-center gap-2 rounded-sm border border-border bg-background py-1 pr-1 pl-1',
        isDragging && 'shadow-card',
      )}
    >
      <DragHandle handleProps={handleProps} label={`Drag ${label}`} />
      <span className="w-6 font-mono text-sm font-bold text-muted-foreground">{index + 2}.</span>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-semibold">
        <Checkbox checked={used} onCheckedChange={onToggle} />
        <span className={cn(!used && 'text-muted-foreground line-through')}>{label}</span>
      </label>
      <MoveButtons index={index} count={count} onMove={onMove} label={label} />
    </li>
  );
}

function EditorSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 id={id} className="text-sm font-extrabold">
            {title}
          </h3>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-1">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

function Money({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <span className={cn('font-mono', strong ? 'font-bold text-foreground' : 'text-foreground')}>
      {children}
    </span>
  );
}

/** Read-only view of a day's settings (after it opens, or for roles that can't edit). */
export function DayConfigSummary({ config, className }: { config: DayConfig; className?: string }) {
  const tieBreakers = config.tieBreakers.map((id) => TIE_BREAKER_LABELS[id]);
  const rows: { label: string; value: ReactNode }[] = [
    {
      label: 'Entry fee',
      value: <span className="font-mono">{formatNaira(config.entryFeeKobo)}</span>,
    },
    {
      label: 'Prize money',
      value: `${formatBps(config.prizeBps)} of entry fees, ${formatBps(config.jackpotBps)} of that to the league jackpot`,
    },
    {
      label: `Prize split · ${config.prizeTiersBps.length} ${config.prizeTiersBps.length === 1 ? 'place' : 'places'}`,
      value: (
        <span className="font-mono text-xs">
          {config.prizeTiersBps
            .map((bps, index) => `${ordinal(index + 1)} ${formatBps(bps)}`)
            .join(' · ')}
        </span>
      ),
    },
    {
      label: 'Scoring',
      value: `Winner ${config.scoring.winner} · right number of sets +${config.scoring.setCount} · exact score +${config.scoring.exactScore}${config.scoring.bonusNeedsWinner ? ' · bonuses need the right winner' : ''}`,
    },
    {
      label: 'Ties',
      value: ['Points', ...tieBreakers, 'then shared'].join(' → '),
    },
    {
      label: 'Locks',
      value:
        config.lockLeadMin === 0
          ? 'At each match’s scheduled start'
          : `${config.lockLeadMin} min before each match`,
    },
    {
      label: 'Minimum played matches',
      value:
        config.minScoredMatches === null
          ? "Half the day's matches"
          : String(config.minScoredMatches),
    },
    {
      label: 'Format',
      value: `Best of ${config.format.bestOf}, sets to ${config.format.setTarget}, deciding set to ${config.format.decidingSetTarget}`,
    },
  ];
  return (
    <dl className={cn('grid gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]', className)}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt>
            <Kicker className="pt-0.5">{row.label}</Kicker>
          </dt>
          <dd className="text-sm">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
