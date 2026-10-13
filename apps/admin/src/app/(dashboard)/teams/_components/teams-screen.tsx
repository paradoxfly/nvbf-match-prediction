'use client';

import { CATEGORY_LABELS, type Category } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import { Dialog, DialogContent, DialogTrigger } from '@predict/ui/dialog';
import { Field } from '@predict/ui/field';
import { Input } from '@predict/ui/input';
import { Select } from '@predict/ui/select';
import { EmptyState } from '@predict/ui/states';
import { cn } from '@predict/ui/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, Plus, Users } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactElement } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { LogoUpload, type UploadedLogo } from '@/components/logo-upload';
import { PageHeader } from '@/components/page-header';
import { QueryState } from '@/components/query-state';
import { TeamLogo } from '@/components/team-logo';
import { Callout } from '@/components/ui/callout';
import { DialogForm } from '@/components/ui/dialog-form';
import { SwitchField } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import type { Team } from '@/lib/types';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export function TeamsScreen() {
  const admin = useAdmin();
  const canEdit = can(admin, 'operations');
  const [category, setCategory] = useState<Category>('men');
  const [showArchived, setShowArchived] = useState(false);
  const teams = useQuery(
    api.admin.teams.list.queryOptions({
      input: showArchived ? { includeArchived: true } : {},
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Setup"
        title="teams"
        description="Every team that can play in a league, with its logo. Create them ahead of time; archive teams that no longer play."
        actions={
          canEdit ? (
            <TeamDialog
              defaultCategory={category}
              trigger={
                <Button>
                  <Plus aria-hidden />
                  New team
                </Button>
              }
            />
          ) : null
        }
      />
      <Tabs value={category} onValueChange={(value) => setCategory(value as Category)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Category">
            {CATEGORIES.map((item) => (
              <TabsTrigger
                key={item}
                value={item}
                count={teams.data?.items.filter((team) => team.category === item).length ?? null}
              >
                {CATEGORY_LABELS[item]}
              </TabsTrigger>
            ))}
          </TabsList>
          <SwitchField
            label="Show archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
            className="items-center"
          />
        </div>
        {CATEGORIES.map((item) => (
          <TabsContent key={item} value={item}>
            <QueryState query={teams}>
              {(data) => {
                const list = data.items.filter((team) => team.category === item);
                if (list.length === 0) {
                  return (
                    <EmptyState
                      icon={<Users className="size-6" />}
                      title={`No ${CATEGORY_LABELS[item].toLowerCase()}'s teams yet`}
                      description="Add teams with their short names and logos before building a league."
                    />
                  );
                }
                return (
                  <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {list.map((team) => (
                      <li key={team.id}>
                        <TeamCard team={team} canEdit={canEdit} />
                      </li>
                    ))}
                  </ul>
                );
              }}
            </QueryState>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TeamCard({ team, canEdit }: { team: Team; canEdit: boolean }) {
  return (
    <Card className={cn('flex-row items-center gap-4 p-4', team.archived && 'opacity-70')}>
      <TeamLogo name={team.name} logoUrl={team.logoUrl} size="lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate font-bold">{team.name}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold tracking-[1px]">{team.shortName}</span>
          {team.archived ? <Badge variant="muted">Archived</Badge> : null}
        </div>
      </div>
      {canEdit ? (
        <TeamDialog
          team={team}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${team.name}`}>
              <Pencil aria-hidden />
            </Button>
          }
        />
      ) : null}
    </Card>
  );
}

function TeamDialog({
  team,
  defaultCategory = 'men',
  trigger,
}: {
  team?: Team;
  defaultCategory?: Category;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <TeamForm team={team} defaultCategory={defaultCategory} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const SHORT_NAME = /^[A-Za-z0-9.&' -]+$/;

function TeamForm({
  team,
  defaultCategory,
  onDone,
}: {
  team?: Team;
  defaultCategory: Category;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const isSuper = can(useAdmin());
  const [name, setName] = useState(team?.name ?? '');
  const [shortName, setShortName] = useState(team?.shortName ?? '');
  const [category, setCategory] = useState<Category>(team?.category ?? defaultCategory);
  const [logo, setLogo] = useState<UploadedLogo | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [touched, setTouched] = useState(false);

  const nameError =
    name.trim().length < 2
      ? 'Use at least 2 characters.'
      : name.trim().length > 60
        ? 'Use at most 60 characters.'
        : undefined;
  const shortError =
    shortName.trim().length < 2 || shortName.trim().length > 8
      ? 'Use 2 to 8 characters, e.g. KPV.'
      : !SHORT_NAME.test(shortName.trim())
        ? 'Letters and numbers only.'
        : undefined;

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.admin.teams.key() }),
      queryClient.invalidateQueries({ queryKey: api.admin.leagues.key() }),
      queryClient.invalidateQueries({ queryKey: api.admin.days.key() }),
    ]);

  const create = useMutation(
    api.admin.teams.create.mutationOptions({
      onSuccess: async (created) => {
        await invalidate();
        toast({ title: `${created.name} added` });
        onDone();
      },
    }),
  );
  const update = useMutation(
    api.admin.teams.update.mutationOptions({
      onSuccess: async (updated) => {
        await invalidate();
        toast({ title: `${updated.name} saved` });
        onDone();
      },
    }),
  );
  const archive = useMutation(
    api.admin.teams.update.mutationOptions({
      onSuccess: async (updated) => {
        await invalidate();
        toast({
          title: updated.archived ? `${updated.name} archived` : `${updated.name} restored`,
        });
        onDone();
      },
    }),
  );
  const pending = create.isPending || update.isPending;

  function submit() {
    setTouched(true);
    if (nameError || shortError || uploading) return;
    if (team) {
      update.mutate({
        id: team.id,
        name: name.trim(),
        shortName: shortName.trim(),
        logoMediaId: logo ? logo.mediaId : removeLogo ? null : undefined,
      });
    } else {
      create.mutate({
        name: name.trim(),
        shortName: shortName.trim(),
        category,
        logoMediaId: logo?.mediaId ?? null,
      });
    }
  }

  return (
    <DialogForm
      title={team ? `Edit ${team.name}` : 'New team'}
      description={
        team
          ? `${CATEGORY_LABELS[team.category]}'s team. The category can't change once created.`
          : 'Teams are matched by name or short name when you import fixtures.'
      }
      submitLabel={team ? 'Save team' : 'Create team'}
      pending={pending}
      canSubmit={!uploading}
      error={create.error ?? update.error ?? archive.error}
      onSubmit={submit}
    >
      <Field label="Name" error={touched ? nameError : undefined}>
        <Input value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Short name"
          hint="Shown on small screens, e.g. KPV."
          error={touched ? shortError : undefined}
        >
          <Input
            value={shortName}
            maxLength={8}
            className="font-mono uppercase"
            onChange={(event) => setShortName(event.target.value.toUpperCase())}
          />
        </Field>
        {team ? null : (
          <Field label="Category">
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value as Category)}
            >
              {CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {CATEGORY_LABELS[item]}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Logo</span>
        <LogoUpload
          kind="team_logo"
          name={name}
          currentUrl={team?.logoUrl}
          value={logo}
          onChange={(next) => {
            setLogo(next);
            if (next) setRemoveLogo(false);
          }}
          removed={removeLogo}
          onRemove={team?.logoUrl ? () => setRemoveLogo(true) : undefined}
          onBusyChange={setUploading}
        />
        {removeLogo ? (
          <p className="text-xs text-muted-foreground">
            The logo will be removed when you save.{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setRemoveLogo(false)}
            >
              Keep it
            </button>
          </p>
        ) : null}
      </div>
      {team && isSuper ? (
        <Link
          href={`/audit?targetType=team&targetId=${team.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <History className="size-4" aria-hidden />
          Change history
        </Link>
      ) : null}
      {team ? (
        <Callout variant="info">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {team.archived
                ? 'This team is archived: it is hidden from new leagues.'
                : 'Archive a team that no longer plays. Past matches keep it.'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={archive.isPending}
              onClick={() => archive.mutate({ id: team.id, archived: !team.archived })}
            >
              {archive.isPending ? 'Saving…' : team.archived ? 'Restore team' : 'Archive team'}
            </Button>
          </div>
        </Callout>
      ) : null}
    </DialogForm>
  );
}
