'use client';

import type { ContributionSource } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { ChoiceChips } from '@predict/ui/choice-chips';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { Textarea } from '@predict/ui/textarea';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, HandCoins, Plus, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { NairaInput } from '@/components/inputs';
import { LogoUpload, type UploadedLogo } from '@/components/logo-upload';
import { PageHeader } from '@/components/page-header';
import { NoAccess, QueryState } from '@/components/query-state';
import { ContributionStatusBadge } from '@/components/status-badges';
import { TeamLogo } from '@/components/team-logo';
import { Callout } from '@/components/ui/callout';
import { CheckboxField } from '@/components/ui/checkbox';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { DialogForm } from '@/components/ui/dialog-form';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import {
  formatDateTime,
  formatDay,
  formatNaira,
  formatShortDay,
  formatWat,
  parseNaira,
} from '@/lib/format';
import { invalidate } from '@/lib/invalidate';
import type { Contribution } from '@/lib/types';

const SOURCE_LABELS: Record<ContributionSource, string> = {
  sponsor: 'Sponsor',
  operator: 'Operator top-up',
  rollover: 'Rollover',
};

function useRefreshContributions() {
  const queryClient = useQueryClient();
  return () =>
    invalidate(
      queryClient,
      api.admin.contributions.key(),
      api.admin.days.key(),
      api.admin.leagues.key(),
      api.admin.jackpot.key(),
    );
}

export function ContributionsScreen() {
  const admin = useAdmin();
  const finance = can(admin, 'finance');
  const contributions = useQuery(
    api.admin.contributions.list.queryOptions({ input: {}, enabled: finance }),
  );

  if (!finance) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader kicker="Money" title="sponsors & top-ups" />
        <NoAccess what="sponsor money" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Money"
        title="sponsors & top-ups"
        description="Extra prize money for a match-day or a league jackpot. A pledge doesn't count until the money is in the account."
        actions={<NewContributionDialog />}
      />
      <QueryState query={contributions}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState
              icon={<HandCoins className="size-6" />}
              title="No sponsor money yet"
              description="Add a sponsor's contribution or an operator top-up to grow a day's pool or the jackpot."
            />
          ) : (
            <Card className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>For</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Sponsor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item) => (
                    <ContributionRow key={item.id} item={item} />
                  ))}
                </TableBody>
              </Table>
            </Card>
          )
        }
      </QueryState>
    </div>
  );
}

