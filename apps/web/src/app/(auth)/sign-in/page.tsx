'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { DisplayName, EmailInput, OtpCode, PhoneInput } from '@predict/contracts';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AuthHeading } from '@/components/auth-heading';
import { Turnstile, turnstileEnabled } from '@/components/turnstile';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { safeNextPath } from '@/lib/safe-next';

type Step =
  | { name: 'email' }
  | { name: 'code'; email: string; resendAt: number; devCode?: string }
  | { name: 'profile'; email: string; signupTicket: string };

const EmailForm = z.object({ email: EmailInput });
const CodeForm = z.object({ code: OtpCode });
const ProfileForm = z.object({
  displayName: DisplayName,
  phone: PhoneInput,
  confirmAdult: z.boolean().refine(Boolean, { error: 'You must be 18 or older to play.' }),
  acceptTerms: z.boolean().refine(Boolean, { error: 'Please accept the rules and terms.' }),
});

/** Seconds left until `at` (ms), ticking once a second. */
function useCountdown(at: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!at) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [at]);
  return at ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

function EmailStep({
  onSent,
}: {
  onSent: (email: string, resendAfterSec: number, devCode?: string) => void;
}) {
  const form = useForm<z.input<typeof EmailForm>, unknown, z.output<typeof EmailForm>>({
    resolver: zodResolver(EmailForm),
    defaultValues: { email: '' },
  });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const request = useMutation(
    api.auth.requestOtp.mutationOptions({
      onSuccess: (result) => onSent(result.email, result.resendAfterSec, result.devCode),
      // Each bot-check token works once: get a fresh one after a failed attempt.
      onError: () => setCaptchaRound((round) => round + 1),
    }),
  );
  const waitingForCheck = turnstileEnabled && !captchaToken;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        request.mutate({ ...values, captchaToken: captchaToken ?? undefined }),
      )}
    >
      {request.isError ? <Alert variant="destructive">{errorMessage(request.error)}</Alert> : null}
      <Field
        label="Email address"
        hint="We'll email you a 6-digit code. No password needed."
        error={form.formState.errors.email?.message}
      >
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          autoFocus
          {...form.register('email')}
        />
      </Field>
      <Turnstile onToken={setCaptchaToken} resetKey={captchaRound} />
      <Button type="submit" size="lg" disabled={request.isPending || waitingForCheck}>
        {request.isPending ? 'Sending code…' : 'Email me a code'}
      </Button>
    </form>
  );
}

function CodeStep({
  email,
  resendAt,
  devCode,
  onResent,
  onChangeEmail,
  onVerified,
}: {
  email: string;
  resendAt: number;
  devCode?: string;
  onResent: (resendAfterSec: number, devCode?: string) => void;
  onChangeEmail: () => void;
  onVerified: (
    outcome: { status: 'signed_in' } | { status: 'needs_profile'; signupTicket: string },
  ) => void;
}) {
  const secondsLeft = useCountdown(resendAt);
  const form = useForm<z.infer<typeof CodeForm>>({
    resolver: zodResolver(CodeForm),
    defaultValues: { code: '' },
  });
  const verify = useMutation(api.auth.verifyOtp.mutationOptions({ onSuccess: onVerified }));
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRound, setCaptchaRound] = useState(0);
  const resend = useMutation(
    api.auth.requestOtp.mutationOptions({
      onSuccess: (r) => onResent(r.resendAfterSec, r.devCode),
      onSettled: () => setCaptchaRound((round) => round + 1),
    }),
  );
  const submit = form.handleSubmit(({ code }) => verify.mutate({ email, code }));

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={submit}>
      {verify.isError ? <Alert variant="destructive">{errorMessage(verify.error)}</Alert> : null}
      {resend.isError ? <Alert variant="destructive">{errorMessage(resend.error)}</Alert> : null}
      {devCode ? (
        <Alert>
          Local development, no email sent. Your code is{' '}
          <span className="font-mono font-semibold tracking-widest">{devCode}</span>
        </Alert>
      ) : null}
      <Field label="6-digit code" error={form.formState.errors.code?.message}>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          className="text-center font-mono text-2xl tracking-[8px]"
          {...form.register('code', {
            onChange: (event: { target: { value: string } }) => {
              const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
              form.setValue('code', digits);
              if (digits.length === 6 && !verify.isPending) void submit();
            },
          })}
        />
      </Field>
      <Button type="submit" size="lg" disabled={verify.isPending}>
        {verify.isPending ? 'Checking…' : 'Continue'}
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          className="font-semibold underline underline-offset-4"
          onClick={onChangeEmail}
        >
          Change email
        </button>
        <button
          type="button"
          className="font-semibold underline underline-offset-4 disabled:no-underline disabled:opacity-50"
          disabled={secondsLeft > 0 || resend.isPending || (turnstileEnabled && !captchaToken)}
          onClick={() => resend.mutate({ email, captchaToken: captchaToken ?? undefined })}
        >
          {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
        </button>
      </div>
      {secondsLeft === 0 ? <Turnstile onToken={setCaptchaToken} resetKey={captchaRound} /> : null}
    </form>
  );
}

