// Contest rules in plain language, generated from the real configuration so words match numbers.

import { setLineError } from './closeness';
import { buildSetLine, defaultSetWinners, majorWinner, setsToWin, targetForSet } from './format';
import { standingsDistance } from './jackpot';
import {
  assertKobo,
  BPS,
  computePool,
  formatBps,
  formatNaira,
  ordinal,
  placeAmounts,
  validatePrizeTiers,
} from './prizes';
import { maxPointsPerMatch, scoreMatch } from './scoring';
import { formatWatDateTime } from './time';
import type { MajorScore, MatchFormat, ScoringConfig, SetLine, TieBreaker } from './types';

/** Everything the rules text depends on. Use the contest's frozen configuration. */
export interface RulesInput {
  productName: string;
  entryFeeKobo: number;
  prizeBps: number;
  jackpotBps: number;
  prizeTiersBps: number[];
  scoring: ScoringConfig;
  format: MatchFormat;
  tieBreakers: TieBreaker[];
  lockLeadMin: number;
  minScoredMatches: number;
  jackpotEntryClosesAt: Date | null;
  /** Extra help on claiming prizes, e.g. a support phone number. */
  claimHelp?: string;
}

export interface RulesSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  example?: { title: string; lines: string[] };
}

export interface RulesDocument {
  sections: RulesSection[];
}

const DASH = '–';
/** Players in the prize-pool example. */
const EXAMPLE_PLAYERS = 100;
/** Places listed in the prize-pool example before "and so on". */
const EXAMPLE_PLACES = 10;

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 'a', 'a and b', 'a, b and c'. */
function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function majorText(major: MajorScore): string {
  return `${major.homeSets}${DASH}${major.awaySets}`;
}

function setLineText(sets: SetLine): string {
  return sets.map((set) => `${set.home}${DASH}${set.away}`).join(', ');
}

function assertWholeCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a whole number (0 or more), got ${value}.`);
  }
}

function assertRulesInput(input: RulesInput): void {
  if (input.productName.trim().length === 0) throw new Error('productName is required.');
  assertKobo(input.entryFeeKobo, 'entryFeeKobo');
  for (const [value, label] of [
    [input.prizeBps, 'prizeBps'],
    [input.jackpotBps, 'jackpotBps'],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > BPS) {
      throw new RangeError(`${label} must be whole basis points from 0 to ${BPS}, got ${value}.`);
    }
  }
  const tierProblems = validatePrizeTiers(input.prizeTiersBps);
  if (tierProblems.length > 0) throw new Error(`Invalid prize split: ${tierProblems.join(' ')}`);
  assertWholeCount(input.scoring.winner, 'scoring.winner');
  assertWholeCount(input.scoring.setCount, 'scoring.setCount');
  assertWholeCount(input.scoring.exactScore, 'scoring.exactScore');
  assertWholeCount(input.lockLeadMin, 'lockLeadMin');
  assertWholeCount(input.minScoredMatches, 'minScoredMatches');
  if (new Set(input.tieBreakers).size !== input.tieBreakers.length) {
    throw new Error('Each tie-breaker can only be used once.');
  }
}

function howItWorks(input: RulesInput): RulesSection {
  const fee = formatNaira(input.entryFeeKobo);
  const places = input.prizeTiersBps.length;
  const sample = `${setsToWin(input.format)}${DASH}1`;
  return {
    id: 'how-it-works',
    title: 'How it works',
    paragraphs: [
      `${input.productName} is a daily prediction game for volleyball fans.`,
      `Pay ${fee} once to enter a match day. Then predict every match that day: the set score ` +
        `(like ${sample}) and the points in every set.`,
      "Men's and women's matches count towards one shared prize pool.",
    ],
    bullets: [
      `Pay the ${fee} entry fee by bank transfer.`,
      'Predict the set score and the points in every set for each match.',
      'Earn points for every match you get right.',
      places === 1
        ? 'The player with the most points wins the prize money.'
        : `The top ${places} players on the leaderboard win prize money.`,
    ],
  };
}

function entryAndPayment(input: RulesInput): RulesSection {
  const fee = formatNaira(input.entryFeeKobo);
  return {
    id: 'entry-and-payment',
    title: 'Entering and paying',
    paragraphs: [
      `Each person can enter once per match day. An entry costs ${fee}.`,
      'Pay by bank transfer. Put your payment reference in the transfer description so we can ' +
        'match the money to your entry.',
      'Your predictions only count once we have confirmed that your money has reached our account.',
      input.lockLeadMin > 0
        ? 'Important: your predictions only count for matches that had not locked when your money ' +
          `reached our account (each match locks ${plural(input.lockLeadMin, 'minute')} before ` +
          'it starts). This keeps the game fair for everyone, so pay early.'
        : 'Important: your predictions only count for matches that had not started when your ' +
          'money reached our account. This keeps the game fair for everyone, so pay early.',
      'If your money arrives after the last match of the day has locked, we refund it.',
      `If you send the wrong amount, we refund it. Please send exactly ${fee}.`,
    ],
  };
}

function predicting(input: RulesInput): RulesSection {
  const { format } = input;
  const needed = setsToWin(format);
  const target = format.setTarget;
  const formatText =
    format.setTarget === format.decidingSetTarget
      ? `Every set goes to ${target} points.`
      : `Sets go to ${target} points, and the deciding ${ordinal(format.bestOf)} set goes to ` +
        `${format.decidingSetTarget}.`;
  const lockText =
    input.lockLeadMin > 0
      ? `Each match locks ${plural(input.lockLeadMin, 'minute')} before its start time, or when ` +
        'we close the day, whichever comes first.'
      : 'Each match locks at its start time, or when we close the day, whichever comes first.';
  return {
    id: 'predicting',
    title: 'Making your predictions',
    paragraphs: [
      `For each match, choose the set score (for example ${needed}${DASH}1) and the points in ` +
        `every set (for example ${target}${DASH}${Math.max(0, target - 4)}).`,
      `Matches are best of ${format.bestOf}: the first team to win ${needed} sets wins. ` +
        `${formatText} A team must win a set by 2 points, so a set can go past ${target} ` +
        `(for example ${target + 2}${DASH}${target}).`,
      `${lockText} If a match starts early, it locks when it starts.`,
      "You can change your predictions as often as you like until the match locks. After that they can't be changed.",
      'If you skip a match, you get 0 points for it.',
    ],
  };
}

/** One worked line, e.g. 'You predict 3–1: 3 + 2 + 2 = 7 points (…).', computed with scoreMatch. */
function scoringExampleLine(
  predicted: MajorScore,
  actual: MajorScore,
  scoring: ScoringConfig,
): string {
  const winnerPart = scoreMatch(predicted, actual, { ...scoring, setCount: 0, exactScore: 0 });
  const setsPart = scoreMatch(predicted, actual, { ...scoring, winner: 0, exactScore: 0 });
  const exactPart = scoreMatch(predicted, actual, { ...scoring, winner: 0, setCount: 0 });
  const total = scoreMatch(predicted, actual, scoring).points;
  const parts = [winnerPart.points, setsPart.points, exactPart.points].filter((n) => n > 0);
  const sum =
    parts.length > 1 ? `${parts.join(' + ')} = ${plural(total, 'point')}` : plural(total, 'point');

  const rightWinner = majorWinner(predicted) === majorWinner(actual);
  const rightSets = predicted.homeSets + predicted.awaySets === actual.homeSets + actual.awaySets;
  let reason: string;
  if (rightWinner && rightSets) reason = 'right winner, right number of sets and exact score';
  else if (rightWinner) reason = 'right winner, wrong number of sets';
  else if (rightSets && setsPart.points > 0) reason = 'wrong winner, but the right number of sets';
  else if (rightSets) reason = 'wrong winner, so nothing else counts';
  else reason = 'wrong winner';
  return `You predict ${majorText(predicted)}: ${sum} (${reason}).`;
}

function scoringSection(input: RulesInput): RulesSection {
  const { scoring, format } = input;
  const needed = setsToWin(format);
  const bullets: string[] = [];
  const more = () => (bullets.length > 0 ? 'more ' : '');
  if (scoring.winner > 0) {
    bullets.push(`${plural(scoring.winner, 'point')} for the correct winner.`);
  }
  if (scoring.setCount > 0) {
    const condition = scoring.bonusNeedsWinner
      ? 'if you also picked the right winner'
      : 'even if you picked the wrong winner';
    bullets.push(
      `${plural(scoring.setCount, `${more()}point`)} for the correct number of sets played, ${condition}.`,
    );
  }
  if (scoring.exactScore > 0) {
    bullets.push(
      `${plural(scoring.exactScore, `${more()}point`)} for the exact set score (like ${needed}${DASH}1).`,
    );
  }
  bullets.push(
    "The points you predict in each set don't add to your score. They are used to separate " +
      'players who finish with the same points.',
  );

  const actual: MajorScore = { homeSets: needed, awaySets: 1 };
  const close: MajorScore =
    needed - 1 > 1 ? { homeSets: needed, awaySets: needed - 1 } : { homeSets: needed, awaySets: 0 };
  const wrong: MajorScore = { homeSets: 1, awaySets: needed };
  return {
    id: 'scoring',
    title: 'How points work',
    paragraphs: [
      `Points come from the set score you predict. Each match is worth up to ${plural(
        maxPointsPerMatch(scoring),
        'point',
      )}:`,
    ],
    bullets,
    example: {
      title: 'Example',
      lines: [
        `The match ends ${majorText(actual)}.`,
        ...[actual, close, wrong].map((predicted) =>
          scoringExampleLine(predicted, actual, scoring),
        ),
      ],
    },
  };
}

const TIE_BREAKER_PHRASES: Record<TieBreaker, string> = {
  closeness: 'the player whose set scores were closest',
  exactScores: 'the player with the most exact set scores',
  correctWinners: 'the player with the most correct winners',
};

/** The closeness tie-breaker worked through one match, computed with setLineError. */
function closenessExample(input: RulesInput): { title: string; lines: string[] } {
  const { format } = input;
  const major: MajorScore = { homeSets: setsToWin(format), awaySets: 1 };
  const winners = defaultSetWinners(major);
  const line = (offsets: readonly number[]): SetLine =>
    buildSetLine(
      winners,
      winners.map((_, index) => Math.max(0, targetForSet(index, format) - (offsets[index] ?? 2))),
      format,
    );
  const actual = line([5, 2, 3, 7]);
  const players = [
    { name: 'Player A', sets: line([3, 2, 5, 7]) },
    { name: 'Player B', sets: line([10, 4, 6, 5]) },
  ];
  const points = scoreMatch(major, major, input.scoring).points;
  const [a, b] = players.map((player) => ({
    ...player,
    perSet: actual.map((set, index) => setLineError(player.sets.slice(index, index + 1), [set])),
    total: setLineError(player.sets, actual),
  }));
  if (a === undefined || b === undefined) throw new Error('Closeness example needs two players.');
  return {
    title: 'Example: closest set scores',
    lines: [
      `The match ends ${majorText(major)}: ${setLineText(actual)}.`,
      ...[a, b].map(
        (player) =>
          `${player.name} predicted ${setLineText(player.sets)}. Off by ` +
          `${player.perSet.join(' + ')} = ${plural(player.total, 'point')}.`,
      ),
      `Both get ${plural(points, 'point')} for this match, but ${a.name} was closer ` +
        `(${a.total} against ${b.total}), so ${a.name} ranks higher if everything else is level.`,
    ],
  };
}

function ties(input: RulesInput): RulesSection {
  const paragraphs: string[] = [];
  const leads = ['If players finish the day with the same points,', 'If they are still level,'];
  input.tieBreakers.forEach((tieBreaker, index) => {
    const lead = leads[index] ?? 'If that is level too,';
    paragraphs.push(`${lead} ${TIE_BREAKER_PHRASES[tieBreaker]} ranks higher.`);
    if (tieBreaker === 'closeness') {
      paragraphs.push(
        'To measure this, we take every set of every match and add up how many points your ' +
          'prediction was off for each team. The lowest total is the closest. A missing set ' +
          "counts as 0–0, and a match you didn't predict counts as 0–0 in every set.",
      );
    }
  });
  paragraphs.push(
    `${input.tieBreakers.length > 0 ? 'If players are still level after all of this' : 'If players finish with the same points'}, ` +
      'they share the prize money of the places they take up, in equal parts. For example, if ' +
      'two players tie for 2nd place, they take up 2nd and 3rd, so the 2nd and 3rd prizes are ' +
      'added together and split equally between them. The next player is 4th.',
    'The time you entered or saved your predictions is never used to break a tie in the daily game.',
  );
  return {
    id: 'ties',
    title: 'When players have the same points',
    paragraphs,
    ...(input.tieBreakers.includes('closeness') ? { example: closenessExample(input) } : {}),
  };
}

function prizePool(input: RulesInput): RulesSection {
  const fee = formatNaira(input.entryFeeKobo);
  const places = input.prizeTiersBps.length;
  const prizePct = formatBps(input.prizeBps);
  const jackpotPct = formatBps(input.jackpotBps);
  const poolFor = (confirmedCount: number) =>
    computePool({
      confirmedCount,
      entryFeeKobo: input.entryFeeKobo,
      prizeBps: input.prizeBps,
      jackpotBps: input.jackpotBps,
      contributionsKobo: 0,
    });

  const paragraphs: string[] = [
    input.prizeBps === BPS
      ? 'All entry fees go into prize money.'
      : `${prizePct} of all entry fees is prize money. The other ${formatBps(BPS - input.prizeBps)} ` +
        'pays for running the game.',
  ];
  if (input.jackpotBps > 0) {
    paragraphs.push(
      `${jackpotPct} of the prize money goes to the league jackpot. The rest is shared by the ` +
        "day's winners.",
    );
  }

  const one = poolFor(1);
  const exact =
    (BigInt(input.entryFeeKobo) * BigInt(input.prizeBps)) % BigInt(BPS) === 0n &&
    (BigInt(one.participantShareKobo) * BigInt(input.jackpotBps)) % BigInt(BPS) === 0n;
  const shares = [`${formatNaira(one.dailyPoolKobo)} goes to the day's prizes`];
  if (one.jackpotCutKobo > 0)
    shares.push(`${formatNaira(one.jackpotCutKobo)} to the league jackpot`);
  if (one.operationsKobo > 0) shares.push(`${formatNaira(one.operationsKobo)} to running the game`);
  paragraphs.push(`From each ${fee} entry, ${exact ? '' : 'about '}${joinList(shares)}.`);

  paragraphs.push(
    'Sponsors may add more money to the prize pool.',
    'The prize pool grows as we confirm payments. It is fixed once we announce the winners.',
    'If fewer players take part than there are prize places, the unused share is shared among ' +
      'the places that have winners, in the same proportions.',
    "We work out every prize to the exact kobo. When money can't be split equally, the few kobo " +
      'left over go to the organiser.',
    places === 1
      ? 'The winner gets all of the prize pool.'
      : `The prize pool is split between the top ${places} like this:`,
  );

  const pool = poolFor(EXAMPLE_PLAYERS);
  const amounts = placeAmounts(pool.dailyPoolKobo, input.prizeTiersBps, places);
  const lines = [
    `Entry fees: ${EXAMPLE_PLAYERS} × ${fee} = ${formatNaira(pool.revenueKobo)}.`,
    `Prize money (${prizePct}): ${formatNaira(pool.participantShareKobo)}.`,
  ];
  if (input.jackpotBps > 0) {
    lines.push(
      `League jackpot (${jackpotPct} of the prize money): ${formatNaira(pool.jackpotCutKobo)}.`,
    );
  }
  lines.push(`Prize pool for the day: ${formatNaira(pool.dailyPoolKobo)}.`);
  amounts.slice(0, EXAMPLE_PLACES).forEach((amount, index) => {
    lines.push(`${ordinal(index + 1)} place: ${formatNaira(amount)}.`);
  });
  if (places > EXAMPLE_PLACES) lines.push(`…and so on down to ${ordinal(places)} place.`);

  return {
    id: 'prize-pool',
    title: 'Prize money',
    paragraphs,
    ...(places > 1
      ? {
          bullets: input.prizeTiersBps.map(
            (bps, index) => `${ordinal(index + 1)} place: ${formatBps(bps)}`,
          ),
        }
      : {}),
    example: { title: `Example: ${EXAMPLE_PLAYERS} players enter`, lines },
  };
}

