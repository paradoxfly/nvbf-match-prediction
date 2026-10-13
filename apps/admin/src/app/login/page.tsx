'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AdminLoginInput } from '@predict/contracts';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Logo } from '@predict/ui/logo';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '@/lib/api';
import { errorCode, errorMessage } from '@/lib/errors';

function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  // Shown once the API says this account has two-step sign-in on.
  const [needsCode, setNeedsCode] = useState(false);
  const form = useForm<AdminLoginInput>({
    resolver: zodResolver(AdminLoginInput),
    defaultValues: { email: '', password: '', totpCode: undefined },
  });
  const login = useMutation(
    api.admin.auth.login.mutationOptions({
      onSuccess: (session) => {
        queryClient.setQueryData(api.admin.auth.session.queryKey(), session);
        router.replace(safeNext(params.get('next')));
      },
      onError: (error) => {
        if (errorCode(error) === 'TOTP_REQUIRED') setNeedsCode(true);
      },
    }),
  );
  const { errors } = form.formState;
  const showError = login.isError && errorCode(login.error) !== 'TOTP_REQUIRED';

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        login.mutate({ ...values, totpCode: values.totpCode || undefined }),
      )}
    >
      {showError ? <Alert variant="destructive">{errorMessage(login.error)}</Alert> : null}
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="username" {...form.register('email')} />
      </Field>
      <Field label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register('password')} />
      </Field>
      {needsCode ? (
        <Field label="Authenticator code" error={errors.totpCode?.message}>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            className="font-mono tracking-[6px]"
            {...form.register('totpCode')}
          />
        </Field>
      ) : null}
      <Button type="submit" size="lg" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center px-4 py-10">
      <Logo className="mb-8" />
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-card">
        <h1 className="mb-1 text-2xl font-black tracking-[-1px]">admin sign in</h1>
        <p className="mb-6 text-sm text-muted-foreground">Staff accounts only.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
