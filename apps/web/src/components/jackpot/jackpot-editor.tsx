'use client';

import { CATEGORY_LABELS, type Category } from '@predict/contracts';
import { Alert } from '@predict/ui/alert';
import { Button } from '@predict/ui/button';
import { Card } from '@predict/ui/card';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@predict/ui/dialog';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Kicker } from '@/components/ui/text';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import type { JackpotData, MyJackpotData, TeamData } from '@/lib/types';
import { SortableTable } from './sortable-table';

type Tables = JackpotData['tables'];
type Orders = Partial<Record<Category, TeamData[]>>;

/** The submitted order where there is one (unknown teams dropped, new teams added at the end). */
export function initialOrders(tables: Tables, saved: MyJackpotData['orders']): Orders {
  const orders: Orders = {};
  for (const table of tables) {
    const byId = new Map(table.teams.map((team) => [team.id, team]));
    const savedIds = saved?.[table.category] ?? [];
    const placed = savedIds.flatMap((id) => {
      const team = byId.get(id);
      return team ? [team] : [];
    });
    const placedIds = new Set(placed.map((team) => team.id));
    orders[table.category] = [...placed, ...table.teams.filter((team) => !placedIds.has(team.id))];
  }
  return orders;
}

const idsOf = (teams: readonly TeamData[] | undefined) => (teams ?? []).map((team) => team.id);

/**
 * Drag both tables into the order you think they'll finish, then save. With tables already saved
 * this changes them (until entries close), which resets the saved time that breaks ties.
 */
export function JackpotEditor({
  tables,
  mine,
  onDone,
}: {
  tables: Tables;
  mine: MyJackpotData;
  /** Back to the saved tables: after saving a change, or on cancel. */
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<Orders>(() => initialOrders(tables, mine.orders));
  const [confirming, setConfirming] = useState(false);
  const changing = mine.orders !== null;
  const saved = initialOrders(tables, mine.orders);
  const edited = (['men', 'women'] as const).some(
    (category) => idsOf(orders[category]).join() !== idsOf(saved[category]).join(),
  );

  const submit = useMutation(
    api.jackpot.submit.mutationOptions({
      onSuccess: (updated) => {
        setConfirming(false);
        queryClient.setQueryData(api.jackpot.mine.queryKey(), updated);
        void queryClient.invalidateQueries({ queryKey: api.jackpot.key() });
        onDone?.();
      },
    }),
  );

  return (
    <Card className="gap-5">
      <div className="flex flex-col gap-1">
        <Kicker>your prediction</Kicker>
        <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">
          {changing ? 'change your tables' : 'the final tables'}
        </h2>
        <p className="text-sm text-muted-foreground">
          Drag teams by the handle, or use the arrows. 1st is the top of the table. You can change
          your prediction until entries close.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {tables.map((table) => (
          <section key={table.category} className="flex flex-col gap-3">
            <h3 className="font-extrabold">{CATEGORY_LABELS[table.category]}</h3>
            <SortableTable
              id={`jackpot-${table.category}`}
              label={`${CATEGORY_LABELS[table.category]} table, your order`}
              teams={orders[table.category] ?? []}
              onChange={(teams) =>
                setOrders((previous) => ({ ...previous, [table.category]: teams }))
              }
            />
          </section>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          className="w-fit"
          disabled={changing && !edited}
          onClick={() => setConfirming(true)}
        >
          {changing ? 'Save changes' : 'Submit my prediction'}
        </Button>
        {changing && onDone ? (
          <Button size="lg" variant="outline" className="w-fit" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!submit.isPending) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {changing ? 'Save your new tables?' : 'Submit your prediction?'}
          </DialogTitle>
          <DialogDescription>
            {changing
              ? 'This replaces your saved tables, and your saved time becomes now. If players end up equally close, whoever saved first wins.'
              : 'You can change it until entries close. If players end up equally close, whoever saved their final tables first wins, so a later change resets your time.'}
          </DialogDescription>
          {submit.isError ? (
            <Alert variant="destructive">{errorMessage(submit.error)}</Alert>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <DialogClose asChild>
              <Button variant="outline" disabled={submit.isPending}>
                Keep editing
              </Button>
            </DialogClose>
            <Button
              disabled={submit.isPending}
              onClick={() =>
                submit.mutate({
                  orders: { men: idsOf(orders.men), women: idsOf(orders.women) },
                })
              }
            >
              {submit.isPending ? 'Saving…' : changing ? 'Save changes' : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