function voidMatches(input: RulesInput): RulesSection {
  const min = input.minScoredMatches;
  return {
    id: 'void-matches',
    title: 'Cancelled and postponed matches',
    paragraphs: [
      'We always use the official league result. If the league awards a match (for example ' +
        'as a forfeit), that awarded score is the result.',
      'If a match is cancelled, postponed to another day, or abandoned without an official ' +
        "result, it doesn't count. Nobody gets points for it, and it isn't used to break ties.",
      min <= 1
        ? 'If no match is played on a match day, we cancel the day and refund everyone in full.'
        : `If fewer than ${min} matches are played on a match day, we cancel the day and refund ` +
          'everyone in full.',
    ],
  };
}

function results(): RulesSection {
  return {
    id: 'results',
    title: 'Results and the leaderboard',
    paragraphs: [
      'The leaderboard can still change until we have confirmed every result of the day.',
      'Once every result is confirmed, we announce the winners and their prizes.',
    ],
  };
}

function jackpot(input: RulesInput): RulesSection {
  const closes =
    input.jackpotEntryClosesAt === null
      ? 'the date we announce'
      : formatWatDateTime(input.jackpotEntryClosesAt);
  const names: Record<string, string> = { a: 'Team A', b: 'Team B', c: 'Team C', d: 'Team D' };
  const predicted = ['a', 'b', 'c', 'd'];
  const final = ['b', 'c', 'a', 'd'];
  const tableText = (order: readonly string[]) =>
    order.map((id, index) => `${ordinal(index + 1)} ${names[id] ?? id}`).join(', ');
  const offBy = predicted.map(
    (id, index) => `${names[id] ?? id} ${Math.abs(index - final.indexOf(id))}`,
  );
  const total = standingsDistance({ men: predicted }, { men: final }, names);

  const paragraphs: string[] = [];
  if (input.jackpotBps > 0) {
    paragraphs.push(
      `The league jackpot is built from ${formatBps(input.jackpotBps)} of the daily prize money ` +
        'over the whole league.',
    );
  }
  paragraphs.push(
    `Predict the final men's and women's league tables before ${closes}.`,
    "You can submit your prediction once. After you submit it, it can't be changed by you or " +
      'by us, so check it carefully first.',
    'For each team, we count how many places you were off. For example, if you put a team 2nd ' +
      'and it finishes 5th, you were 3 places off. We add this up for every team in both tables.',
    'The lowest total wins the whole jackpot.',
    'If two or more players are equally close, whoever submitted their prediction first wins.',
    "Teams that withdraw from the league are left out. Any team you didn't place is added to " +
      'the bottom of your table, in alphabetical order.',
    'To win, you need at least one paid, confirmed daily entry in this league.',
    'If nobody qualifies, the jackpot carries over to the next league.',
  );
  return {
    id: 'jackpot',
    title: 'League jackpot',
    paragraphs,
    example: {
      title: 'Example: one table',
      lines: [
        `Your table: ${tableText(predicted)}.`,
        `Final table: ${tableText(final)}.`,
        `Places off: ${joinList(offBy)}.`,
        `Your total for this table: ${total}. Lower is better.`,
      ],
    },
  };
}

