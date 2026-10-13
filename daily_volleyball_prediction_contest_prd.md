# Product Requirements Document (PRD): Daily Volleyball Prediction Contest

## 1. Product Overview

**Working name:** Daily Volleyball Predictions  
**Product type:** Web application  
**Initial audience:** Fans following the Nigerian Volleyball Premier League (NVPL)  
**Primary goal:** Let fans enter a daily volleyball prediction contest, compete on a leaderboard, and win cash prizes based on prediction accuracy.

Each contest day includes approximately 10 matches. A participant pays **₦500 for that day**, predicts the results of the day's eligible matches, and competes against other participants. After the last eligible match is finalized, the system calculates scores, publishes the final leaderboard, and awards prizes to the **top 10 participants**.

The live prize pool should be visible throughout the day and increase as entry payments are confirmed. Optional sponsor funding can increase the prize pool.

This document describes the intended product behavior. Do not assume an unmentioned technology stack or redesign the product without explaining why.

## 2. Product Goals

1. Make it quick and straightforward for a fan to enter the daily contest.
2. Display a transparent, up-to-date prize pool and confirmed participant count.
3. Ensure predictions are locked fairly and scored consistently.
4. Publish a reliable leaderboard after all eligible matches are finalized.
5. Pay the top 10 participants according to clear, published rules.
6. Provide administrators with the tools to manage fixtures, payments, results, disputes, refunds, sponsors, and payouts.
7. Keep an auditable record of entry money, prize obligations, sponsor contributions, and payments.

## 3. Out of Scope for the Initial Version

- Multiple paid entries by the same participant in one daily contest.
- A participant placing predictions or paying for individual matches separately.
- User-to-user transfers or an internal wallet that stores withdrawable balances.
- Live in-play prediction changes after a match starts.
- Native iOS or Android apps.
- Complex social features, chat, follows, or private groups.
- Automated match-result sourcing unless a reliable data source is selected and integrated.
- Sponsor self-service dashboards.
- Cryptocurrency payments.

## 4. User Roles

### 4.1 Visitor
- Can view the current contest, fixtures, entry fee, prize pool, contest rules, and public leaderboard.
- Must sign in or create an account before entering.

### 4.2 Participant
- Has a unique account.
- Can enter a daily contest once.
- Can submit predictions before the relevant deadline.
- Can view their submitted predictions, scores, leaderboard position, and prize/payout status.
- Can view previous contest results and their own contest history.

### 4.3 Administrator
- Can create and manage daily contests and fixtures.
- Can set deadlines, scoring rules, prize allocation, and payout distribution before a contest opens.
- Can reconcile bank-transfer payments and confirm entries.
- Can enter, verify, correct, or void match results with an audit trail.
- Can review suspected duplicate accounts and payment disputes.
- Can manage sponsor contributions.
- Can finalize leaderboards, approve payouts, and record transfer outcomes.
- Can cancel a contest or fixture and initiate refunds according to the published rules.

## 5. Core Contest Rules

These rules should be visible to participants before payment.

1. Each contest is for one calendar day in **Africa/Lagos (WAT)**, unless an administrator explicitly publishes a different contest window.
2. The entry fee is **₦500 per participant per day**.
3. Each participant may have **one paid entry per daily contest**.
4. A daily contest is expected to include around 10 eligible matches. The actual fixtures are those published on the contest page.
5. Participants must submit predictions before the published prediction deadline.
6. A prediction for a match becomes locked no later than that match's scheduled start time. The system must not accept or allow edits to predictions after the applicable lock time.
7. The public prize pool is based on confirmed paid entries and confirmed sponsor funding committed to prizes, not unverified payment claims or unpaid sponsor pledges.
8. The contest's prize percentage, scoring system, tie-break rules, prize distribution, and cancellation/refund policy must be published before entries open and must not be changed retroactively.
9. The leaderboard is provisional until every relevant match result is confirmed or the match is formally marked void under the published rules.
10. The top 10 ranked participants receive prizes according to the published distribution. If fewer than 10 eligible participants enter, only actual eligible winners can be paid; the product must follow the published rules for unawarded prize amounts.
11. No administrator may silently edit a participant's prediction, payment, score, or prize. Corrections require an audit record.

