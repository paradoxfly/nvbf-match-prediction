'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { QueryError } from '@/components/query-error';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatDay, isIsoDate } from '@/lib/format';
import type { RulesData } from '@/lib/types';

type Section = RulesData['sections'][number];

function RulesSection({ section }: { section: Section }) {
  return (
    <section id={section.id} aria-labelledby={`${section.id}-title`} className="scroll-mt-6">
      <h2 id={`${section.id}-title`}>{section.title}</h2>
      {section.paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {section.bullets && section.bullets.length > 0 ? (
        <ul>
          {section.bullets.map((bullet, index) => (
            <li key={index}>{bullet}</li>
          ))}
        </ul>
      ) : null}
      {section.example ? (
        <figure className="mt-5 rounded-lg border border-border bg-sg-surface/40 p-4">
          <figcaption className="font-mono text-[10px] font-medium tracking-[2px] text-muted-foreground uppercase">
            {section.example.title}
          </figcaption>
          <div className="mt-3 flex flex-col gap-1.5 font-mono text-[13px] leading-relaxed">
            {section.example.lines.map((line, index) => (
              <div key={index}>{line}</div>
            ))}
          </div>
        </figure>
      ) : null}
    </section>
  );
}

/** The contest rules (a day's frozen copy with ?date=), with a table of contents. */
export function RulesScreen() {
  const params = useSearchParams();
  const requested = params.get('date');
  const date = requested && isIsoDate(requested) ? requested : undefined;
  const query = useQuery(api.public.rules.queryOptions({ input: { date } }));
  const loaded = Boolean(query.data);

  // The sections arrive after the first paint, so jump to a #section link once they're in.
  useEffect(() => {
    if (!loaded || !window.location.hash) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))?.scrollIntoView();
  }, [loaded]);

  const rulesDate = query.data?.date ?? date ?? null;

  return (
    <article>
      <h1>rules</h1>
      <p>
        {rulesDate
          ? `The rules for ${formatDay(rulesDate)}. Once a day opens, its rules and numbers can't change.`
          : 'How the game works, in plain language, with the numbers the league uses right now.'}
        {date ? (
          <>
            {' '}
            <Link href="/rules">See the current rules</Link>.
          </>
        ) : null}
      </p>

      {query.data ? (
        <>
          <nav aria-label="On this page" className="mt-6 rounded-lg bg-muted p-4">
            <div className="font-mono text-[10px] font-medium tracking-[2px] text-muted-foreground uppercase">
              on this page
            </div>
            <ol className="mt-2 grid gap-x-6 text-sm sm:grid-cols-2">
              {query.data.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>
          {query.data.sections.map((section) => (
            <RulesSection key={section.id} section={section} />
          ))}
          <p className="text-xs text-muted-foreground">
            Rules version <span className="font-mono">{query.data.hash.slice(0, 12)}</span>. More
            questions? See the <Link href="/faq">FAQ</Link>.
          </p>
        </>
      ) : query.isError ? (
        <div className="mt-6">
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : (
        <div role="status" aria-label="Loading the rules" className="mt-6 flex flex-col gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      )}
    </article>
  );
}
