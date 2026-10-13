'use client';

import { Card } from '@predict/ui/card';
import Link from 'next/link';
import { can, useAdmin } from '@/components/admin-shell';
import { Callout } from '@/components/ui/callout';
import { Kicker, Stat } from '@/components/ui/stat';
import { formatNaira, formatWat, ordinal } from '@/lib/format';
import type { AdminDay } from '@/lib/types';

/** The day's money right now (or frozen at finalization), entries and key times. */
export function DayPoolPanel({ day }: { day: AdminDay }) {
  const admin = useAdmin();
  const finance = can(admin, 'finance');
  const { pool, counts } = day;
  const table = pool.placeAmountsKobo.length > 0 ? pool.placeAmountsKobo : pool.fullTableKobo;

  const times: { label: string; value: string | null }[] = [
    {
      label: 'Opens automatically',
      value: day.status === 'draft' || day.status === 'published' ? day.opensAt : null,
    },
    { label: 'Opened', value: day.openedAt },
    { label: 'Entry cutoff', value: day.entryCutoff },
    {
      label: 'Closes automatically',
      value:
        day.status === 'open' || day.status === 'published' || day.status === 'draft'
          ? day.submissionsCloseAt
          : null,
    },
    { label: 'Closed', value: day.closedAt },
    { label: 'Finalized', value: day.finalizedAt },
    { label: 'Cancelled', value: day.cancelledAt },
  ];
  const shownTimes = times.filter((time) => time.value);

  return (
    <Card className="gap-5">
      {day.status === 'cancelled' ? (
        <Callout variant="danger" title="This day was cancelled">
          {day.cancelReason ? `Reason: ${day.cancelReason}. ` : ''}Every confirmed entry is refunded
          in full.
        </Callout>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-2">
          <Stat
            label={pool.final ? 'Final prize pool' : 'Prize pool now'}
            value={formatNaira(pool.dailyPoolKobo)}
            emphasis
          />
          <p className="text-xs text-muted-foreground">
            {pool.confirmedEntries.toLocaleString('en-NG')} paid × {formatNaira(pool.entryFeeKobo)}{' '}
            = {formatNaira(pool.revenueKobo)} in fees
          </p>
          {table.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Places now: </span>
              <span className="font-mono">
                {table
                  .slice(0, 5)
                  .map((amount, index) => `${ordinal(index + 1)} ${formatNaira(amount)}`)
                  .join(' · ')}
                {table.length > 5 ? ` · +${table.length - 5} more` : ''}
              </span>
            </p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Confirmed entries" value={counts.confirmed.toLocaleString('en-NG')} />
          <Stat
            label="Claims to check"
            value={
              finance && counts.paymentReview > 0 ? (
                <Link
                  href={`/payments?day=${day.id}`}
                  className="underline decoration-sg-flash decoration-4 underline-offset-4"
                >
                  {counts.paymentReview.toLocaleString('en-NG')}
                </Link>
              ) : (
                counts.paymentReview.toLocaleString('en-NG')
              )
            }
          />
          <Stat label="Awaiting payment" value={counts.awaitingPayment.toLocaleString('en-NG')} />
          <Stat label="To the jackpot" value={formatNaira(pool.jackpotCutKobo)} />
          <Stat label="Sponsors & top-ups" value={formatNaira(pool.contributionsKobo)} />
          <Stat label="Prize share" value={formatNaira(pool.participantShareKobo)} />
        </div>
      </div>
      {shownTimes.length > 0 ? (
        <dl className="flex flex-wrap gap-x-8 gap-y-3 border-t border-border pt-4">
          {shownTimes.map((time) => (
            <div key={time.label} className="flex flex-col gap-1">
              <dt>
                <Kicker>{time.label}</Kicker>
              </dt>
              <dd className="text-sm font-semibold">{formatWat(time.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}
