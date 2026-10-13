'use client';

import { cn } from '@predict/ui/utils';
import { useState } from 'react';

const SIZES = {
  sm: 'size-6 text-[8px]',
  md: 'size-9 text-[10px]',
  lg: 'size-12 text-xs',
} as const;

/** Up to three letters for a team without a logo, e.g. "KAN" or "NC" for "Nigeria Customs". */
export function teamInitials(team: { name: string; shortName: string }): string {
  const short = team.shortName.trim();
  if (short) return short.slice(0, 3).toUpperCase();
  const words = team.name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * A team's logo, or its initials in a round badge when there is no logo (or it fails to load).
 * Decorative: the team name is always written next to it.
 */
export function TeamLogo({
  team,
  size = 'md',
  className,
}: {
  team: { name: string; shortName: string; logoUrl: string | null };
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(team.logoUrl) && failedUrl !== team.logoUrl;

  if (showImage && team.logoUrl) {
    return (
      // Logos come from the media bucket at their final size; next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(team.logoUrl)}
        className={cn('shrink-0 rounded-full bg-white object-contain', SIZES[size], className)}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-sg-surface font-mono font-bold tracking-tight text-sg-ink',
        SIZES[size],
        className,
      )}
    >
      {teamInitials(team)}
    </span>
  );
}
