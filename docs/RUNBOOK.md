# Runbook

For whoever runs the contest day to day and deploys it. Product rules are in [DECISIONS.md](DECISIONS.md).

## How it fits together

```
            players                           staff
               │                                │
   predict.scoutgram.africa        predict-admin.scoutgram.africa
               │                                │
               └──────────── Caddy (TLS) ───────┘
                    │                       │
              web (Next.js)          admin (Next.js)
                    └──── /api/* ──┬────────┘        (private network only)
                                   │
                             api (NestJS) ── SMS provider (Termii / BulkSMS Nigeria)
                              │      │
                         Postgres   Redis           logos → Cloudflare R2 (public bucket)
```

- **The browser only ever talks to web or admin.** Both proxy `/api/*` to the API, so session cookies are first-party and the API needs no public port.
- **Postgres holds everything that matters.** The money journal (`ledger_entries`), the audit log and prediction history are append-only, and a database trigger enforces that.
- **Redis is optional.** It shares rate limits between API instances.
- **A built-in timer runs every 20 seconds.** It opens and closes days at their scheduled times, closes jackpot entries and sends queued texts. Nothing about fairness depends on it: every lock is checked from timestamps when a request arrives.

## First-time setup (single VPS)

1. **DNS:** point `predict.scoutgram.africa` and `predict-admin.scoutgram.africa` at the server (A/AAAA records).
2. **SMS:** register a sender ID (e.g. `Scoutgram`) with your SMS provider and ask them to enable the DND/transactional route. Approval takes about 1–5 business days, so do it first.
3. **Logos:** create a **public** Cloudflare R2 bucket and an API token with write access to it.
4. **Configuration:** on the server, copy `.env.example` to `.env.production` and set:
   - `NODE_ENV=production`
   - `AUTH_SECRET` and `DATA_ENCRYPTION_KEY`: generate both fresh and keep them in a password manager. If you lose `DATA_ENCRYPTION_KEY`, the stored bank account numbers can no longer be read.
   - `SMS_PROVIDER` plus that provider's key, and `SMS_SENDER_ID`
   - `STORAGE_DRIVER=r2` plus the `R2_*` values
   - `WEB_ORIGIN=https://predict.scoutgram.africa` and `ADMIN_ORIGIN=https://predict-admin.scoutgram.africa`
   - optional: `TURNSTILE_SECRET_KEY`, with the matching `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   - compose values: `POSTGRES_PASSWORD`, `ACME_EMAIL` (where Let's Encrypt sends certificate notices), `WEB_HOST`, `ADMIN_HOST`
5. **Build and start:**
   `docker compose -f deploy/docker-compose.prod.yml --env-file .env.production up -d --build`
6. **Migrate and seed:**
   `docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api node dist/scripts/migrate.js`
   then the same command with `seed.js`.
7. **First staff account:**
   `docker compose -f deploy/docker-compose.prod.yml --env-file .env.production run --rm api node dist/scripts/create-admin.js --email you@scoutgram.africa --name "Your Name" --role super_admin`
   The password is printed once. In production, the first sign-in asks you to set up an authenticator app.
8. **More staff:** use roles `operations` (fixtures and results) and `finance` (payments and payouts). Keep `super_admin` for the owner.

**Updating:** `git pull`, re-run step 5, then step 6 (migrations are forward-only and safe to re-run).

## Before the league

1. **Settings:** enter the bank account players pay into. Only super admins can change it, every change is logged, and each day keeps the account it opened with.
2. **Teams:** add every men's and women's team with its logo (square PNG/JPG, at most 5 MB).
3. **New league:** set the dates and when jackpot predictions close. Choose carefully: once the first player submits a prediction, the deadline can't be changed.
   - **Default settings:** check the entry fee (₦500), prize %, jackpot % and prize split.
   - **Teams:** tick the teams taking part.
   - **Fixtures:** paste or upload the CSV (`date,time,category,home,away,venue`). Press **Check**, fix any red lines, then **Import**. Missing days are created for you. Leave rest days out.
   - **Start league:** this opens jackpot predictions.
4. **Each day:** review its matches and settings, then press **Publish** so it appears on the site. Then either:
   - press **Open** when you want entries to start, or
   - schedule the opening (super admin).

   Opening freezes the day's money and scoring settings and stores the rules players agree to.

## A match-day

1. **Open** the day (or let the scheduled opening do it). Players join, pay by transfer using their reference, and make picks.
2. **Payments** (finance), throughout the day:
   - Work the queue against the bank statement.
   - **Confirm** a payment by typing the transfer exactly as the statement shows it: session/reference ID, amount and the time it was credited.
   - A transfer that arrived after the last match locked can't confirm an entry; refund it instead.
   - Confirmations are allowed after the day closes, as long as the money arrived before the cutoff.
3. **Closing:** matches lock automatically at their start time. Close the whole day with **Close now**, or set a scheduled close.
4. **Results** (operations): for each match, **enter** the set scores, then **confirm**. Only confirmed results count, and the leaderboard updates at once.
5. **Finalize** (super admin), on the day's **Leaderboard & finalize** tab:
   - Fix every red blocker. A pending payment claim must be confirmed or rejected.
   - Read the amber warnings and tick the box.
   - **Finalize** freezes the pool, records each winner's prize and the jackpot's share, and texts the winners.
6. **Payouts** (finance):
   - Winners add bank details in their account; those payouts appear under **Ready**.
   - **Start** a payout by typing the name your bank's name check shows.
   - Send the transfer from your bank, then **Mark paid** with its reference and the exact amount.
   - Each payout can only be paid once.

## When things go wrong

| Situation                                                | What to do                                                                                                                                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Player paid but there is no claim                        | Payments → search their reference or name → **Confirm** with the statement details.                                                                                              |
| Claim with no matching money                             | **Reject claim** with a reason. The player sees it and can try again.                                                                                                            |
| Wrong amount, or one transfer for two players            | Confirm each entry with the same bank reference. The system never lets a transfer pay out more than it carried. Leftover money shows as unused under **Transfers** → **Refund**. |
| Money arrived late                                       | Transfers → **Record** it, then **Refund**.                                                                                                                                      |
| Confirmed the wrong entry                                | Super admin → **Revoke** with a reason. The operator tops up the pool so it never shrinks.                                                                                       |
| Duplicate accounts (shared bank account flag on Players) | Review, then **Disqualify** the entry (the fee stays in the pool) and/or suspend the player.                                                                                     |
| Match starts early                                       | Day → match → **Mark started** with the real time. Picks saved after that don't count.                                                                                           |
| Match postponed or cancelled                             | **Void** it with a reason. It counts for nobody. If fewer than the day's minimum matches are played, **Cancel** the day instead.                                                 |
| Wrong result entered                                     | Not yet confirmed: enter it again. Already confirmed: a super admin enters the correction with a reason, then confirms.                                                          |
| Finalized with a mistake                                 | Super admin → **Reopen** (only if no payout has started), fix it, finalize again.                                                                                                |
| Day can't go ahead                                       | Super admin → **Cancel** with a reason. Everyone who paid is owed a full refund (shown under Payouts → refunds), and sponsor money is returned.                                  |
| Payout bounced                                           | **Mark failed** (it goes back to Ready to retry), or **Invalid details** (the player is texted to fix their bank details).                                                       |
| Suspicious payout                                        | Super admin → **Hold**.                                                                                                                                                          |

## The jackpot

- **During the league:** keep each table up to date under League → Standings. Use **Fill from results** to pre-fill it from confirmed results (FIVB points), check it, adjust it, and **Save**. Turn **Standings public** on to show it on the site.
- **At the end:**
  1. Finalize or cancel every day.
  2. Set the final tables and press **Finalize standings** (super admin).
  3. Press **Settle jackpot**.

  The closest prediction wins; if two are equally close, the one submitted first wins. The jackpot is then owed to the winner like any prize. If nobody qualifies, it is marked to carry over: add it to the next league's jackpot as a contribution.

## Backups

- **Nightly dump on the server:**
  `docker compose -f deploy/docker-compose.prod.yml exec -T postgres pg_dump -U predict -Fc predict > deploy/backups/predict-$(date +%F).dump`
  Copy the dumps off the server too (e.g. to R2 or another bucket).
- **Restore drill:** do this before launch, then monthly.
  `createdb` a scratch database, run `pg_restore -d <scratch> deploy/backups/<file>.dump`, and point a local API at it to check it.
- **Encryption key:** keep `DATA_ENCRYPTION_KEY` with the backups' recovery notes. A restore without it can't read bank account numbers.

## Security checklist

- **Every staff account** has two-step sign-in (required in production) and its own login. Nobody shares accounts.
- **Change log:** collection-account changes, payout reveals and every money action are in the **Audit log**. Review it weekly.
- **Secrets:** stay only in `.env.production` on the server and in your password manager, never in git.
- **Rate limits:** sign-in codes are limited per number, per IP and by a global daily cap (`SMS_DAILY_CAP`), to stop SMS-pumping bills.
- **Bank account numbers** are encrypted at rest. Players only ever see the last 4 digits.

## Troubleshooting

| Symptom                                | Check                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| "We could not send the text"           | The SMS provider balance, the sender ID's approval, and `SMS_PROVIDER` / key. The API log has the provider's error. |
| Texts arrive late or not at all on MTN | The provider must send on the **DND/transactional** route (Termii `dnd`, BulkSMS Nigeria `otp`).                    |
| A day won't open                       | The day page lists what's blocking it (league not started, no matches, no collection account…).                     |
| Scheduled open didn't happen           | Audit log → `day.auto_open_failed` lists why. Fix it and open by hand.                                              |
| API health                             | `GET /api/v1/health` on either site reports database and Redis status.                                              |
