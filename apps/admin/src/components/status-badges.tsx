import {
  DAY_STATUS_LABELS,
  type ContributionStatus,
  type DayStatus,
  type EntryStatus,
  type JackpotStatus,
  type LeagueStatus,
  type MatchStatus,
  type ObligationKind,
  type ObligationStatus,
  type ResultStatus,
} from '@predict/contracts';
import { Badge } from '@predict/ui/badge';

type Variant = 'default' | 'accent' | 'muted' | 'success' | 'destructive';

const DAY_VARIANTS: Record<DayStatus, Variant> = {
  draft: 'muted',
  published: 'muted',
  open: 'accent',
  closed: 'default',
  finalized: 'success',
  completed: 'success',
  cancelled: 'destructive',
};

export function DayStatusBadge({ status }: { status: DayStatus | string }) {
  const known = status in DAY_VARIANTS ? (status as DayStatus) : null;
  return (
    <Badge variant={known ? DAY_VARIANTS[known] : 'muted'}>
      {known ? DAY_STATUS_LABELS[known] : status}
    </Badge>
  );
}

/** Entry statuses in staff words (players see ENTRY_STATUS_LABELS). */
export const ENTRY_STATUS_STAFF: Record<EntryStatus, string> = {
  awaiting_payment: 'Awaiting payment',
  payment_review: 'Claim to check',
  confirmed: 'Confirmed',
  expired: 'Expired',
  refunded: 'Refunded',
};

const ENTRY_VARIANTS: Record<EntryStatus, Variant> = {
  awaiting_payment: 'muted',
  payment_review: 'accent',
  confirmed: 'success',
  expired: 'muted',
  refunded: 'muted',
};

export function EntryStatusBadge({ status }: { status: EntryStatus }) {
  return <Badge variant={ENTRY_VARIANTS[status]}>{ENTRY_STATUS_STAFF[status]}</Badge>;
}

/** Payout statuses in staff words (players see OBLIGATION_STATUS_LABELS). */
export const OBLIGATION_STATUS_STAFF: Record<ObligationStatus, string> = {
  awaiting_details: 'Awaiting details',
  ready: 'Ready',
  processing: 'In progress',
  paid: 'Paid',
  details_invalid: 'Invalid details',
  on_hold: 'On hold',
};

const OBLIGATION_VARIANTS: Record<ObligationStatus, Variant> = {
  awaiting_details: 'muted',
  ready: 'accent',
  processing: 'default',
  paid: 'success',
  details_invalid: 'destructive',
  on_hold: 'destructive',
};

export function ObligationStatusBadge({ status }: { status: ObligationStatus }) {
  return <Badge variant={OBLIGATION_VARIANTS[status]}>{OBLIGATION_STATUS_STAFF[status]}</Badge>;
}

export const OBLIGATION_KIND_LABELS: Record<ObligationKind, string> = {
  prize: 'Prize',
  refund: 'Refund',
  jackpot: 'Jackpot',
};

export function ObligationKindBadge({ kind }: { kind: ObligationKind }) {
  return (
    <Badge variant={kind === 'refund' ? 'muted' : 'default'}>{OBLIGATION_KIND_LABELS[kind]}</Badge>
  );
}

const LEAGUE_LABELS: Record<LeagueStatus, string> = {
  draft: 'Draft',
  active: 'Running',
  completed: 'Completed',
};

export function LeagueStatusBadge({ status }: { status: LeagueStatus }) {
  const variant: Variant =
    status === 'active' ? 'success' : status === 'draft' ? 'muted' : 'default';
  return <Badge variant={variant}>{LEAGUE_LABELS[status]}</Badge>;
}

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  pledged: 'Pledged',
  allocated: 'In the pool',
  returned: 'Returned',
};

export function ContributionStatusBadge({ status }: { status: ContributionStatus }) {
  const variant: Variant =
    status === 'allocated' ? 'success' : status === 'pledged' ? 'accent' : 'muted';
  return <Badge variant={variant}>{CONTRIBUTION_STATUS_LABELS[status]}</Badge>;
}

const RESULT_LABELS: Record<ResultStatus, string> = {
  provisional: 'Entered · not confirmed',
  confirmed: 'Confirmed',
  superseded: 'Replaced',
};

export function ResultStatusBadge({ status }: { status: ResultStatus }) {
  const variant: Variant =
    status === 'confirmed' ? 'success' : status === 'provisional' ? 'accent' : 'muted';
  return <Badge variant={variant}>{RESULT_LABELS[status]}</Badge>;
}

const JACKPOT_LABELS: Record<JackpotStatus, string> = {
  open: 'Taking entries',
  closed: 'Entries closed',
  settled: 'Settled',
  carried_over: 'Carried over',
};

export function JackpotStatusBadge({ status }: { status: JackpotStatus | string }) {
  const known = status in JACKPOT_LABELS ? (status as JackpotStatus) : null;
  const variant: Variant =
    known === 'open' ? 'accent' : known === 'settled' ? 'success' : known ? 'default' : 'muted';
  return <Badge variant={variant}>{known ? JACKPOT_LABELS[known] : status}</Badge>;
}

export function MatchStatusBadge({ status }: { status: MatchStatus }) {
  if (status === 'void') return <Badge variant="destructive">Void</Badge>;
  if (status === 'final') return <Badge variant="success">Result confirmed</Badge>;
  return <Badge variant="muted">Scheduled</Badge>;
}
