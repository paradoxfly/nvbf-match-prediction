import { Kicker } from '@/components/ui/text';
import { formatNaira } from '@/lib/format';
import type { DayData } from '@/lib/types';

type Sponsor = DayData['sponsors'][number];

function SponsorBadge({ sponsor }: { sponsor: Sponsor }) {
  const content = (
    <>
      {sponsor.logoUrl ? (
        // Sponsor logos come from the media bucket at their final size.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sponsor.logoUrl}
          alt=""
          loading="lazy"
          className="h-8 w-auto max-w-[7rem] object-contain"
        />
      ) : null}
      <span className="flex flex-col">
        <span className="text-sm font-bold">{sponsor.name}</span>
        {sponsor.amountKobo > 0 ? (
          <span className="font-mono text-xs text-muted-foreground">
            +{formatNaira(sponsor.amountKobo)}
          </span>
        ) : null}
      </span>
    </>
  );

  const className = 'flex items-center gap-3 rounded-lg border border-border px-4 py-3';
  if (sponsor.url) {
    return (
      <a
        href={sponsor.url}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className={`${className} hover:bg-muted`}
      >
        {content}
      </a>
    );
  }
  return <div className={className}>{content}</div>;
}

/** Sponsors who added money to this day's prizes. */
export function SponsorsStrip({ sponsors }: { sponsors: DayData['sponsors'] }) {
  if (sponsors.length === 0) return null;
  return (
    <section aria-labelledby="sponsors-heading" className="flex flex-col gap-3">
      <Kicker id="sponsors-heading">prize money from our sponsors</Kicker>
      <ul className="flex flex-wrap gap-3">
        {sponsors.map((sponsor, index) => (
          <li key={`${sponsor.name}-${index}`}>
            <SponsorBadge sponsor={sponsor} />
          </li>
        ))}
      </ul>
    </section>
  );
}