function claiming(input: RulesInput): RulesSection {
  const paragraphs = [
    'If you win, add your bank details in your account. We pay prizes by bank transfer.',
    'We will never ask for your PIN, password or OTP. Anyone who asks for them is not us.',
  ];
  const help = input.claimHelp?.trim();
  if (help) paragraphs.push(help);
  return { id: 'claiming', title: 'Getting your prize', paragraphs };
}

function refunds(): RulesSection {
  return {
    id: 'refunds',
    title: 'Refunds',
    paragraphs: [
      "If we cancel a match day, everyone who paid gets a full refund, including the organiser's share.",
      'We also refund money that arrives too late or is the wrong amount.',
    ],
  };
}

function fairPlay(): RulesSection {
  return {
    id: 'fair-play',
    title: 'Fair play',
    paragraphs: [
      'One account per person. You must be 18 or older to play.',
      'If someone has more than one account, we may disqualify those accounts after a review. ' +
        'Their entry fees stay in the prize pool.',
      'Our decisions follow these rules, and we keep a record of every decision.',
    ],
  };
}

function privacy(): RulesSection {
  return {
    id: 'privacy',
    title: 'Your privacy',
    paragraphs: [
      'We never show your email address or phone number publicly.',
      'We only use your bank details to pay you.',
    ],
  };
}

/** The full rules for one contest configuration. Throws if the configuration is invalid. */
export function buildRules(input: RulesInput): RulesDocument {
  assertRulesInput(input);
  return {
    sections: [
      howItWorks(input),
      entryAndPayment(input),
      predicting(input),
      scoringSection(input),
      ties(input),
      prizePool(input),
      voidMatches(input),
      results(),
      jackpot(input),
      claiming(input),
      refunds(),
      fairPlay(),
      privacy(),
    ],
  };
}

const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** 64-bit FNV-1a of the UTF-8 bytes of `text`, as 16 hex digits. Pure JS, so it runs anywhere. */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, '0');
}

/** A stable fingerprint of the rules text, to record which version a player agreed to. */
export function rulesHash(doc: RulesDocument): string {
  return fnv1a64(JSON.stringify(doc));
}
