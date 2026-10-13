import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT } from './format';
import {
  DEFAULT_ENTRY_FEE_KOBO,
  DEFAULT_JACKPOT_BPS,
  DEFAULT_PRIZE_BPS,
  DEFAULT_PRIZE_TIERS_BPS,
} from './prizes';
import { DEFAULT_TIE_BREAKERS } from './ranking';
import { buildRules, fnv1a64, rulesHash, type RulesDocument, type RulesInput } from './rules';
import { DEFAULT_SCORING, scoreMatch } from './scoring';

const INPUT: RulesInput = {
  productName: 'Volley Predict',
  entryFeeKobo: DEFAULT_ENTRY_FEE_KOBO,
  prizeBps: DEFAULT_PRIZE_BPS,
  jackpotBps: DEFAULT_JACKPOT_BPS,
  prizeTiersBps: DEFAULT_PRIZE_TIERS_BPS,
  scoring: DEFAULT_SCORING,
  format: DEFAULT_FORMAT,
  tieBreakers: DEFAULT_TIE_BREAKERS,
  lockLeadMin: 0,
  minScoredMatches: 5,
  jackpotEntryClosesAt: new Date('2025-10-18T15:00:00Z'),
};

const SECTION_IDS = [
  'how-it-works',
  'entry-and-payment',
  'predicting',
  'scoring',
  'ties',
  'prize-pool',
  'void-matches',
  'results',
  'jackpot',
  'claiming',
  'refunds',
  'fair-play',
  'privacy',
];

/** Every string in a section (or the whole document), joined for searching. */
function textOf(doc: RulesDocument, id?: string): string {
  const sections = id === undefined ? doc.sections : doc.sections.filter((s) => s.id === id);
  if (sections.length === 0) throw new Error(`No section ${id}`);
  return sections
    .flatMap((s) => [
      s.title,
      ...s.paragraphs,
      ...(s.bullets ?? []),
      ...(s.example ? [s.example.title, ...s.example.lines] : []),
    ])
    .join('\n');
}

function rules(overrides: Partial<RulesInput> = {}): RulesDocument {
  return buildRules({ ...INPUT, ...overrides });
}