## 6. Entry and Account Rules

### 6.1 Account identity
- Require a verified phone number as a primary account identifier.
- Store a unique internal user ID.
- Prevent the same account from entering the same daily contest more than once.
- Allow the same account to enter future daily contests by paying the entry fee again.
- Provide an admin review workflow for suspected duplicate accounts. A phone number alone does not guarantee one real-world identity, so do not automatically ban accounts solely on weak signals.
- Do not collect unnecessary identity information. If additional verification is required for prize payouts, request it securely and explain why.

### 6.2 Entry lifecycle
An entry should use explicit statuses such as:
- `awaiting_payment`
- `payment_review`
- `confirmed`
- `cancelled`
- `refunded`

Only `confirmed` entries count toward the confirmed entry count, prize-pool contribution, and contest leaderboard.

### 6.3 Prediction submission
- Participants submit one prediction for each eligible match they wish to predict.
- Define whether a participant must predict every match or may leave some matches blank before launch. Recommended default: allow partial predictions, with no points for unpredicted matches.
- The UI must clearly show whether each prediction is saved and whether it is locked.
- Saving predictions must be idempotent and must not create duplicate prediction records.
- Store timestamps for creation and updates, and reject changes after the relevant deadline using server-side checks.

## 7. Payment Flow: Bank Transfer

The initial release uses manual or administrator-assisted bank-transfer reconciliation rather than an online payment gateway.

### 7.1 Participant flow
1. Participant selects **Enter today's contest**.
2. The app creates an entry in `awaiting_payment` state and provides a unique payment reference.
3. The app displays the payment instructions and exact amount: ₦500.
4. Participant may optionally submit the sender name, transfer reference, and/or upload proof if this is needed for reconciliation. A screenshot must never be treated as conclusive payment proof.
5. The participant sees the entry as pending until the administrator verifies the money has actually arrived in the bank account.
6. After verification, the entry becomes `confirmed`; the participant can complete or edit predictions up to the applicable deadlines.
7. If payment is not confirmed before the entry cutoff, the entry is not eligible for prizes unless an administrator resolves the case according to the published rules.

### 7.2 Admin reconciliation
- Provide a queue of pending payments.
- Let an authorized administrator match an incoming transfer to an entry using amount, reference, sender details, and bank records.
- Prevent one incoming transfer from confirming multiple entries.
- Record who confirmed/rejected the payment and when.
- Support payment mismatch, duplicate transfer, late transfer, refund, and manual correction workflows.
- Keep a ledger of confirmed collections, refunds, prize obligations, sponsor funding, and payouts.
- Never increase the prize pool from a submitted screenshot alone.

### 7.3 Payment safety
- Do not expose full bank statements or other participants' sensitive payment data.
- Restrict payment administration to authorized admins.
- Avoid collecting card or banking credentials.
- Use secure access controls and logs for payment actions.

## 8. Prize Pool and Operations Allocation

### 8.1 Default formula
Use configurable contest-level settings, with the initial default:
- Entry fee: **₦500**
- Prize allocation from confirmed entry fees: **80%**
- Operations allocation from confirmed entry fees: **20%**
- Sponsor funding: add **100% of the amount explicitly committed to that contest's prizes**, unless a published sponsorship agreement states otherwise.

These are product defaults and must be configurable by an authorized administrator before entries open. The UI must show the actual settings for each contest.

### 8.2 Formula
- `confirmed_entry_revenue = confirmed_entry_count × entry_fee`
- `participant_funded_prize_pool = confirmed_entry_revenue × prize_percentage`
- `operations_allocation = confirmed_entry_revenue × operations_percentage`
- `total_prize_pool = participant_funded_prize_pool + confirmed_sponsor_prize_funding`

