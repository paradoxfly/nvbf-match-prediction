'use client';

import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { GemIcon } from 'lucide-react';
import Link from 'next/link';
import { Kicker } from '@/components/ui/text';
import { formatCountdown, formatNaira, plural } from '@/lib/format';
import type { PublicJackpotData } from '@/lib/types';

export function jackpotStatusLine(jackpot: PublicJackpotData, now: number): string {
  const closesIn = new Date(jackpot.entryClosesAt).getTime() - now;
  if (jackpot.status === 'settled') return 'The jackpot has been won.';
  if (jackpot.status === 'carried_over')
    return 'Nobody qualified, so it carries over to the next league.';
  if (jackpot.status === 'open' && closesIn > 0)
    return `Entries close in ${formatCountdown(closesIn)}`;
  return 'Entries are closed. The winner is announced when the league ends.';
}

/** The league jackpot teaser on the home page. */
export function JackpotCard({ jackpot, now }: { jackpot: PublicJackpotData; now: number }) {
  const open = jackpot.status === 'open' && new Date(jackpot.entryClosesAt).getTime() - now > 0;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Kicker>league jackpot</Kicker>
          <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">
            predict the final table
          </h2>
        </div>
        <GemIcon aria-hidden className="size-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-mono text-4xl leading-none font-bold tracking-[-1px]">
          {formatNaira(jackpot.guaranteedKobo)}
        </p>
        {jackpot.pendingKobo > 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            + about {formatNaira(jackpot.pendingKobo)} from today&apos;s games
          </p>
        ) : null}
      </div>
      <p className="text-sm">
        {jackpotStatusLine(jackpot, now)}
        <span className="text-muted-foreground"> · {plural(jackpot.entries, 'prediction')} in</span>
      </p>
      <Button asChild variant={open ? 'default' : 'outline'} className="self-start">
        <Link href="/jackpot">{open ? 'Predict the final table' : 'See the jackpot'}</Link>
      </Button>
    </Card>
  );
}
