# Runbook

For whoever runs the contest day to day and deploys it. Product rules are in [DECISIONS.md](DECISIONS.md).

## How it fits together

```
            players                           staff
               │                                │
   predict.scoutgram.africa        predict-admin.scoutgram.africa
               │                                │
               └────── Dokploy (Traefik, TLS) ──┘
                    │                       │
              web (Next.js)          admin (Next.js)
                    └──── /api/* ──┬────────┘        (internal network only)
                                   │
                             api (NestJS) ── email (Zapiack)
                              │      │
                         Postgres   Redis           logos → uploads volume on the server
```

- **The browser only ever talks to web or admin.** Both proxy `/api/*` to the API, so session cookies are first-party and the API needs no public domain.
- **Players sign in with their email.** We email a 6-digit code; there is no password. We also collect a phone number at sign-up, unique per account but not verified.
- **Postgres holds everything that matters.** The money journal (`ledger_entries`), the audit log, prediction history and jackpot predictions are append-only, and database triggers enforce that.
- **Redis is optional.** It shares rate limits between API instances.
- **A built-in timer runs every 20 seconds.** It opens and closes days at their scheduled times, closes jackpot entries and sends queued emails. Nothing about fairness depends on it: every lock is checked from timestamps when a request arrives.

## First-time setup

1. **Email (Zapiack):** do this first, since the domain needs DNS changes.
   - Add and verify the sending domain (DKIM, return-path and DMARC records), then create the sending address, e.g. `predict@scoutgram.africa`.
   - Create a project API key.
   - Create the message template **on your own machine, before deploying** (the API won't start in production without it): put `ZAPIACK_API_KEY` in `.env`, then run `pnpm build && pnpm --filter @predict/api zapiack:template`. It prints the template id and whether it's approved; check again later with `--status <id>` if it went to review.
   - Send yourself a test with `--test-to you@example.com` once `ZAPIACK_TEMPLATE_ID` and `EMAIL_FROM` are set (locally, or later from the API's terminal in Dokploy).
   - **Plan:** the free plan allows 100 emails a day, and every sign-in uses one. Move to a paid plan before launch.
2. **Logos:** nothing to set up beyond the `predict-uploads` volume on the API app in Dokploy (see [DEPLOY.md](DEPLOY.md)). The API stores and serves the files itself.
3. **Deploy on Dokploy:** follow [DEPLOY.md](DEPLOY.md). Migrations run automatically when the API starts.
   - `AUTH_SECRET` and `DATA_ENCRYPTION_KEY`: generate both fresh and keep them in a password manager. If you lose `DATA_ENCRYPTION_KEY`, the stored bank account numbers can no longer be read.
4. **First staff account:** in Dokploy, open the API app's terminal and run
   `node dist/scripts/create-admin.js --email you@scoutgram.africa --name "Your Name" --role super_admin`
   The password is printed once. In production, the first sign-in asks you to set up an authenticator app.
5. **More staff:** use roles `operations` (fixtures and results) and `finance` (payments and payouts). Keep `super_admin` for the owner.

**Updating:** push to the deployed branch; Dokploy rebuilds the apps whose code changed. Migrations are forward-only and run on API start.

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
   - **Finalize** freezes the pool, records each winner's prize and the jackpot's share, and emails the winners.
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
| Payout bounced                                           | **Mark failed** (it goes back to Ready to retry), or **Invalid details** (the player is emailed to fix their bank details).                                                      |
| Suspicious payout                                        | Super admin → **Hold**.                                                                                                                                                          |

## The jackpot

- **During the league:** keep each table up to date under League → Standings. Use **Fill from results** to pre-fill it from confirmed results (FIVB points), check it, adjust it, and **Save**. Turn **Standings public** on to show it on the site.
- **At the end:**
  1. Finalize or cancel every day.
  2. Set the final tables and press **Finalize standings** (super admin).
  3. Press **Settle jackpot**.

  The closest prediction wins; if two are equally close, the one submitted first wins. The jackpot is then owed to the winner like any prize. If nobody qualifies, it is marked to carry over: add it to the next league's jackpot as a contribution.

## Backups

- **Nightly backups:** turn on scheduled backups for the Postgres service in Dokploy, to a private S3-compatible bucket. Logos live on the `predict-uploads` volume. See [DEPLOY.md](DEPLOY.md#5-backups).
- **Restore drill:** do this before launch, then monthly. Restore a backup into a scratch database and point a local API at it to check it.
- **Encryption key:** keep `DATA_ENCRYPTION_KEY` with the backups' recovery notes. A restore without it can't read bank account numbers.

## Security checklist

- **Every staff account** has two-step sign-in (required in production) and its own login. Nobody shares accounts.
- **Change log:** collection-account changes, payout reveals and every money action are in the **Audit log**. Review it weekly.
- **Secrets:** stay only in Dokploy's environment settings and your password manager, never in git.
- **Rate limits:** sign-in codes are limited per address, per IP and by a global daily cap (`EMAIL_DAILY_CAP`), so abuse can't use up the email plan.
- **Bank account numbers** are encrypted at rest. Players only ever see the last 4 digits.

## Troubleshooting

| Symptom                       | Check                                                                                                                                                                                                                             |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "We could not send the email" | `EMAIL_TRANSPORT=zapiack`, the API key, that the template is APPROVED and `EMAIL_FROM` is a sending address on the verified domain. The API log has Zapiack's error; a `429` means the plan's daily or monthly volume is used up. |
| Codes don't arrive            | Ask the player to check spam. In Zapiack, look the email up under Email → Logs; bounced addresses are suppressed automatically.                                                                                                   |
| A day won't open              | The day page lists what's blocking it (league not started, no matches, no collection account…).                                                                                                                                   |
| Scheduled open didn't happen  | Audit log → `day.auto_open_failed` lists why. Fix it and open by hand.                                                                                                                                                            |
| API health                    | `GET /api/v1/health` on either site reports database and Redis status.                                                                                                                                                            |