Prize and operations percentages must total 100% of entry-fee revenue. Sponsor contributions are tracked separately and only count toward the prize pool when the funds are received and committed to prizes.

### 8.3 Public display
Display on the contest page:
- Entry fee.
- Number of confirmed paid entries.
- Total confirmed entry revenue (optional; admin must be able to decide whether this is public).
- Participant-funded prize contribution.
- Confirmed sponsor contribution.
- Current guaranteed prize pool.
- Prize distribution for places 1–10.
- Last updated time.

Do not display unpaid sponsor pledges as guaranteed money. If showing pledges, label them clearly as **potential sponsor funding** and keep them out of the guaranteed pool.

### 8.4 Live updates
- Update the confirmed entry count and prize pool immediately after an entry payment is verified.
- If real-time push updates are unavailable, use periodic refresh/polling.
- The pool must never decrease because of a failed or duplicate payment being counted incorrectly. Refunds and contest cancellation should follow explicit, published adjustment rules and be auditable.
- Make it clear that the displayed pool is current and may change until entries close.

## 9. Prize Distribution: Top 10

### 9.1 Requirements
- Exactly 10 prize positions should be configured for each contest when there are enough eligible participants.
- The total of the 10 prizes must equal the published prize pool, subject to any explicitly documented rounding rule.
- Prize amounts and positions must be visible before participants pay.
- Avoid rounding errors by calculating prizes in integer kobo or another integer minor-unit representation.
- If the prize pool changes as entries are confirmed, recalculate the published prize amounts using the predefined distribution percentages or formula.
- Freeze the final prize pool and prize amounts when entries close, unless the published rules explicitly define another closing point.

### 9.2 Suggested configurable percentage distribution
Suggested initial distribution of the prize pool:
- 1st place: 40%
- 2nd place: 20%
- 3rd place: 12.5%
- 4th place: 7.5%
- 5th place: 5%
- 6th place: 4%
- 7th place: 3%
- 8th place: 3%
- 9th place: 2.5%
- 10th place: 2.5%

Total: 100%.

This is a proposed default, not a fixed business requirement. The administrator should be able to configure the split before the contest opens. Validate that the distribution totals 100%.

### 9.3 Ties
Use the following published tie-break order:
1. Highest total points.
2. Most exact-score predictions.
3. Most correctly predicted match winners.
4. If still tied, split the combined prize money for all occupied positions equally among tied participants.

Example: if two participants tie for second and third, combine the second- and third-place prizes and divide the total equally between them. The next participant receives the next unoccupied position. Document the policy clearly on the contest page.

The scoring/tie logic must be deterministic and covered by automated tests. Do not use submission time as an undisclosed tie-breaker.

## 10. Prediction Scoring

Scoring must be configurable and visible before the contest opens. Suggested initial scoring for each match:
- Correct match winner: **3 points**
- Correct number of sets played: **+2 points**
- Exact final set score (e.g. 3–1): **+2 bonus points**

Under this scheme, an exact 3–1 prediction for a real 3–1 result earns 7 points. A prediction of 3–2 for a real 3–1 result earns 3 points if the predicted winner is correct. A wrong winner earns no winner points; define explicitly whether other score components can be earned if the winner is wrong. Recommended: award set-count and exact-score bonuses only when the predicted winner is correct.

For each match, prediction fields should represent the two teams and the expected final set score, for example:
- Team A wins 3–0
- Team A wins 3–1
- Team A wins 3–2
- Team B wins 3–0
- Team B wins 3–1
- Team B wins 3–2

If the competition format permits draws or a different set format, adjust the prediction options and scoring before entries open.

