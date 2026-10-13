import { cn } from '@predict/ui/utils';
import { CheckIcon } from 'lucide-react';
import { formatMoment } from '@/lib/format';
import type { EntryData } from '@/lib/types';

type StepState = 'done' | 'current' | 'upcoming';

interface Step {
  title: string;
  detail: string | null;
  state: StepState;
}

function steps(entry: EntryData): Step[] {
  const claim = entry.latestClaim;
  const confirmed = entry.status === 'confirmed';
  const claimSent = confirmed || entry.status === 'payment_review';
  return [
    { title: 'Joined', detail: `Reference ${entry.paymentReference}`, state: 'done' },
    {
      title: 'Payment sent',
      detail:
        claim && claim.status !== 'rejected'
          ? `You told us ${formatMoment(claim.createdAt)}`
          : confirmed
            ? null
            : 'Waiting for your transfer',
      state: claimSent ? 'done' : 'current',
    },
    {
      title: 'Confirmed',
      detail: entry.confirmedAt
        ? formatMoment(entry.confirmedAt)
        : claimSent
          ? 'We are checking our account'
          : null,
      state: confirmed ? 'done' : claimSent ? 'current' : 'upcoming',
    },
  ];
}

/** Joined → payment sent → confirmed, with times where we have them. */
export function PaymentTimeline({ entry }: { entry: EntryData }) {
  return (
    <ol className="flex flex-col">
      {steps(entry).map((step, index, all) => (
        <li key={step.title} className="relative flex gap-3 pb-5 last:pb-0">
          {index < all.length - 1 ? (
            <span
              aria-hidden
              className={cn(
                'absolute top-7 bottom-0 left-[13px] w-0.5',
                step.state === 'done' ? 'bg-sg-night' : 'bg-border',
              )}
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              'relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2',
              step.state === 'done' && 'border-sg-night bg-sg-night text-sg-chalk',
              step.state === 'current' && 'border-sg-night bg-background',
              step.state === 'upcoming' && 'border-border bg-background',
            )}
          >
            {step.state === 'done' ? (
              <CheckIcon className="size-3.5" />
            ) : step.state === 'current' ? (
              <span className="size-2 animate-pulse rounded-full bg-sg-night" />
            ) : null}
          </span>
          <span className="flex flex-col pt-0.5">
            <span
              className={cn(
                'text-sm font-bold',
                step.state === 'upcoming' && 'text-muted-foreground',
              )}
            >
              {step.title}
              <span className="sr-only">
                {step.state === 'done'
                  ? ' (done)'
                  : step.state === 'current'
                    ? ' (in progress)'
                    : ' (not yet)'}
              </span>
            </span>
            {step.detail ? (
              <span className="text-xs text-muted-foreground">{step.detail}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
