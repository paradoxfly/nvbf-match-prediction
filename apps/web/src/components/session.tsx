'use client';

import type { SessionUser } from '@predict/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { api } from '@/lib/api';

/** True when the browser holds the non-secret "probably signed in" hint cookie. */
function hasSessionHint() {
  return typeof document !== 'undefined' && /(?:^|;\s*)pd_signed_in=/.test(document.cookie);
}

/**
 * The signed-in player, or null for visitors. Public pages use this to personalise without
 * forcing a sign-in. Skips the request entirely when there's no session hint cookie.
 */
export function useOptionalSession() {
  const query = useQuery({
    ...api.auth.session.queryOptions(),
    retry: false,
    enabled: hasSessionHint(),
  });
  return {
    user: query.data?.user ?? null,
    loading: query.isLoading && hasSessionHint(),
  };
}

const SessionContext = createContext<SessionUser | null>(null);

/** The signed-in player. Only usable inside <SessionGate>. */
export function useSessionUser(): SessionUser {
  const user = useContext(SessionContext);
  if (!user) throw new Error('useSessionUser must be used inside <SessionGate>');
  return user;
}

/**
 * Renders children only once the API confirms the session (refreshing it if needed);
 * otherwise sends the visitor to sign in and back here afterwards.
 */
export function SessionGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useQuery({ ...api.auth.session.queryOptions(), retry: false });

  useEffect(() => {
    if (session.isError) router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
  }, [session.isError, router, pathname]);

  if (!session.data) {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center" aria-busy="true">
        <span className="font-mono text-[10px] tracking-[2px] text-muted-foreground uppercase">
          loading
        </span>
      </div>
    );
  }

  return <SessionContext.Provider value={session.data.user}>{children}</SessionContext.Provider>;
}

export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return useMutation(
    api.auth.logout.mutationOptions({
      onSettled: () => {
        queryClient.clear();
        router.replace('/');
      },
    }),
  );
}
