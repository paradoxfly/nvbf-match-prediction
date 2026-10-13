'use client';

import { product } from '@predict/brand';
import { Button } from '@predict/ui/button';
import { cn } from '@predict/ui/utils';
import {
  BanIcon,
  CalendarClockIcon,
  CircleCheckIcon,
  HourglassIcon,
  LockIcon,
  TrophyIcon,
  WalletIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatMoment, formatNaira } from '@/lib/format';
import type { DayData, EntryData } from '@/lib/types';

export const FAIRNESS_NOTE =
  'Picks only count for matches that start after your money reaches us — pay early.';

const TONES = {
  night: 'bg-sg-night text-sg-chalk',
  muted: 'bg-muted text-foreground',
  success: 'bg-success/10 text-foreground',
  danger: 'bg-destructive/10 text-foreground',
} as const;

function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: keyof typeof TONES;
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      aria-label="Your entry"
      className={cn(
        'flex flex-col gap-4 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5',
        TONES[tone],
      )}
    >
      <div className="flex gap-3">
        <span aria-hidden className="mt-0.5 shrink-0 [&_svg]:size-5">
          {icon}
        </span>
        <div className="flex flex-col gap-1">
          <p className="leading-snug font-extrabold">{title}</p>
          {children ? (
            <div
              className={cn(
                'flex flex-col gap-1 text-sm',
                tone === 'night' ? 'text-sg-chalk/75' : 'text-muted-foreground',
              )}
            >
              {children}
            </div>
          ) : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}

const ON_NIGHT_BUTTON = 'bg-sg-chalk text-sg-night hover:bg-sg-chalk/85';

/** Where the player's entry stands, and the one thing to do next. */
export function EntryBanner({
  day,
  entry,
  hasSavedPicks,
}: {
  day: DayData;
  entry: EntryData | null;
  hasSavedPicks: boolean;
}) {
  const payHref = `/play/${day.date}/pay`;
  const fee = formatNaira(entry?.feeKobo ?? day.settings.entryFeeKobo);
  const dayOpen = day.status === 'open';

  if (!entry) {
    if (!dayOpen) return null;
    return (
      <Banner
        tone="muted"
        icon={<WalletIcon />}
        title={`${fee} to enter · your picks save as you go`}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={payHref}>How to pay</Link>
          </Button>
        }
      >
        <p>Pick every match and tap Save. Your picks count once we confirm your payment.</p>
        <p>{FAIRNESS_NOTE}</p>
      </Banner>
    );
  }

  if (entry.disqualified) {
    return (
      <Banner tone="danger" icon={<BanIcon />} title="This entry was disqualified">
        <p>
          We found more than one account for the same person, so this entry can&apos;t win and its
          picks don&apos;t count. If you think this is a mistake, email{' '}
          <a href={`mailto:${product.supportEmail}`} className="font-semibold underline">
            {product.supportEmail}
          </a>
          .
        </p>
      </Banner>
    );
  }

  switch (entry.status) {
    case 'awaiting_payment':
      if (dayOpen) {
        return (
          <Banner
            tone="night"
            icon={<WalletIcon />}
            title={
              hasSavedPicks
                ? `Your picks are saved but don't count until we confirm your ${fee} payment`
                : `Pay ${fee} to make your picks count`
            }
            action={
              <Button asChild className={ON_NIGHT_BUTTON}>
                <Link href={payHref}>Pay {fee}</Link>
              </Button>
            }
          >
            <p>{FAIRNESS_NOTE}</p>
          </Banner>
        );
      }
      return (
        <Banner
          tone="muted"
          icon={<WalletIcon />}
          title="We haven't confirmed a payment for this entry"
          action={
            day.status === 'closed' ? (
              <Button asChild variant="outline" size="sm">
                <Link href={payHref}>Payment details</Link>
              </Button>
            ) : undefined
          }
        >
          <p>
            {day.status === 'closed'
              ? `If you sent ${fee} before picks closed, tell us so we can find it.`
              : 'Without a confirmed payment, these picks did not count.'}
          </p>
        </Banner>
      );
    case 'payment_review':
      return (
        <Banner
          tone="muted"
          icon={<HourglassIcon />}
          title="We're checking your payment"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={payHref}>View payment</Link>
            </Button>
          }
        >
          <p>
            Thanks for letting us know. We confirm it as soon as we find the money in our account.
          </p>
          <p>{FAIRNESS_NOTE}</p>
        </Banner>
      );
    case 'confirmed':
      return (
        <Banner
          tone="success"
          icon={<CircleCheckIcon className="text-success" />}
          title="You're in"
        >
          <p>
            Payment confirmed
            {entry.creditedAt ? `. Your money reached us ${formatMoment(entry.creditedAt)}` : ''}.
            Good luck!
          </p>
        </Banner>
      );
    case 'expired':
      return (
        <Banner tone="muted" icon={<HourglassIcon />} title="Your payment wasn't confirmed in time">
          <p>
            So these picks don&apos;t count. If you did pay, email {product.supportEmail} with your
            reference <span className="font-mono font-bold">{entry.paymentReference}</span>.
          </p>
        </Banner>
      );
    case 'refunded':
      return (
        <Banner
          tone="muted"
          icon={<WalletIcon />}
          title="Your entry fee was refunded"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/me">See refunds</Link>
            </Button>
          }
        />
      );
    default:
      return null;
  }
}

/** What the day itself is doing when picks can't be changed. */
export function DayStateBanner({ day }: { day: DayData }) {
  switch (day.status) {
    case 'published':
      return (
        <Banner tone="muted" icon={<CalendarClockIcon />} title="Picks open soon">
          <p>
            {day.opensAt
              ? `This day opens ${formatMoment(day.opensAt)}.`
              : 'Check back when this day opens.'}
          </p>
        </Banner>
      );
    case 'closed':
      return (
        <Banner
          tone="muted"
          icon={<LockIcon />}
          title="Picks are closed"
          action={
            <Button asChild variant="outline" size="sm">
              <Link href={`/leaderboard/${day.date}`}>Leaderboard</Link>
            </Button>
          }
        >
          <p>Results are coming in. The leaderboard updates as each one is confirmed.</p>
        </Banner>
      );
    case 'finalized':
    case 'completed':
      return (
        <Banner
          tone="muted"
          icon={<TrophyIcon />}
          title="Winners confirmed"
          action={
            <Button asChild size="sm">
              <Link href={`/leaderboard/${day.date}`}>See the leaderboard</Link>
            </Button>
          }
        />
      );
    case 'cancelled':
      return (
        <Banner tone="danger" icon={<BanIcon />} title="This day was cancelled">
          <p>Everyone who paid gets a full refund. You&apos;ll find it under Me.</p>
        </Banner>
      );
    default:
      return null;
  }
}