### Match result handling
- Store official result, source/verification notes, who entered it, and timestamps.
- Support a provisional result and a confirmed result.
- Recalculate scores when a result is corrected, preserving an audit history.
- A voided/cancelled/postponed match must be handled according to a published rule. Recommended default: award zero points for the voided match and exclude it from scoring; do not silently change other predictions.
- A contest cannot be finalized while any required result remains unresolved unless an administrator uses a documented exception allowed by the rules.

## 11. Daily Contest Lifecycle

Suggested statuses:
- `draft`
- `published`
- `open`
- `locked`
- `awaiting_results`
- `provisional_leaderboard`
- `finalized`
- `payouts_pending`
- `completed`
- `cancelled`

Expected flow:
1. Admin creates contest and fixtures.
2. Admin configures entry fee, entry cutoff, prediction lock times, prize split, scoring, tie rules, cancellation policy, and prize allocation.
3. Admin previews the public contest page and opens entries.
4. Participants pay and receive confirmed entries after reconciliation.
5. Predictions lock at published deadlines.
6. Admin confirms results after matches finish.
7. System calculates points and displays a provisional leaderboard.
8. Admin reviews discrepancies and finalizes the leaderboard.
9. System calculates top-10 awards.
10. Admin initiates or records payouts.
11. Contest becomes completed once all payouts are reconciled or clearly marked failed/pending.

## 12. Payouts

The initial release should not require an internal wallet. Maintain a prize obligation and payout record per winner, and use bank transfers to pay winners.

### Winner experience
- Show prize amount and payout status.
- Collect the minimum bank details needed to pay a winner through a secure form.
- Explain how the details will be used and who can access them.
- Show statuses such as `not_started`, `pending`, `paid`, `failed`, and `retry_required`.

### Admin experience
- Review top-10 list and payout amounts.
- Verify winner payout details.
- Initiate bank transfers manually through the bank's approved channel, or record transfer references if transfers are initiated outside the app.
- Record timestamp, amount, reference, administrator, and status.
- Prevent duplicate payouts and require confirmation before marking a payout as paid.
- Support failed transfers and retries without creating a second successful payment.
- Keep payout funds separate in accounting from operations allocation.
- Provide a reconciliation report showing each prize obligation and its payout state.

For launch, payout automation is optional; reliable tracking and reconciliation are required.

## 13. Sponsor Funding

Sponsors can optionally contribute to the prize pool.

Initial scope:
- Admin can record sponsor name, amount, date received, and contest allocation.
- Track sponsor funding as `pledged`, `received`, `allocated_to_prize`, or `refunded/returned` if applicable.
- Only received funds committed to the contest count toward the guaranteed public prize pool.
- Publicly show the sponsor contribution separately from participant-funded prize money.
- Admin can add sponsor branding/logo and a short description if desired.
- Maintain an audit trail for changes to sponsorship allocations.

Future scope:
- Sponsor accounts and self-service contributions.
- Sponsor-branded special awards or matchday challenges.
- Sponsor analytics and campaign reports.

## 14. Public Pages and UI Requirements

### 14.1 Home / contest page
Must show:
- Current daily contest status.
- Date and timezone.
- Entry fee: ₦500.
- Confirmed participant count.
- Live guaranteed prize pool.
- Split between participant-funded prizes and sponsor funding.
- Prize amounts for positions 1–10.
- Fixtures and match start times.
- Countdown to entry/prediction deadlines.
- Clear entry call-to-action.
- Short rules and link to full rules.

### 14.2 Prediction interface
- Display all eligible matches for the day.
- Allow participants to select one final set-score outcome per match.
- Clearly show saved, unsaved, locked, and missed predictions.
- Show the applicable deadline for each match.
- Prevent changes after lock at both UI and server levels.
- Support mobile-first design and slow connections.

### 14.3 Leaderboard
- Show rank, participant display name, points, and relevant tie-break stats.
- During the day, label standings as provisional.
- After finalization, clearly mark the final top 10 and their prize amounts.
- Protect participants' private details; never show phone numbers or bank details publicly.
- Do not present a leaderboard as final while required results remain unresolved.

