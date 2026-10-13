import Link from 'next/link';
import { SectionTitle } from '@/components/ui/text';
import { formatNaira, plural } from '@/lib/format';

/** Three plain steps and the way to the full rules. */
export function HowItWorks({
  entryFeeKobo,
  places,
  standingsPublic,
}: {
  entryFeeKobo: number | null;
  places: number | null;
  standingsPublic: boolean;
}) {
  const steps = [
    {
      title: 'Pay to enter',
      body: `${entryFeeKobo === null ? 'Pay the entry fee' : `Send ${formatNaira(entryFeeKobo)}`} by bank transfer, once for the whole day.`,
    },
    {
      title: 'Predict every match',
      body: 'Pick the set score (like 3–1) and the points in every set, before each match starts.',
    },
    {
      title: 'Win cash',
      body:
        places === null
          ? 'Top the leaderboard to win a share of the prize pool.'
          : places === 1
            ? 'The player with the most points wins the prize pool.'
            : `The top ${plural(places, 'player')} share the prize pool. Closest set scores break ties.`,
    },
  ];

  return (
    <section aria-labelledby="how-heading" className="flex flex-col gap-4">
      <SectionTitle id="how-heading" title="how it works" />
      <ol className="grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-3 rounded-lg bg-muted p-4">
            <span
              aria-hidden
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sg-night font-mono text-xs font-bold text-sg-chalk"
            >
              {index + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-sm font-extrabold">{step.title}</span>
              <span className="text-sm text-muted-foreground">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
        <Link href="/rules" className="underline underline-offset-4">
          Read the full rules
        </Link>
        <Link href="/faq" className="underline underline-offset-4">
          Questions and answers
        </Link>
        {standingsPublic ? (
          <Link href="/standings" className="underline underline-offset-4">
            League standings
          </Link>
        ) : null}
      </p>
    </section>
  );
}
