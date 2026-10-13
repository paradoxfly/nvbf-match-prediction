/**
 * Fills a local database with a demo league so the apps have something to show:
 * 12 placeholder teams (6 men's, 6 women's), a league from yesterday to 12 days ahead with two
 * rest days, six fixtures per day, a demo collection account, and today's day opened.
 * Uses the app's own services, so every rule (and the audit trail) applies.
 *
 *   node dist/scripts/seed-demo.js          (refuses to run when NODE_ENV=production)
 */
import '../instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { addDays, watDate, watTime } from '@predict/domain';
import { AppModule } from '../app.module';
import type { Actor } from '../common/audit.service';
import { DaysService } from '../setup/days.service';
import { LeaguesService } from '../setup/leagues.service';
import { SettingsService } from '../setup/settings.service';
import { TeamsService } from '../setup/teams.service';

const TEAMS = [
  ['Lagos Lions', 'LAG'],
  ['Abuja Eagles', 'ABJ'],
  ['Kano Spikers', 'KAN'],
  ['Rivers Waves', 'RIV'],
  ['Enugu Rangers', 'ENU'],
  ['Oyo Thunder', 'OYO'],
] as const;

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Not in production.');
  process.env.TICKER_INTERVAL_SEC = '0';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const system: Actor = { type: 'system' };
  try {
    const settings = app.get(SettingsService);
    const teamsService = app.get(TeamsService);
    const leagues = app.get(LeaguesService);
    const days = app.get(DaysService);

    await settings.update(system, {
      collectionAccount: {
        bankName: 'Demo Bank',
        accountNumber: '0000000000',
        accountName: 'DEMO - DO NOT PAY',
      },
    });

    const existing = await teamsService.list(undefined, true);
    const teamIds: Record<'men' | 'women', string[]> = { men: [], women: [] };
    for (const category of ['men', 'women'] as const) {
      for (const [name, shortName] of TEAMS) {
        const found = existing.find((t) => t.category === category && t.name === name);
        const team = found ?? (await teamsService.create(system, { name, shortName, category }));
        teamIds[category].push(team.id);
      }
    }

    const today = watDate(new Date());
    const start = addDays(today, -1);
    const end = addDays(today, 12);
    const league = await leagues.create(system, {
      name: `Demo League ${today}`,
      startDate: start,
      endDate: end,
      jackpotEntryClosesOn: addDays(today, 3),
      jackpotEntryClosesAt: '18:00',
    });
    await leagues.setTeams(system, league.id, [...teamIds.men, ...teamIds.women]);
    await leagues.activate(system, league.id);

    // Two rest days; six matches a day alternating men's and women's games.
    const restDays = new Set([addDays(today, 4), addDays(today, 9)]);
    const times = ['10:00', '11:30', '13:00', '14:30', '16:00', '17:30'];
    // Today's matches start from the next hour, so the demo day can be played right away.
    const nextHour = Math.min(Number(watTime(new Date()).slice(0, 2)) + 1, 20);
    const todayTimes = Array.from({ length: 6 }, (_, i) => {
      const minutes = nextHour * 60 + i * 30;
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    });
    const lines = ['date,time,category,home,away,venue'];
    for (let offset = 0; offset <= 12; offset++) {
      const date = addDays(today, offset);
      if (restDays.has(date)) continue;
      (offset === 0 ? todayTimes : times).forEach((time, i) => {
        const category = i % 2 === 0 ? 'men' : 'women';
        const home = TEAMS[(offset + i) % TEAMS.length]![0];
        const away = TEAMS[(offset + i + 3) % TEAMS.length]![0];
        lines.push(`${date},${time},${category},${home},${away},Demo Arena`);
      });
    }
    const imported = await leagues.importFixtures(system, league.id, lines.join('\n'), true);
    if (!imported.committed) {
      throw new Error(
        `Fixture import failed: ${JSON.stringify(imported.rows.filter((r) => r.error))}`,
      );
    }

    const view = await leagues.get(league.id);
    for (const day of view.days) {
      await days.publish(system, day.id);
      if (day.date === today) {
        try {
          await days.open(system, day.id);
        } catch (error) {
          console.warn(
            `Could not open today's day (matches may have started): ${(error as Error).message}`,
          );
        }
      }
    }
    console.warn(
      `Demo league ready: ${view.days.length} days from ${start} to ${end} (rest days: ${[...restDays].join(', ')}).`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exit(1);
});
