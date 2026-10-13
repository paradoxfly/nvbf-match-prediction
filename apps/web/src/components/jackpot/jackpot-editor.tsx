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

/** Drag both tables into the order you think they'll finish, then submit (once, for good). */
export function JackpotEditor({ tables, mine }: { tables: Tables; mine: MyJackpotData }) {
  const queryClient = useQueryClient();
  const [orders, setOrders] = useState<Orders>(() => initialOrders(tables, mine.orders));
  const [confirming, setConfirming] = useState(false);

  const submit = useMutation(
    api.jackpot.submit.mutationOptions({
      onSuccess: (updated) => {
        setConfirming(false);
        queryClient.setQueryData(api.jackpot.mine.queryKey(), updated);
        void queryClient.invalidateQueries({ queryKey: api.jackpot.key() });
      },
    }),
  );

  return (
    <Card className="gap-5">
      <div className="flex flex-col gap-1">
        <Kicker>your prediction</Kicker>
        <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">the final tables</h2>
        <p className="text-sm text-muted-foreground">
          Drag teams by the handle, or use the arrows. 1st is the top of the table. You can submit
          once, and it can&apos;t be changed afterwards.
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

      <Button size="lg" className="w-fit" onClick={() => setConfirming(true)}>
        Submit my prediction
      </Button>

      <Dialog
        open={confirming}
        onOpenChange={(open) => {
          if (!submit.isPending) setConfirming(open);
        }}
      >
        <DialogContent>
          <DialogTitle>Submit your prediction?</DialogTitle>
          <DialogDescription>
            Once you submit, your tables are final. Nobody can change them, not you and not us.
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
              {submit.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
