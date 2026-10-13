'use client';

import { Card } from '@predict/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@predict/ui/table';
import { useState } from 'react';
import { Kicker } from '@/components/ui/text';
import { formatBps, formatNaira, ordinal } from '@/lib/format';
import type { DayData } from '@/lib/types';

const SHOWN = 10;

/** Prize per place if every place has a winner, from the day's published split. */
export function PrizeTable({ day }: { day: DayData }) {
  const [showAll, setShowAll] = useState(false);
  const tiers = day.settings.prizeTiersBps;
  const rows = showAll ? tiers : tiers.slice(0, SHOWN);
  const fewPlayers = day.pool.confirmedEntries < tiers.length;

  return (
    <Card>
      <div className="flex flex-col gap-1">
        <Kicker>{tiers.length === 1 ? 'winner takes all' : `top ${tiers.length} win`}</Kicker>
        <h2 className="text-xl leading-tight font-extrabold tracking-[-0.5px]">prize money</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-0">Place</TableHead>
            <TableHead className="text-right">Share</TableHead>
            <TableHead className="pr-0 text-right">Prize</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((bps, index) => (
            <TableRow key={index}>
              <TableCell className="py-2 pl-0 font-bold">{ordinal(index + 1)}</TableCell>
              <TableCell className="py-2 text-right font-mono text-muted-foreground">
                {formatBps(bps)}
              </TableCell>
              <TableCell className="py-2 pr-0 text-right font-mono font-bold">
                {formatNaira(day.pool.fullTableKobo[index] ?? 0)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {tiers.length > SHOWN ? (
        <button
          type="button"
          className="self-start text-sm font-semibold underline underline-offset-4"
          aria-expanded={showAll}
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll ? 'Show fewer places' : `Show all ${tiers.length} places`}
        </button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {day.pool.final
          ? 'These amounts are confirmed.'
          : 'Amounts grow with every confirmed payment.'}{' '}
        {fewPlayers
          ? 'If fewer players finish than there are prize places, the unused share is shared among the winners.'
          : 'Tied players share the prize money of the places they take up.'}
      </p>
    </Card>
  );
}
