'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { DisplayName } from '@predict/contracts';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSessionUser } from '@/components/session';
import { Kicker } from '@/components/ui/text';
import { api } from '@/lib/api';
import { errorCode, errorMessage } from '@/lib/errors';
import { formatPhone } from '@/lib/format';

const NameForm = z.object({ displayName: DisplayName });
type NameValues = z.infer<typeof NameForm>;

function ChangeNameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<NameValues>({
    resolver: zodResolver(NameForm),
    defaultValues: { displayName: current },
  });
  const update = useMutation(
    api.auth.updateProfile.mutationOptions({
      onSuccess: (session) => {
        queryClient.setQueryData(api.auth.session.queryKey(), session);
        onDone();
      },
      onError: (error) => {
        if (errorCode(error) === 'DISPLAY_NAME_TAKEN') {
          form.setError('displayName', { message: errorMessage(error) });
        }
      },
    }),
  );
  const taken = errorCode(update.error) === 'DISPLAY_NAME_TAKEN';

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={form.handleSubmit((values) => update.mutate(values))}
    >
      {update.isError && !taken ? (
        <Alert variant="destructive">{errorMessage(update.error)}</Alert>
      ) : null}
      <Field
        label="Display name"
        hint="Shown on leaderboards. 3 to 20 letters or numbers."
        error={form.formState.errors.displayName?.message}
      >
        <Input autoComplete="nickname" autoFocus {...form.register('displayName')} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save name'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Who you are: display name (editable), the email you sign in with and your phone number. */
export function ProfileCard() {
  const user = useSessionUser();
  const [editing, setEditing] = useState(false);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-2">
          <Kicker>your account</Kicker>
          <h1 className="text-3xl leading-none font-black tracking-[-1px] break-words">
            {user.displayName}
          </h1>
          <p className="flex flex-col text-sm text-muted-foreground">
            <span className="break-all">{user.email}</span>
            <span>
              <span className="font-mono">{formatPhone(user.phone)}</span> · only you can see these
            </span>
          </p>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change name
          </Button>
        ) : null}
      </div>
      {editing ? (
        <ChangeNameForm current={user.displayName} onDone={() => setEditing(false)} />
      ) : null}
    </Card>
  );
}