function ContributionRow({ item }: { item: Contribution }) {
  const toast = useToast();
  const refresh = useRefreshContributions();
  const allocate = useMutation(
    api.admin.contributions.allocate.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Money received', description: 'It now counts toward the pool.' });
      },
    }),
  );
  const giveBack = useMutation(
    api.admin.contributions.return.mutationOptions({
      onSuccess: () => {
        void refresh();
        toast({ title: 'Contribution returned' });
      },
    }),
  );

  return (
    <TableRow className={cn('align-top', item.status === 'returned' && 'opacity-60')}>
      <TableCell className="whitespace-nowrap">
        <Badge variant={item.source === 'sponsor' ? 'default' : 'muted'}>
          {SOURCE_LABELS[item.source]}
        </Badge>
        <span className="mt-1 block">
          {item.dayId ? (
            <Link
              href={`/days/${item.dayId}`}
              className="font-semibold underline-offset-4 hover:underline"
            >
              {item.dayDate ? formatShortDay(item.dayDate) : 'Match-day'}
            </Link>
          ) : (
            <span className="font-semibold">League jackpot</span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right font-mono font-bold">
        {formatNaira(item.amountKobo)}
      </TableCell>
      <TableCell>
        {item.sponsorName ? (
          <span className="flex items-center gap-2">
            <TeamLogo name={item.sponsorName} logoUrl={item.sponsorLogoUrl} size="sm" />
            <span className="flex flex-col">
              <span className="font-semibold">{item.sponsorName}</span>
              {item.sponsorUrl ? (
                <a
                  href={item.sponsorUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="max-w-48 truncate text-xs text-muted-foreground hover:underline"
                >
                  {item.sponsorUrl.replace(/^https?:\/\//, '')}
                </a>
              ) : null}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {item.note ? (
          <span className="mt-1 block max-w-60 text-xs text-muted-foreground">{item.note}</span>
        ) : null}
      </TableCell>
      <TableCell>
        <ContributionStatusBadge status={item.status} />
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
        <span className="block">Added {formatDateTime(item.createdAt)}</span>
        {item.allocatedAt ? (
          <span className="block">In pool {formatDateTime(item.allocatedAt)}</span>
        ) : null}
        {item.returnedAt ? (
          <span className="block">Returned {formatDateTime(item.returnedAt)}</span>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-end gap-1">
          {item.status === 'pledged' ? (
            <ConfirmAction
              trigger={
                <Button variant="outline" size="sm">
                  <BadgeCheck aria-hidden />
                  Money received
                </Button>
              }
              title="Has this money arrived?"
              description={`${formatNaira(item.amountKobo)} starts counting toward the guaranteed pool. Players see it as prize money.`}
              confirmLabel="Add to the pool"
              pendingLabel="Saving…"
              onConfirm={() => allocate.mutateAsync({ id: item.id })}
            />
          ) : null}
          {item.status !== 'returned' && item.source !== 'rollover' ? (
            <ConfirmAction
              trigger={
                <Button variant="ghost" size="sm">
                  <Undo2 aria-hidden />
                  {item.status === 'pledged' ? 'Withdraw' : 'Return'}
                </Button>
              }
              title={item.status === 'pledged' ? 'Withdraw this pledge?' : 'Return this money?'}
              description="Only possible before it's promised to players: a day's money is locked once the day opens, and jackpot money once entries close."
              confirmLabel={item.status === 'pledged' ? 'Withdraw pledge' : 'Return money'}
              pendingLabel="Saving…"
              destructive
              reason
              onConfirm={(reason) => giveBack.mutateAsync({ id: item.id, reason })}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

function NewContributionDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          New contribution
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <NewContributionForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const isWebsite = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

function NewContributionForm({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const refresh = useRefreshContributions();
  const [source, setSource] = useState<'sponsor' | 'operator'>('sponsor');
  const [target, setTarget] = useState<'day' | 'jackpot'>('day');
  const [dayId, setDayId] = useState('');
  const [leagueId, setLeagueId] = useState('');
  const [amount, setAmount] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [uploading, setUploading] = useState(false);
  const [website, setWebsite] = useState('');
  const [note, setNote] = useState('');
  const [received, setReceived] = useState(false);
  const [touched, setTouched] = useState(false);

  const days = useQuery(api.admin.days.list.queryOptions({ input: {} }));
  const leagues = useQuery(api.admin.leagues.list.queryOptions());
  const league = useQuery(
    api.admin.leagues.get.queryOptions({
      input: { id: leagueId },
      enabled: target === 'jackpot' && leagueId !== '',
    }),
  );
  const create = useMutation(
    api.admin.contributions.create.mutationOptions({
      onSuccess: (created) => {
        void refresh();
        toast({
          title: created.status === 'allocated' ? 'Added to the pool' : 'Pledge recorded',
          description:
            created.status === 'allocated' ? undefined : 'Mark it received when the money arrives.',
        });
        onDone();
      },
    }),
  );

  const openDays = [...(days.data?.items ?? [])]
    .filter((day) => !['finalized', 'completed', 'cancelled'].includes(day.status))
    .sort((a, b) => a.date.localeCompare(b.date));
  const jackpot = league.data?.jackpot ?? null;
  const jackpotClosed =
    jackpot !== null && (jackpot.status === 'settled' || jackpot.status === 'carried_over');
  const money = parseNaira(amount, { min: 100 });
  const websiteTrimmed = website.trim();

  const errors = {
    target:
      target === 'day'
        ? dayId
          ? undefined
          : 'Choose a match-day.'
        : !leagueId
          ? 'Choose a league.'
          : league.isPending
            ? 'Loading the jackpot…'
            : !jackpot
              ? 'That league has no jackpot.'
              : jackpotClosed
                ? 'That jackpot is already settled.'
                : undefined,
    amount: money.error,
    sponsorName:
      source === 'sponsor' && sponsorName.trim().length < 2
        ? 'Enter the sponsor’s name.'
        : undefined,
    website:
      websiteTrimmed && !isWebsite(websiteTrimmed)
        ? 'Use a full address, like https://example.com.'
        : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined) && !uploading;

  return (
    <DialogForm
      title="New contribution"
      description="Sponsor money stays where the sponsor committed it. Leave “Money received” off for a pledge: it isn't counted until it arrives."
      submitLabel={received ? 'Add to the pool' : 'Record pledge'}
      pendingLabel="Saving…"
      pending={create.isPending}
      canSubmit={!uploading}
      error={create.error}
      onSubmit={() => {
        setTouched(true);
        if (!valid || money.kobo === null) return;
        create.mutate({
          source,
          dayId: target === 'day' ? dayId : undefined,
          jackpotId: target === 'jackpot' ? jackpot?.id : undefined,
          amountKobo: money.kobo,
          sponsorName: source === 'sponsor' ? sponsorName.trim() : sponsorName.trim() || undefined,
          sponsorLogoMediaId: source === 'sponsor' ? logo?.mediaId : undefined,
          sponsorUrl: source === 'sponsor' && websiteTrimmed ? websiteTrimmed : undefined,
          note: note.trim() || undefined,
          received,
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">From</span>
        <ChoiceChips
          label="Source"
          options={[
            { value: 'sponsor', label: 'A sponsor' },
            { value: 'operator', label: 'Operator top-up' },
          ]}
          value={[source]}
          onChange={setSource}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">For</span>
        <ChoiceChips
          label="Target"
          options={[
            { value: 'day', label: 'A match-day' },
            { value: 'jackpot', label: 'A league jackpot' },
          ]}
          value={[target]}
          onChange={setTarget}
        />
      </div>
      {target === 'day' ? (
        <Field label="Match-day" error={touched ? errors.target : undefined}>
          <Select value={dayId} onChange={(event) => setDayId(event.target.value)}>
            <option value="">Choose a day</option>
            {openDays.map((day) => (
              <option key={day.id} value={day.id}>
                {formatDay(day.date)} · {day.leagueName}
              </option>
            ))}
          </Select>
        </Field>
      ) : (
        <Field
          label="League"
          error={touched ? errors.target : undefined}
          hint={
            jackpot
              ? `Jackpot entries close ${formatWat(jackpot.entryClosesAt)} · ${formatNaira(jackpot.guaranteedKobo)} guaranteed so far.`
              : undefined
          }
        >
          <Select value={leagueId} onChange={(event) => setLeagueId(event.target.value)}>
            <option value="">Choose a league</option>
            {leagues.data?.items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Amount" error={touched ? errors.amount : undefined}>
        <NairaInput value={amount} onChange={(event) => setAmount(event.target.value)} />
      </Field>
      {source === 'sponsor' ? (
        <>
          <Field label="Sponsor name" error={touched ? errors.sponsorName : undefined}>
            <Input
              value={sponsorName}
              maxLength={120}
              onChange={(event) => setSponsorName(event.target.value)}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Sponsor logo</span>
            <LogoUpload
              kind="sponsor_logo"
              name={sponsorName}
              value={logo}
              onChange={setLogo}
              onBusyChange={setUploading}
            />
          </div>
          <Field
            label="Website"
            hint="Optional. Shown with the logo."
            error={touched ? errors.website : undefined}
          >
            <Input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={website}
              maxLength={300}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </Field>
        </>
      ) : (
        <Field label="Name to show" hint="Optional, e.g. the operator's name.">
          <Input
            value={sponsorName}
            maxLength={120}
            onChange={(event) => setSponsorName(event.target.value)}
          />
        </Field>
      )}
      <Field label="Note" hint="Optional, for staff.">
        <Textarea
          value={note}
          maxLength={500}
          className="min-h-16"
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <CheckboxField
        label="Money received"
        description="Tick only when the money is in our account. It then counts toward the guaranteed pool."
        checked={received}
        onCheckedChange={setReceived}
      />
      {received ? (
        <Callout variant="warning">
          Once a day opens (or jackpot entries close), this money is promised to players and can no
          longer be returned.
        </Callout>
      ) : null}
    </DialogForm>
  );
}
