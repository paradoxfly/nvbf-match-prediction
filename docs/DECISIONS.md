# Product decisions

The PRD (`daily_volleyball_prediction_contest_prd.md`) is the base. Where this file differs, this file wins: these are the owner's amendments and answers (October 2026), plus the defaults we chose. Anything marked **default** can be changed by an admin per league or per match-day before that day opens. After a day opens, its settings are frozen; a database trigger enforces this.

## Owner amendments

- **Entry fee:** admins can change it. The default is ₦1,000. (Owner, 14 Oct 2026: raised from ₦500.)
- **Sign-in:** players use their email address and an emailed 6-digit code; there is no password. They also give a Nigerian mobile number at sign-up: it must be unique across accounts, but it isn't verified. (Owner, 13 Oct 2026: SMS sender IDs take too long to approve. SMS sign-in is in git history at commit `8afff1e` if it's wanted later.)
- **Claiming prizes:** winners claim by adding their bank details.
- **Product name:** not decided yet. It lives in `packages/brand` (`product`), and the app is deployed under scoutgram.africa.
- **Planning ahead:** admins create match-days ahead of time, including the whole league at once. They also create teams, with their logos, ahead of time.
- **League shape:** a league runs about 14 days, with a day or two off.
- **Categories:** each league has a men's and a women's category. Both feed **one** daily prize pool.
- **Predictions:** players predict each match's set score (major) **and** the points in every set (minor). On a points tie, the closest set-score predictor ranks higher.
- **Rules:** every rule is published in plain language. The text is generated from the day's real numbers (`packages/domain/src/rules.ts`).
- **Prizes:** admins set the prize split and the number of winners.
- **Payment first:** a submission counts only once its payment is confirmed.
- **Closing:** an admin decides when a day's submissions close, either "close now" or at a scheduled time.
- **League jackpot:** a percentage of each daily pool goes into a league jackpot. Players predict the final men's and women's tables, the winner is announced at the end of the league, and earlier entries are rewarded. An admin picks the entry close date.
- **Public standings:** a standings table is shown publicly if an admin turns it on. Columns are team, played, lost, sets won, sets lost and points. Admins update it.

## Owner answers

1. **Minor score = points for every set.** The UI fills in the set winner's points (25, or 15 in the deciding set, or loser + 2 in a close set), so the player types one number per set.
2. **Late confirmation:** a transfer counts if it reached our account before the cutoff, even if an admin confirms it later. Confirmation is allowed until finalization, and the pool freezes then.
3. **Unused prize money:** if fewer eligible players enter than there are prize places, the unused share is redistributed pro-rata across the places that do have winners.
4. **Picks before payment:** players can pick before their payment is confirmed. Picks show as "not valid yet" until it is.
5. **Who can win the jackpot:** anyone signed in can submit standings, but only players with at least one confirmed, paid daily entry in that league can win.
6. **How the jackpot is won:** the closest prediction wins. For each team, count how many places off the prediction is, across both tables. The lowest total wins, and a perfect prediction scores 0.
7. **Jackpot ties:** among players equally close, the one who submitted first wins.
8. **Jackpot predictions are final once submitted** (owner, 13 Oct 2026): each player submits once, and nobody can change it afterwards, staff included. A database trigger enforces this.
9. **Fixed jackpot deadline** (owner, 13 Oct 2026): staff set the deadline when creating the league. They can change it only until the first prediction is submitted; after that it is fixed, because moving it would be unfair to players who can no longer change their prediction.
10. **Corrected bank details** (owner, 14 Oct 2026): when staff mark a payout's bank details invalid, the player's correction is used straight away instead of after the usual 24-hour wait, since the old account is known not to work. The payout returns to Ready with a note asking finance to compare the bank's name check with the old account name. The player is still emailed about the change.

## Fairness rule (design review)

Answers 2 and 4 together would let someone predict, watch the first matches, and then pay only if they were doing well. To prevent that, **a prediction counts for a match only if the player's money reached us before that match locked** (`entry.creditedAt < lockAt(match)`).

## Defaults

- **Prize pool:** 80% of entry fees becomes prize money and 20% goes to operations. 10% of that prize money goes to the jackpot. Sponsor money stays wherever the sponsor committed it.
- **Prize split (top 10):** 40 / 20 / 12.5 / 7.5 / 5 / 4 / 3 / 3 / 2.5 / 2.5.
- **Scoring per match:**
  - correct winner: 3 points
  - right number of sets: +2
  - exact set score: +2
  - The bonuses need the right winner, so a match scores 0, 3 or 7. Points ties are therefore common, and the set-score tie-break decides many places.
- **Tie order:**
  1. points
  2. closest set scores
  3. most exact scores
  4. most correct winners
  5. if still tied, players share the prize money of the places they occupy
- **Locks:** each match locks at its scheduled start (minus optional lead minutes) or when the day closes, whichever is first. Admins can mark a match "started early". Once a lock has passed it never reopens.
- **Who is eligible:** a confirmed payment, not disqualified, and at least one prediction that counts.
- **Void matches:** void, postponed and abandoned matches don't count, and we use the league's official result (forfeits count as declared). If fewer than half of a day's matches are played, the day is cancelled and everyone gets a full refund.
- **The pool never shrinks (PRD §8.4):**
  - A disqualified duplicate account's fee stays in the pool.
  - If an admin revokes a mistaken confirmation, the operator tops the pool up.
- **Wrong amounts:** an overpayment is refunded or applied to another entry. An underpayment is refunded.
- **Cancelled day:** the full fee is refunded, the jackpot gets no contribution, and sponsor money is returned.
- **Rounding:** the place amounts always add up exactly to the pool. Kobo left over from splitting a tie goes to operations.
- **Nobody qualifies for the jackpot:** it carries over to the next league.
- **Who sees jackpot predictions:** other players' predicted tables stay private until settlement. After entries close, a provisional ranking against the current standings is shown.
- **Standings helper:** "fill from results" uses FIVB points: 3 for a 3–0 or 3–1 win, 2 for a 3–2 win, 1 for a 2–3 loss, 0 otherwise. Admins can still edit any number by hand.
- **Prize claims:** no claim deadline or forfeiture in the MVP.
- **Results:** the admin who enters a result can also confirm it.
- **Payments:** manual bank-transfer reconciliation, as in PRD §7. Payment gateways usually treat paid prize contests as gaming that needs a licence.
