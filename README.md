# scoutgram predict (working name)

A paid daily volleyball prediction contest for Nigerian fans, plus a league jackpot. It runs under scoutgram.africa.

- **Daily contest:** each match-day, players pay a small entry fee by bank transfer and predict every match: the set score (e.g. 3–1) and the points in every set. The top players win cash. On a points tie, the closest set-score predictions rank higher.
- **Jackpot:** a share of every day's prize money builds a league jackpot. It goes to whoever predicts the final men's and women's tables most accurately.

Product rules and owner decisions are in [docs/DECISIONS.md](docs/DECISIONS.md). Day-to-day operations are in [docs/RUNBOOK.md](docs/RUNBOOK.md). Deployment (Dokploy, one Dockerfile per app under `apps/*/Dockerfile`) is in [docs/DEPLOY.md](docs/DEPLOY.md). The original brief is [daily_volleyball_prediction_contest_prd.md](daily_volleyball_prediction_contest_prd.md).

## Layout

| Path                            | What                                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/api`                      | NestJS 11 API. Contract-first REST via oRPC, Drizzle on Postgres, email sign-in codes (Zapiack), payments, scoring, payouts.         |
| `apps/web`                      | Next.js 16 player site (mobile-first): today's contest, picks, payment, leaderboard, jackpot, standings, rules.                      |
| `apps/admin`                    | Next.js 16 staff dashboard: teams, leagues, fixtures, payments, results, finalize, payouts, jackpot.                                 |
| `packages/domain`               | Pure contest rules with exhaustive tests: scoring, closeness, ranking, prizes (integer kobo), locks, standings, jackpot, rules text. |
| `packages/contracts`            | zod schemas and the oRPC contract: every API route, shared by the API and both apps.                                                 |
| `packages/db`                   | Drizzle schema, migrations (with append-only and frozen-settings triggers) and seed.                                                 |
| `packages/api-client`           | Typed client, TanStack Query helpers, logo upload.                                                                                   |
| `packages/ui`, `packages/brand` | Scoutgram "Floodlight" theme, Flight-S logo and shadcn-style components.                                                             |

## Getting started

Requirements: Node ≥ 22.13 (see `.nvmrc`), pnpm via Corepack, Docker.

```bash
corepack enable
pnpm install
cp .env.example .env            # then fill AUTH_SECRET and DATA_ENCRYPTION_KEY (commands inside)
docker compose up -d            # Postgres on :55432, Redis on :56379
pnpm db:migrate && pnpm db:seed
pnpm --filter @predict/api build
ADMIN_PASSWORD='choose-one' node apps/api/dist/scripts/create-admin.js \
  --email you@example.com --name "You" --role super_admin
pnpm dev                        # API :4000, web :3000, admin :3001
```

In development `EMAIL_TRANSPORT=console`: nothing is emailed. Sign-in codes appear on the sign-in screen and in the API output.

Want something to click through? `pnpm --filter @predict/api seed:demo` (after a build) creates a demo league: placeholder men's and women's teams, two weeks of fixtures with rest days, and today's day open. The demo collection account says "DEMO - DO NOT PAY".

API docs (development only): http://localhost:4000/docs

## Tests

```bash
pnpm turbo run lint typecheck test build   # everything CI runs
pnpm --filter @predict/domain test         # rules: scoring, ties, prizes, locks, jackpot (property tests too)
pnpm --filter @predict/api test            # API integration tests on in-process Postgres (PGlite)
TEST_DATABASE_URL=postgres://predict:predict@localhost:55432/predict_test pnpm test:pg
                                           # race tests on real Postgres (create the database first)
```

## Conventions

- **Money** is always integer kobo (`bigint` in Postgres). Never use floats. Display with `formatNaira`.
- **Time** is stored in UTC, and shown and entered in Lagos time (WAT, UTC+1).
- **The contract is the API.** Add or change routes in `packages/contracts` first, then implement them in `apps/api`.
- **Business rules** are pure functions in `packages/domain` with table-driven tests.
- **Audit and ledger:** every admin action writes an audit row in the same transaction, and money changes also write ledger rows.
- **Migrations:** every schema change ships with one (`pnpm db:generate`). CI fails on drift.
- **Product name:** it isn't final. Change it in one place, `packages/brand/src/index.ts` (`product`).
