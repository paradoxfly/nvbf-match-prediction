'use client';

import { NIGERIAN_BANKS } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark } from 'lucide-react';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { DayConfigEditor, DayConfigSummary } from '@/components/day-config-editor';
import { ErrorAlert } from '@/components/error-alert';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { Callout } from '@/components/ui/callout';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Kicker } from '@/components/ui/stat';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/types';

export function SettingsScreen() {
  const admin = useAdmin();
  const settings = useQuery(api.admin.settings.get.queryOptions());
  const canEdit = can(admin);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Setup"
        title="settings"
        description={
          canEdit
            ? 'App-wide settings. Every change is logged.'
            : 'App-wide settings. Only a super admin can change them.'
        }
      />
      <QueryState query={settings}>
        {(data) => (
          <div className="flex flex-col gap-4">
            <CollectionAccountCard settings={data} canEdit={canEdit} />
            <div className="grid gap-4 lg:grid-cols-2">
              <EmailCard settings={data} canEdit={canEdit} />
              <SupportCard key={data.supportContact ?? ''} settings={data} canEdit={canEdit} />
            </div>
            <DefaultsCard settings={data} canEdit={canEdit} />
          </div>
        )}
      </QueryState>
    </div>
  );
}

function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation(
    api.admin.settings.update.mutationOptions({
      onSuccess: (data) => queryClient.setQueryData(api.admin.settings.get.queryKey(), data),
    }),
  );
}

function CollectionAccountCard({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const account = settings.collectionAccount;
  const [editing, setEditing] = useState(false);
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="size-5" aria-hidden />
            Collection bank account
          </CardTitle>
          <CardDescription>Where players send their entry fees.</CardDescription>
        </CardHeader>
        {canEdit && !editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            {account ? 'Change account' : 'Add account'}
          </Button>
        ) : null}
      </div>
      <Callout variant="warning" title="Players send real money here">
        Every change is logged with your name. Each match-day keeps the account it opened with, so a
        change only affects days that open after it.
      </Callout>
      {editing ? (
        <AccountForm settings={settings} onDone={() => setEditing(false)} />
      ) : account ? (
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt>
              <Kicker>Bank</Kicker>
            </dt>
            <dd className="font-semibold">{account.bankName}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt>
              <Kicker>Account number</Kicker>
            </dt>
            <dd className="font-mono text-lg font-bold tracking-[2px]">{account.accountNumber}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt>
              <Kicker>Account name</Kicker>
            </dt>
            <dd className="font-semibold">{account.accountName}</dd>
          </div>
        </dl>
      ) : (
        <Callout variant="danger">
          No account yet: match-days can&apos;t open until players have somewhere to pay.
        </Callout>
      )}
    </Card>
  );
}

