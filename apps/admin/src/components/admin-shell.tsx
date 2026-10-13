'use client';

import { product } from '@predict/brand';
import { ADMIN_ROLE_LABELS, type AdminRole, type AdminUser } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { Logo } from '@predict/ui/logo';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { MfaSetup } from '@/components/mfa-setup';
import { api } from '@/lib/api';

const AdminContext = createContext<AdminUser | null>(null);

/** The signed-in admin. Only usable inside <AdminShell>. */
export function useAdmin(): AdminUser {
  const admin = useContext(AdminContext);
  if (!admin) throw new Error('useAdmin must be used inside <AdminShell>');
  return admin;
}

/** True if the admin's role may do something restricted to `roles` (super admins always can). */
export function can(admin: Pick<AdminUser, 'role'>, ...roles: AdminRole[]) {
  return admin.role === 'super_admin' || roles.includes(admin.role);
}

interface NavItem {
  href: string;
  label: string;
  exact?: boolean;
  /** Roles that see this link (super admins see everything). Omit for everyone. */
  roles?: AdminRole[];
}

const NAV: NavItem[] = [
  { href: '/', label: 'Overview', exact: true },
  { href: '/days', label: 'Match-days' },
  { href: '/payments', label: 'Payments', roles: ['finance'] },
  { href: '/payouts', label: 'Payouts & refunds', roles: ['finance'] },
  { href: '/leagues', label: 'Leagues' },
  { href: '/teams', label: 'Teams' },
  { href: '/contributions', label: 'Sponsors & top-ups', roles: ['finance'] },
  { href: '/reports', label: 'Reports', roles: ['finance'] },
  { href: '/players', label: 'Players' },
  { href: '/audit', label: 'Audit log', roles: [] },
  { href: '/settings', label: 'Settings' },
];

/** Confirms the admin session (refreshing if needed), then renders the sidebar layout. */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const session = useQuery({ ...api.admin.auth.session.queryOptions(), retry: false });
  const signOut = useMutation(
    api.admin.auth.logout.mutationOptions({
      onSettled: () => {
        queryClient.clear();
        router.replace('/login');
      },
    }),
  );

  useEffect(() => {
    if (session.isError) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [session.isError, router, pathname]);

  if (!session.data) return <div className="min-h-dvh" aria-busy="true" />;
  const { admin } = session.data;
  const links = NAV.filter((item) => !item.roles || can(admin, ...item.roles));

  return (
    <AdminContext.Provider value={admin}>
      <div className="flex min-h-dvh flex-col bg-sg-surface/40 md:flex-row">
        <aside className="flex flex-col gap-4 border-b border-border bg-background p-4 md:sticky md:top-0 md:h-dvh md:w-60 md:gap-6 md:border-r md:border-b-0">
          <div className="flex items-center justify-between">
            <Link href="/" aria-label={`${product.name} admin`}>
              <Logo />
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              onClick={() => signOut.mutate({})}
            >
              Sign out
            </Button>
          </div>
          <nav className="flex gap-1 overflow-x-auto md:flex-col">
            {links.map((item) => {
              const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'rounded-sm px-3 py-2 text-sm font-semibold whitespace-nowrap hover:bg-muted',
                    active && 'bg-sg-night text-sg-flash hover:bg-sg-night',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden flex-col gap-2 md:flex">
            <p className="text-sm font-semibold">{admin.name}</p>
            <p className="font-mono text-[10px] tracking-[2px] text-muted-foreground uppercase">
              {ADMIN_ROLE_LABELS[admin.role]}
            </p>
            <Button variant="outline" size="sm" onClick={() => signOut.mutate({})}>
              Sign out
            </Button>
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 p-4 sm:p-8">
          {admin.mfaSetupRequired ? <MfaSetup /> : children}
        </main>
      </div>
    </AdminContext.Provider>
  );
}