function ProfileStep({ signupTicket, onDone }: { signupTicket: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const form = useForm<z.infer<typeof ProfileForm>>({
    resolver: zodResolver(ProfileForm),
    defaultValues: { displayName: '', phone: '', confirmAdult: false, acceptTerms: false },
  });
  const complete = useMutation(
    api.auth.completeSignup.mutationOptions({
      onSuccess: (session) => {
        queryClient.setQueryData(api.auth.session.queryKey(), session);
        onDone();
      },
    }),
  );
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={form.handleSubmit((values) =>
        complete.mutate({
          signupTicket,
          displayName: values.displayName,
          phone: values.phone,
          confirmAdult: true,
          acceptTerms: true,
        }),
      )}
    >
      {complete.isError ? (
        <Alert variant="destructive">{errorMessage(complete.error)}</Alert>
      ) : null}
      <Field
        label="Display name"
        hint="Shown on leaderboards. Your email and phone number are never shown."
        error={errors.displayName?.message}
      >
        <Input autoComplete="nickname" autoFocus {...form.register('displayName')} />
      </Field>
      <Field
        label="Phone number"
        hint="So we can reach you if you win. Nigerian numbers only, one account per number."
        error={errors.phone?.message}
      >
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0803 123 4567"
          {...form.register('phone')}
        />
      </Field>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-sg-night"
          {...form.register('confirmAdult')}
        />
        <span>
          I am 18 or older.
          {errors.confirmAdult ? (
            <span className="block text-xs text-destructive">{errors.confirmAdult.message}</span>
          ) : null}
        </span>
      </label>
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-sg-night"
          {...form.register('acceptTerms')}
        />
        <span>
          I accept the{' '}
          <Link
            href="/rules"
            target="_blank"
            className="font-semibold underline underline-offset-2"
          >
            rules
          </Link>{' '}
          and{' '}
          <Link
            href="/terms"
            target="_blank"
            className="font-semibold underline underline-offset-2"
          >
            terms
          </Link>
          .
          {errors.acceptTerms ? (
            <span className="block text-xs text-destructive">{errors.acceptTerms.message}</span>
          ) : null}
        </span>
      </label>
      <Button type="submit" size="lg" disabled={complete.isPending}>
        {complete.isPending ? 'Creating your account…' : 'Start playing'}
      </Button>
    </form>
  );
}

function SignInFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>({ name: 'email' });
  const next = safeNextPath(params.get('next'), '/play');
  const done = () => router.replace(next);

  if (step.name === 'email') {
    return (
      <>
        <AuthHeading title="sign in or join">
          One account per person. New here? We&apos;ll set you up after the code.
        </AuthHeading>
        <EmailStep
          onSent={(email, resendAfterSec, devCode) =>
            setStep({
              name: 'code',
              email,
              resendAt: Date.now() + resendAfterSec * 1000,
              devCode,
            })
          }
        />
      </>
    );
  }

  if (step.name === 'code') {
    return (
      <>
        <AuthHeading title="check your email">
          We sent a code to <span className="font-semibold text-foreground">{step.email}</span>. It
          can take a minute; check your spam folder too.
        </AuthHeading>
        <CodeStep
          email={step.email}
          resendAt={step.resendAt}
          devCode={step.devCode}
          onResent={(sec, devCode) =>
            setStep({ ...step, resendAt: Date.now() + sec * 1000, devCode })
          }
          onChangeEmail={() => setStep({ name: 'email' })}
          onVerified={(outcome) => {
            if (outcome.status === 'needs_profile') {
              setStep({ name: 'profile', email: step.email, signupTicket: outcome.signupTicket });
            } else {
              void queryClient.invalidateQueries({ queryKey: api.auth.session.queryKey() });
              done();
            }
          }}
        />
      </>
    );
  }

  return (
    <>
      <AuthHeading title="one last step">
        Pick the name other players will see, and add your phone number.
      </AuthHeading>
      <ProfileStep signupTicket={step.signupTicket} onDone={done} />
    </>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInFlow />
    </Suspense>
  );
}
