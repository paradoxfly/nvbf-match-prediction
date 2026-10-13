import { addDays, watDate } from '@predict/domain';
import { adminClient } from './admin';
import type { TestApp } from './test-app';

type Agent = ReturnType<TestApp['client']>;

export const COLLECTION_ACCOUNT = {
  bankName: 'Test Bank',
  accountNumber: '0123456789',
  accountName: 'Predict Collections Ltd',
};

export interface ContestSetup {
  admin: Agent;
  leagueId: string;
  dayId: string;
  /** The day's date (tomorrow in Lagos), so every match is still in the future. */
  date: string;
  teamIds: string[];
  matchIds: string[];
}

/** Today's date in Lagos, offset by `days`. */
export const watDay = (days = 0) => addDays(watDate(new Date()), days);

/**
 * A running league with four men's teams and one open day tomorrow (two matches, 16:00 and
 * 18:00 Lagos time), set up through the real admin API.
 */
export async function openContest(
  t: TestApp,
  options: { times?: string[]; open?: boolean } = {},
): Promise<ContestSetup> {
  const admin = await adminClient(t, 'super_admin');
  await admin
    .patch('/v1/admin/settings')
    .send({ collectionAccount: COLLECTION_ACCOUNT })
    .expect(200);

  const teamIds: string[] = [];
  for (const [name, shortName] of [
    ['Kano Pillars', 'KAN'],
    ['Nigeria Customs', 'CUS'],
    ['Police Strikers', 'POL'],
    ['Army Spikers', 'ARM'],
  ] as const) {
    const res = await admin
      .post('/v1/admin/teams')
      .send({ name, shortName, category: 'men' })
      .expect(200);
    teamIds.push(res.body.id);
  }

  const date = watDay(1);
  const league = await admin
    .post('/v1/admin/leagues')
    .send({
      name: 'Test League',
      startDate: watDay(0),
      endDate: watDay(14),
      jackpotEntryClosesOn: watDay(3),
      jackpotEntryClosesAt: '18:00',
    })
    .expect(200);
  const leagueId = league.body.id as string;
  await admin.put(`/v1/admin/leagues/${leagueId}/teams`).send({ teamIds }).expect(200);
  await admin.post(`/v1/admin/leagues/${leagueId}/activate`).send({}).expect(200);
  await admin
    .post(`/v1/admin/leagues/${leagueId}/days`)
    .send({ dates: [date] })
    .expect(200);
  const days = await admin.get(`/v1/admin/days?leagueId=${leagueId}`).expect(200);
  const dayId = days.body.items[0].id as string;

  const times = options.times ?? ['16:00', '18:00'];
  for (const [index, time] of times.entries()) {
    await admin
      .post(`/v1/admin/days/${dayId}/matches`)
      .send({
        homeTeamId: teamIds[(index * 2) % 4],
        awayTeamId: teamIds[(index * 2 + 1) % 4],
        time,
      })
      .expect(200);
  }
  await admin.post(`/v1/admin/days/${dayId}/publish`).send({}).expect(200);
  const opened =
    options.open === false
      ? await admin.get(`/v1/admin/days/${dayId}`).expect(200)
      : await admin.post(`/v1/admin/days/${dayId}/open`).send({}).expect(200);
  const matchIds = (opened.body.matches as Array<{ id: string }>).map((match) => match.id);
  return { admin, leagueId, dayId, date, teamIds, matchIds };
}

/** A transfer as finance would type it from the statement. */
export function transfer(
  overrides: Partial<{
    bankReference: string;
    amountKobo: number;
    creditedAt: Date;
    senderName: string;
  }> = {},
) {
  return {
    bankReference: overrides.bankReference ?? `NIP${Math.random().toString(36).slice(2, 12)}`,
    amountKobo: overrides.amountKobo ?? 50_000,
    creditedAt: (overrides.creditedAt ?? new Date()).toISOString(),
    senderName: overrides.senderName ?? 'ADA OBI',
  };
}