### 14.4 Participant account
- Current and previous contest entries.
- Payment confirmation state.
- Saved predictions and scoring breakdown.
- Contest history and final rankings.
- Prize amount and payout status.
- Secure payout-details form for winners.

### 14.5 Admin dashboard
- Contest and fixture management.
- Payment reconciliation queue.
- Entry and duplicate-account review.
- Result entry and correction.
- Leaderboard preview/finalization.
- Prize and sponsor-funding configuration.
- Payout tracking and reconciliation.
- Refund/cancellation tools.
- Audit log and basic operational reports.

## 15. Notifications

Initial notifications may be in-app; SMS or email can be added if available.
- Entry payment confirmed or needs review.
- Prediction deadline approaching.
- Predictions locked.
- Contest leaderboard finalized.
- Participant won a prize.
- Payout initiated, completed, or failed.
- Contest cancelled or fixture voided.

Do not promise that a notification has been delivered unless the delivery provider confirms it.

## 16. Non-Functional Requirements

### Security
- Enforce authorization on every protected API.
- Enforce entry uniqueness and prediction lock rules server-side.
- Use rate limiting and basic abuse protection.
- Store secrets in environment variables/secret management, not source control.
- Protect admin accounts with strong authentication and preferably MFA.
- Log sensitive administrative actions.
- Validate and sanitize all input.
- Avoid leaking bank details, private user information, or internal admin data.

### Reliability and data integrity
- Use database transactions for entry confirmation, ledger changes, score finalization, and payout-state transitions.
- Make payment confirmation and payout operations idempotent.
- Store monetary values as integer kobo, not floating-point numbers.
- Maintain audit trails for payments, score corrections, contest changes, and payouts.
- Back up the database and test restoration.
- Use a consistent timezone, `Africa/Lagos`, for display and deadlines; store timestamps in UTC internally where appropriate.

### Performance
- Mobile-first responsive interface.
- Handle a few thousand daily participants as an initial design target.
- Leaderboard calculations should be repeatable and efficient.
- Prize pool and entry counts should remain consistent under concurrent confirmations.

### Accessibility and clarity
- Use clear labels and plain language.
- Make entry fee, lock deadlines, scoring, prize amounts, and tie rules easy to find.
- Ensure the app remains usable on common mobile screen sizes.

## 17. Suggested Data Model

The final schema is up to the implementation, but it should represent these entities:

- `users`: internal ID, display name, verified phone, account status, timestamps.
- `contests`: date, timezone, status, entry fee, entry cutoff, prize percentage, operations percentage, scoring config, tie rules, cancellation policy, finalized timestamps.
- `matches`: contest ID, teams, scheduled start, status, official score, result verification metadata.
- `entries`: contest ID, user ID, status, payment reference, confirmed amount, timestamps; unique constraint on `(contest_id, user_id)`.
- `predictions`: entry ID, match ID, predicted winner/team score, submission/update timestamps; unique constraint on `(entry_id, match_id)`.
- `payments`: entry ID, amount in kobo, sender/reference metadata, status, reconciliation notes, confirmed-by and timestamps; prevent a transfer from being applied more than once.
- `sponsor_contributions`: sponsor, amount in kobo, status, contest allocation, received date, notes.
- `prize_allocations`: contest ID, rank, configured percentage or fixed amount, computed amount in kobo.
- `contest_results` or result history: match ID, result version, source/notes, entered-by, confirmed-by, timestamps.
- `leaderboard_snapshots`: contest ID, user/entry ID, points, tie-break metrics, rank, finalized state.
- `payouts`: contest ID, winner user ID, rank, amount in kobo, bank details reference, transfer reference, status, initiated/confirmed-by, timestamps.
- `audit_logs`: actor, action, affected entity, before/after metadata where appropriate, timestamp.

Avoid duplicating sensitive payout details across records. Use access controls and retention rules.

## 18. Business Rules and Edge Cases

