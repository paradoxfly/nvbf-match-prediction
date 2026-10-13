import { cn } from '@predict/ui/utils';
import { initials } from '@/lib/format';

const SIZES = {
  sm: 'size-6 text-[9px]',
  md: 'size-9 text-[11px]',
  lg: 'size-14 text-sm',
} as const;

/** A team (or sponsor) logo, or its initials on a Night disc when there is none. */
export function TeamLogo({
  name,
  logoUrl,
  size = 'md',
  className,
}: {
  name: string;
  logoUrl: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (logoUrl) {
    return (
      // Logos come from our media storage with arbitrary hosts; next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        className={cn('shrink-0 rounded-full bg-background object-contain', SIZES[size], className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-sg-night font-mono font-bold text-sg-flash',
        SIZES[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** "HOME v AWAY" with logos, for match rows. */
export function MatchTeams({
  home,
  away,
  compact = false,
}: {
  home: { name: string; shortName: string; logoUrl: string | null };
  away: { name: string; shortName: string; logoUrl: string | null };
  compact?: boolean;
}) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <TeamLogo name={home.name} logoUrl={home.logoUrl} size="sm" />
        <span className="font-semibold">{compact ? home.shortName : home.name}</span>
      </span>
      <span className="font-mono text-[10px] tracking-[2px] text-muted-foreground uppercase">
        v
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <TeamLogo name={away.name} logoUrl={away.logoUrl} size="sm" />
        <span className="font-semibold">{compact ? away.shortName : away.name}</span>
      </span>
    </span>
  );
}