describe('buildRules', () => {
  it('has every section, in order, each with a title and some text', () => {
    const doc = rules();
    expect(doc.sections.map((s) => s.id)).toEqual(SECTION_IDS);
    for (const section of doc.sections) {
      expect(section.title.length).toBeGreaterThan(0);
      expect(section.paragraphs.length).toBeGreaterThan(0);
    }
  });

  it('uses plain words, not internal jargon or broken values', () => {
    const text = textOf(rules());
    for (const word of [
      'undefined',
      'NaN',
      'null',
      'bps',
      'basis point',
      'closeness',
      'tie-breaker',
      'Infinity',
    ]) {
      expect(text).not.toContain(word);
    }
  });

  it.each([
    {
      id: 'how-it-works',
      snippets: [
        'Volley Predict',
        'Pay ₦500 once',
        'points in every set',
        "Men's and women's",
        'top 10',
      ],
    },
    {
      id: 'entry-and-payment',
      snippets: [
        'once per match day',
        'payment reference',
        'had not started when your money reached our account',
        'we refund it',
        'exactly ₦500',
      ],
    },
    {
      id: 'predicting',
      snippets: [
        'best of 5',
        'deciding 5th set goes to 15',
        'locks at its start time',
        'whichever comes first',
        '0 points',
      ],
    },
    { id: 'results', snippets: ['can still change', 'announce the winners'] },
    { id: 'claiming', snippets: ['bank details', 'PIN, password or OTP'] },
    { id: 'refunds', snippets: ['full refund', "organiser's share"] },
    { id: 'fair-play', snippets: ['18 or older', 'stay in the prize pool'] },
    { id: 'privacy', snippets: ['phone number', 'bank details'] },
  ])('$id says what it should', ({ id, snippets }) => {
    const text = textOf(rules(), id);
    for (const snippet of snippets) expect(text).toContain(snippet);
  });

  describe('scoring', () => {
    it('lists the configured points and works an example with real numbers', () => {
      const section = rules().sections.find((s) => s.id === 'scoring');
      expect(section?.paragraphs.join(' ')).toContain('up to 7 points');
      expect(section?.bullets).toEqual(
        expect.arrayContaining([
          '3 points for the correct winner.',
          '2 more points for the correct number of sets played, if you also picked the right winner.',
          '2 more points for the exact set score (like 3–1).',
        ]),
      );
      expect(section?.example?.lines).toEqual([
        'The match ends 3–1.',
        'You predict 3–1: 3 + 2 + 2 = 7 points (right winner, right number of sets and exact score).',
        'You predict 3–2: 3 points (right winner, wrong number of sets).',
        'You predict 1–3: 0 points (wrong winner, so nothing else counts).',
      ]);
    });

    it('matches scoreMatch for other settings', () => {
      const scoring = { winner: 5, setCount: 1, exactScore: 4, bonusNeedsWinner: false };
      const text = textOf(rules({ scoring }), 'scoring');
      const actual = { homeSets: 3, awaySets: 1 };
      const exact = scoreMatch(actual, actual, scoring).points;
      const wrong = scoreMatch({ homeSets: 1, awaySets: 3 }, actual, scoring).points;
      expect(exact).toBe(10);
      expect(wrong).toBe(1);
      expect(text).toContain(`You predict 3–1: 5 + 1 + 4 = ${exact} points`);
      expect(text).toContain(
        `You predict 1–3: ${wrong} point (wrong winner, but the right number of sets)`,
      );
      expect(text).toContain('even if you picked the wrong winner');
    });

    it('works for best of 3', () => {
      const format = { bestOf: 3, setTarget: 25, decidingSetTarget: 15 } as const;
      const doc = rules({ format });
      expect(textOf(doc, 'scoring')).toContain('You predict 2–1: 3 + 2 + 2 = 7 points');
      expect(textOf(doc, 'scoring')).toContain('You predict 2–0: 3 points');
      expect(textOf(doc, 'predicting')).toContain('deciding 3rd set goes to 15');
    });
  });

  describe('ties', () => {
    it('explains closest set scores with a worked example', () => {
      const section = rules().sections.find((s) => s.id === 'ties');
      expect(section?.example?.lines).toEqual([
        'The match ends 3–1: 25–20, 23–25, 25–22, 25–18.',
        'Player A predicted 25–22, 23–25, 25–20, 25–18. Off by 2 + 0 + 2 + 0 = 4 points.',
        'Player B predicted 25–15, 21–25, 25–19, 25–20. Off by 5 + 2 + 3 + 2 = 12 points.',
        'Both get 7 points for this match, but Player A was closer (4 against 12), so Player A ranks higher if everything else is level.',
      ]);
      const text = textOf(rules(), 'ties');
      expect(text).toContain('2nd and 3rd prizes are added together and split equally');
      expect(text).toContain('The next player is 4th');
    });

    it('follows the configured order', () => {
      const doc = rules({ tieBreakers: ['correctWinners', 'exactScores'] });
      const section = doc.sections.find((s) => s.id === 'ties');
      expect(section?.paragraphs[0]).toBe(
        'If players finish the day with the same points, the player with the most correct winners ranks higher.',
      );
      expect(section?.paragraphs[1]).toBe(
        'If they are still level, the player with the most exact set scores ranks higher.',
      );
      expect(section?.example).toBeUndefined();
    });

    it('goes straight to sharing without tie-breakers', () => {
      const section = rules({ tieBreakers: [] }).sections.find((s) => s.id === 'ties');
      expect(section?.paragraphs[0]).toMatch(/^If players finish with the same points, they share/);
    });
  });

  describe('prize pool', () => {
    it('shows the real percentages, the split and an example day', () => {
      const section = rules().sections.find((s) => s.id === 'prize-pool');
      const text = textOf(rules(), 'prize-pool');
      expect(text).toContain(
        '80% of all entry fees is prize money. The other 20% pays for running the game.',
      );
      expect(text).toContain('10% of the prize money goes to the league jackpot');
      expect(text).toContain(
        "From each ₦500 entry, ₦360 goes to the day's prizes, ₦40 to the league jackpot and ₦100 to running the game.",
      );
      expect(text).toContain('the unused share is shared among the places that have winners');
      expect(text).toContain('exact kobo');
      expect(section?.bullets).toEqual([
        '1st place: 40%',
        '2nd place: 20%',
        '3rd place: 12.5%',
        '4th place: 7.5%',
        '5th place: 5%',
        '6th place: 4%',
        '7th place: 3%',
        '8th place: 3%',
        '9th place: 2.5%',
        '10th place: 2.5%',
      ]);
      expect(section?.example?.lines).toEqual(
        expect.arrayContaining([
          'Entry fees: 100 × ₦500 = ₦50,000.',
          'Prize pool for the day: ₦36,000.',
          '1st place: ₦14,400.',
          '10th place: ₦900.',
        ]),
      );
    });

    it('says "about" when an entry does not split exactly', () => {
      const text = textOf(rules({ entryFeeKobo: 333, jackpotBps: 0 }), 'prize-pool');
      expect(text).toContain(
        "From each ₦3.33 entry, about ₦2.66 goes to the day's prizes and ₦0.67 to running the game.",
      );
      expect(text).not.toContain('league jackpot');
    });

    it('handles a winner-takes-all split', () => {
      const section = rules({ prizeTiersBps: [10_000] }).sections.find(
        (s) => s.id === 'prize-pool',
      );
      expect(section?.bullets).toBeUndefined();
      expect(section?.paragraphs).toContain('The winner gets all of the prize pool.');
      expect(textOf(rules({ prizeTiersBps: [10_000] }), 'how-it-works')).toContain(
        'The player with the most points wins the prize money.',
      );
    });
  });

  it.each([
    {
      lockLeadMin: 0,
      predicting: 'Each match locks at its start time',
      payment: 'had not started',
    },
    {
      lockLeadMin: 1,
      predicting: 'Each match locks 1 minute before its start time',
      payment: 'each match locks 1 minute before it starts',
    },
    {
      lockLeadMin: 10,
      predicting: 'Each match locks 10 minutes before its start time',
      payment: 'each match locks 10 minutes before it starts',
    },
  ])(
    'describes a lock $lockLeadMin minutes before the start',
    ({ lockLeadMin, predicting, payment }) => {
      const doc = rules({ lockLeadMin });
      expect(textOf(doc, 'predicting')).toContain(predicting);
      expect(textOf(doc, 'entry-and-payment')).toContain(payment);
    },
  );

  it.each([
    { minScoredMatches: 5, expected: 'If fewer than 5 matches are played on a match day' },
    { minScoredMatches: 1, expected: 'If no match is played on a match day' },
    { minScoredMatches: 0, expected: 'If no match is played on a match day' },
  ])(
    'cancels a day with fewer than $minScoredMatches matches',
    ({ minScoredMatches, expected }) => {
      expect(textOf(rules({ minScoredMatches }), 'void-matches')).toContain(expected);
    },
  );

  it.each([
    { closesAt: new Date('2025-10-18T15:00:00Z'), expected: 'before Sat 18 Oct, 4:00pm.' },
    { closesAt: null, expected: 'before the date we announce.' },
  ])('jackpot entries close $expected', ({ closesAt, expected }) => {
    const text = textOf(rules({ jackpotEntryClosesAt: closesAt }), 'jackpot');
    expect(text).toContain(expected);
    expect(text).toContain('You can submit your prediction once');
    expect(text).toContain("it can't be changed by you or by us");
    expect(text).toContain('whoever submitted their prediction first wins');
    expect(text).toContain('carries over to the next league');
    expect(text).toContain('Your total for this table: 4.');
  });

  it('adds claim help when given', () => {
    const help = 'Questions? Call 0800 000 0000.';
    expect(
      rules({ claimHelp: help }).sections.find((s) => s.id === 'claiming')?.paragraphs,
    ).toContain(help);
    expect(textOf(rules({ claimHelp: '  ' }), 'claiming')).not.toContain('Questions');
  });

  it.each<{ name: string; overrides: Partial<RulesInput> }>([
    { name: 'an invalid prize split', overrides: { prizeTiersBps: [5000, 4000] } },
    { name: 'a negative fee', overrides: { entryFeeKobo: -1 } },
    { name: 'prizeBps above 100%', overrides: { prizeBps: 10_001 } },
    { name: 'a repeated tie-breaker', overrides: { tieBreakers: ['closeness', 'closeness'] } },
    { name: 'no product name', overrides: { productName: ' ' } },
    { name: 'a negative lead time', overrides: { lockLeadMin: -1 } },
    { name: 'fractional points', overrides: { scoring: { ...DEFAULT_SCORING, winner: 1.5 } } },
    { name: 'an invalid jackpot date', overrides: { jackpotEntryClosesAt: new Date('nope') } },
  ])('throws on $name', ({ overrides }) => {
    expect(() => rules(overrides)).toThrow();
  });
});