The implementation must explicitly handle:
- Duplicate account attempting to enter the same contest.
- A transfer received twice or one transfer claimed by multiple users.
- Transfer received with an incorrect amount or no reference.
- Payment arriving after entries close.
- Payment verified after the participant's prediction deadline.
- Participant pays but submits no predictions.
- A match starts earlier than scheduled.
- A match is postponed, cancelled, abandoned, or its result is corrected.
- All or some matches remain unresolved at the intended payout time.
- Two or more participants tie on points and tie-break metrics.
- Fewer than 10 eligible participants.
- Prize allocation percentage rounding to kobo.
- Sponsor funding pledged but not received.
- Sponsor funding received but later withdrawn or refunded.
- Participant's payout bank details are missing or invalid.
- Payout fails, is delayed, or is accidentally attempted twice.
- Contest is cancelled after participants have paid.
- Admin makes an error in fixtures, deadlines, results, or pool configuration.

For each case, show the participant-facing state clearly and record an audit event. Never silently alter a participant's entry or reduce an advertised guaranteed prize pool without following the published rules.

## 19. Analytics and Success Metrics

Track:
- Page visitors and conversion to registration.
- Registration-to-paid-entry conversion.
- Confirmed paid entries per day.
- Entry-payment confirmation time.
- Percentage of paid participants who submit predictions.
- Returning participants and day-to-day retention.
- Sponsor funding per contest.
- Prize pool size and distribution.
- Payment mismatches and refunds.
- Payout success rate and time from finalization to payment.
- Support requests and disputes per contest.

Do not expose private analytics or participant personal data publicly.

## 20. MVP Acceptance Criteria

The initial release is acceptable when:

1. An admin can create and publish a daily contest with fixtures, deadlines, scoring rules, prize split, and top-10 distribution.
2. A visitor can register and enter the contest for ₦500.
3. The system enforces one entry per account per daily contest.
4. A payment remains pending until verified against actual bank receipt.
5. Confirmed entries update the public entry count and guaranteed prize pool.
6. Sponsor contributions are tracked separately, and only received/committed contributions increase the guaranteed pool.
7. A participant can submit predictions and see whether they are saved or locked.
8. The server rejects predictions submitted or edited after their deadline.
9. An admin can enter and confirm match results with an audit trail.
10. The system calculates points according to the published scoring configuration.
11. The leaderboard uses the published tie-break rules deterministically.
12. The system computes the top 10 prizes and ensures the total allocation matches the final prize pool within the defined integer-rounding policy.
13. The admin can finalize the leaderboard and record payouts to each winner.
14. Duplicate payment confirmation and duplicate payout attempts are prevented.
15. Participants can view their final rank, prize amount, and payout status.
16. Contest cancellation, voided matches, refunds, and result corrections follow explicit rules.
17. Sensitive bank details are never exposed on public pages.
18. Automated tests cover scoring, tie handling, pool calculations, payment idempotency, prediction deadlines, and payout state transitions.

## 21. Implementation Guidance for Claude

Please use this PRD to:
1. Inspect the existing repository and identify its framework, architecture, conventions, and current functionality before making changes.
2. Summarize the existing project structure and propose a short implementation plan.
3. Identify unanswered product decisions and distinguish blockers from safe defaults.
4. Implement the MVP in small, testable increments that fit the existing codebase.
5. Prioritize correct contest and payment state handling, data integrity, and auditability over visual polish.
6. Add migrations, validation, authorization, error handling, and tests.
7. Do not fabricate bank-transfer confirmations, match results, sponsor payments, or payouts.
8. Do not hardcode secrets or use floating-point arithmetic for money.
9. Keep scoring, prize allocation, deadlines, and tie-break rules configurable per contest, and freeze them when the contest opens.
10. Document setup, environment variables, migrations, admin operations, and known limitations.

Before implementation, flag any contradiction or unresolved rule that could affect money, rankings, or participant fairness. Do not silently make a business-critical decision.