function AccountForm({ settings, onDone }: { settings: Settings; onDone: () => void }) {
  const toast = useToast();
  const save = useSaveSettings();
  const current = settings.collectionAccount;
  const [bankName, setBankName] = useState(current?.bankName ?? '');
  const [accountNumber, setAccountNumber] = useState(current?.accountNumber ?? '');
  const [accountName, setAccountName] = useState(current?.accountName ?? '');
  const [confirming, setConfirming] = useState(false);
  const [touched, setTouched] = useState(false);

  const errors = {
    bankName: bankName.trim().length < 2 ? 'Enter the bank name.' : undefined,
    accountNumber: /^\d{10}$/.test(accountNumber)
      ? undefined
      : 'Use the 10-digit account number (NUBAN).',
    accountName:
      accountName.trim().length < 2
        ? 'Enter the account name exactly as the bank shows it.'
        : undefined,
  };
  const valid = Object.values(errors).every((error) => error === undefined);
  const unchanged =
    current !== null &&
    current.bankName === bankName.trim() &&
    current.accountNumber === accountNumber &&
    current.accountName === accountName.trim();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (valid && !unchanged) setConfirming(true);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Bank" error={touched ? errors.bankName : undefined}>
          <Input
            list="collection-banks"
            value={bankName}
            maxLength={80}
            onChange={(event) => setBankName(event.target.value)}
          />
        </Field>
        <datalist id="collection-banks">
          {NIGERIAN_BANKS.map((bank) => (
            <option key={bank.code} value={bank.name} />
          ))}
        </datalist>
        <Field label="Account number" error={touched ? errors.accountNumber : undefined}>
          <Input
            inputMode="numeric"
            autoComplete="off"
            maxLength={10}
            className="font-mono tracking-[2px]"
            value={accountNumber}
            onChange={(event) =>
              setAccountNumber(event.target.value.replace(/\D/g, '').slice(0, 10))
            }
          />
        </Field>
        <Field label="Account name" error={touched ? errors.accountName : undefined}>
          <Input
            value={accountName}
            maxLength={120}
            onChange={(event) => setAccountName(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={unchanged}>
          Save account
        </Button>
      </div>
      <ConfirmAction
        open={confirming}
        onOpenChange={setConfirming}
        title="Change where players pay?"
        description={`From now on, days that open will tell players to pay ${bankName.trim()} ${accountNumber} (${accountName.trim()}). Days already open keep their account. Double-check every digit.`}
        confirmLabel="Save account"
        pendingLabel="Saving…"
        onConfirm={() =>
          save
            .mutateAsync({
              collectionAccount: {
                bankName: bankName.trim(),
                accountNumber,
                accountName: accountName.trim(),
              },
            })
            .then(() => {
              toast({ title: 'Collection account saved' });
              onDone();
            })
        }
      />
    </form>
  );
}

function EmailCard({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const toast = useToast();
  const save = useSaveSettings();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emails</CardTitle>
      </CardHeader>
      <SwitchField
        label="Email players when their payment is confirmed"
        description="Uses one email per confirmed entry from your Zapiack plan. Players always see the status in the app."
        checked={settings.emailOnPaymentConfirmed}
        disabled={!canEdit || save.isPending}
        onCheckedChange={(checked) =>
          save.mutate(
            { emailOnPaymentConfirmed: checked },
            {
              onSuccess: () =>
                toast({ title: checked ? 'Confirmation emails on' : 'Confirmation emails off' }),
            },
          )
        }
      />
      <ErrorAlert error={save.error} />
    </Card>
  );
}

function SupportCard({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const toast = useToast();
  const save = useSaveSettings();
  const [value, setValue] = useState(settings.supportContact ?? '');
  const changed = value.trim() !== (settings.supportContact ?? '');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Support contact</CardTitle>
        <CardDescription>
          How players reach us about payments and prizes, e.g. a WhatsApp number or email. Shown in
          the rules.
        </CardDescription>
      </CardHeader>
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) {
            save.mutate(
              { supportContact: value.trim() || null },
              { onSuccess: () => toast({ title: 'Support contact saved' }) },
            );
          }
        }}
      >
        <Input
          aria-label="Support contact"
          value={value}
          maxLength={200}
          disabled={!canEdit}
          placeholder="e.g. WhatsApp 0801 234 5678"
          onChange={(event) => setValue(event.target.value)}
        />
        {canEdit ? (
          <Button type="submit" variant="outline" disabled={!changed || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        ) : null}
      </form>
      <ErrorAlert error={save.error} />
    </Card>
  );
}

function DefaultsCard({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Default day settings</CardTitle>
        <CardDescription>
          New leagues start with these. Each league then has its own defaults, and each day its own
          settings until it opens.
        </CardDescription>
      </CardHeader>
      {canEdit ? (
        <DayConfigEditor
          value={settings.defaultDayConfig}
          saveLabel="Save defaults"
          footnote="Existing leagues and days don't change."
          onSave={(defaultDayConfig) =>
            api.admin.settings.update.call({ defaultDayConfig }).then((data) => {
              queryClient.setQueryData(api.admin.settings.get.queryKey(), data);
              toast({ title: 'Default day settings saved' });
            })
          }
        />
      ) : (
        <DayConfigSummary config={settings.defaultDayConfig} />
      )}
    </Card>
  );
}