describe('fnv1a64', () => {
  it.each([
    ['', 'cbf29ce484222325'],
    ['a', 'af63dc4c8601ec8c'],
    ['foobar', '85944171f73967e8'],
  ])('%o → %s', (input, expected) => {
    expect(fnv1a64(input)).toBe(expected);
  });

  it('hashes the UTF-8 bytes', () => {
    expect(fnv1a64('₦')).not.toBe(fnv1a64('N'));
    expect(fnv1a64('₦')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('rulesHash', () => {
  it('is a stable 16-digit hex fingerprint', () => {
    const hash = rulesHash(rules());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(rulesHash(rules())).toBe(hash);
  });

  it.each<{ name: string; overrides: Partial<RulesInput> }>([
    { name: 'the fee', overrides: { entryFeeKobo: 60_000 } },
    {
      name: 'the jackpot date',
      overrides: { jackpotEntryClosesAt: new Date('2025-10-19T15:00:00Z') },
    },
    { name: 'the lead time', overrides: { lockLeadMin: 5 } },
    { name: 'the tie-breakers', overrides: { tieBreakers: ['exactScores'] } },
  ])('changes when $name changes', ({ overrides }) => {
    expect(rulesHash(rules(overrides))).not.toBe(rulesHash(rules()));
  });

  it('shows the new fee in the text', () => {
    expect(textOf(rules({ entryFeeKobo: 60_000 }))).toContain('₦600');
  });
});
