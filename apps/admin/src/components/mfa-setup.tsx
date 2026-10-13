'use client';

import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

/**
 * Two-step sign-in setup, shown in place of every page until it's done (when required).
 * Scan the QR with an authenticator app, then confirm with a code.
 */
export function MfaSetup() {
  const queryClient = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const setup = useMutation(api.admin.auth.mfaSetup.mutationOptions());
  const enable = useMutation(
    api.admin.auth.mfaEnable.mutationOptions({
      onSuccess: (session) => queryClient.setQueryData(api.admin.auth.session.queryKey(), session),
    }),
  );

  const { mutate: start, data } = setup;
  useEffect(() => {
    start({});
  }, [start]);
  useEffect(() => {
    if (data) void QRCode.toDataURL(data.otpauthUrl, { margin: 1, width: 220 }).then(setQr);
  }, [data]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div>
        <h1 className="text-3xl leading-none font-black tracking-[-1px]">secure your account</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Staff accounts move money, so they need two-step sign-in. Scan the code with an
          authenticator app (Google Authenticator, 1Password, Authy), then enter the 6 digits it
          shows.
        </p>
      </div>
      <Card className="items-center">
        {setup.isError ? <Alert variant="destructive">{errorMessage(setup.error)}</Alert> : null}
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Authenticator QR code" width={220} height={220} />
        ) : (
          <div className="size-[220px] animate-pulse rounded-lg bg-muted" />
        )}
        {data ? (
          <p className="text-center text-xs text-muted-foreground">
            Can&apos;t scan? Enter this key:{' '}
            <span className="font-mono break-all">{data.secret}</span>
          </p>
        ) : null}
      </Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          enable.mutate({ code });
        }}
      >
        {enable.isError ? <Alert variant="destructive">{errorMessage(enable.error)}</Alert> : null}
        <Field label="6-digit code">
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            className="font-mono text-xl tracking-[6px]"
          />
        </Field>
        <Button type="submit" size="lg" disabled={code.length !== 6 || enable.isPending}>
          {enable.isPending ? 'Checking…' : 'Turn on two-step sign-in'}
        </Button>
      </form>
    </div>
  );
}
