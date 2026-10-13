'use client';

import { Button } from '@predict/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@predict/ui/card';
import { Input } from '@predict/ui/input';
import { Label } from '@predict/ui/label';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { can, useAdmin } from '@/components/admin-shell';
import { DayConfigEditor, DayConfigSummary } from '@/components/day-config-editor';
import { ErrorAlert } from '@/components/error-alert';
import { Callout } from '@/components/ui/callout';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatWat } from '@/lib/format';
import type { AdminDay } from '@/lib/types';
import { useApplyDay } from './day-actions';

export function SettingsTab({ day }: { day: AdminDay }) {
  const admin = useAdmin();
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const isOps = can(admin, 'operations');
  const beforeOpen = day.status === 'draft' || day.status === 'published';
  const playable = day.matches.filter((match) => match.status !== 'void').length;

  return (
    <div className="flex flex-col gap-4">
      <TitleCard day={day} canEdit={isOps && day.status !== 'cancelled'} />
      <Card>
        <CardHeader>
          <CardTitle>Money and scoring</CardTitle>
          <CardDescription>
            {beforeOpen
              ? 'Copied from the league when the day was created. Change them here until the day opens.'
              : `Frozen when the day opened${day.openedAt ? ` (${formatWat(day.openedAt)})` : ''}. Players agreed to these rules.`}
          </CardDescription>
        </CardHeader>
        {beforeOpen && isOps ? (
          <DayConfigEditor
            value={day.config}
            matchCount={playable}
            saveLabel="Save day settings"
            footnote="Only this day changes. The league's defaults stay as they are."
            onSave={(config) =>
              api.admin.days.update.call({ id: day.id, config }).then((data) => {
                applyDay(data);
                toast({ title: 'Day settings saved' });
              })
            }
          />
        ) : (
          <>
            {beforeOpen ? (
              <Callout variant="info">
                Only operations staff and super admins can change these.
              </Callout>
            ) : null}
            <DayConfigSummary config={day.config} />
          </>
        )}
      </Card>
    </div>
  );
}

function TitleCard({ day, canEdit }: { day: AdminDay; canEdit: boolean }) {
  const toast = useToast();
  const applyDay = useApplyDay(day.id);
  const [title, setTitle] = useState(day.title ?? '');
  const update = useMutation(
    api.admin.days.update.mutationOptions({
      onSuccess: (data) => {
        applyDay(data);
        toast({ title: 'Title saved' });
      },
    }),
  );
  const changed = title.trim() !== (day.title ?? '');

  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed) update.mutate({ id: day.id, title: title.trim() || null });
        }}
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="day-title">Title</Label>
          <p className="text-xs text-muted-foreground">
            Optional, shown to players, e.g. &ldquo;Opening day&rdquo; or &ldquo;Semi-finals&rdquo;.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="day-title"
            value={title}
            maxLength={80}
            disabled={!canEdit}
            onChange={(event) => setTitle(event.target.value)}
          />
          {canEdit ? (
            <Button type="submit" variant="outline" disabled={!changed || update.isPending}>
              {update.isPending ? 'Saving…' : 'Save title'}
            </Button>
          ) : null}
        </div>
        <ErrorAlert error={update.error} />
      </form>
    </Card>
  );
}
