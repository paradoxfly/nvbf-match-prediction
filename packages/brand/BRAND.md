# Scoutgram — Brand Identity Guide

_v1 · April 2026 · Handoff_

> **One idea:** every athlete, anywhere, should be **seen**.
> Friendly like a locker-room. Sporty like a stadium. Global like the sport itself.

---

## 1. Positioning

**Scoutgram** is a unified platform where athletes showcase their skills and scouts easily find them.

- **Primary audience:** athletes (all ages, every sport)
- **Secondary audience:** scouts, coaches, clubs
- **Brand personality:** friendly · sporty · global
- **Tagline:** **be seen.**

**Voice**

- Plainspoken. Short sentences. Lowercase energy.
- Second-person: "you", "your game", "your tape".
- Never gatekeepy. Never jargon. Never hype-bro.
- Numbers over adjectives. If it's not measured, it's not said.

---

## 2. Logo — Flight-S

The **Flight-S** is the signature mark: an S-swoop drawn as a running track / flight path, anchored by a start dot and an arrow-dot terminus. It reads as **motion**, **global travel**, and a personal **signature** all at once.

### Construction

- 120×120 viewBox
- Rounded square container, 32px corner radius, 6px inset
- S-swoop stroke: 10px, round caps, no fill
- Start dot: 6px radius, filled in accent
- End dot: 8px radius with 3px inner cut-out, gives it a "target" read
- Minimum clear space on all sides: **the height of the "S" counter** (≈ 20% of mark size)
- Minimum digital size: **24 × 24 px**
- Minimum print size: **10 × 10 mm**

### Files

All master files live in `brand/logo/`.

| File                               | Use                                  |
| ---------------------------------- | ------------------------------------ |
| `flight-s-on-night.svg` / `.png`   | Primary — mark on black              |
| `flight-s-on-flash.svg` / `.png`   | Mark on yellow                       |
| `flight-s-on-chalk.svg` / `.png`   | Mark on white                        |
| `flight-s-mono-dark.svg` / `.png`  | Single color, dark surfaces          |
| `flight-s-mono-light.svg` / `.png` | Single color, light surfaces         |
| `scoutgram-lockup-on-night.svg`    | Full horizontal lockup, black ground |
| `scoutgram-lockup-on-chalk.svg`    | Full horizontal lockup, white ground |

### Don't

- Don't rotate the mark.
- Don't stretch or squish — scale uniformly.
- Don't recolor the swoop in anything except the palette below.
- Don't drop shadows, bevels, or gradients on the mark.
- Don't place the mark on busy photography without a solid backplate.

---

## 3. Color — Floodlight

Five tokens. **Night** grounds; **Flash** spotlights. Everything else supports.

| Token       | Hex       | Role                                                     |
| ----------- | --------- | -------------------------------------------------------- |
| **Night**   | `#0A0A0A` | Primary ground. Headers, primary buttons, dark surfaces. |
| **Flash**   | `#FFD400` | Spotlight accent. CTAs, highlights, data callouts.       |
| **Chalk**   | `#FFFFFF` | Light surface. App backgrounds.                          |
| **Ink**     | `#0A0A0A` | Body copy on light surfaces.                             |
| **Mute**    | `#666666` | Captions, labels, meta.                                  |
| **Surface** | `#EFEFEF` | Dividers, subtle fills, input backgrounds.               |

### Pairings (AA+ contrast)

- Night on Chalk — body, default UI
- Flash on Night — primary CTAs
- Night on Flash — inverted CTAs, stickers
- Ink on Surface — inputs, cards

**Flash is expensive.** Use it once per screen as the eye magnet. Two flashes compete.

---

## 4. Typography

Two families. No exceptions.

### Display — Hanken Grotesk

Warm, rounded, friendly-bold. Used for headlines, wordmarks, numbers in hero slots.

- Weights in use: **500, 700, 800, 900**
- Tight letter-spacing at large sizes (`-3px` at 72+, `-1.5px` at 40+)
- Line-height ~0.9–0.95 for headlines, 1.4 for body

### Data — JetBrains Mono

Monospace, precise, sporty. Used for stats, timestamps, labels, code, metadata.

- Weights in use: **400, 500, 700**
- Wide letter-spacing on all-caps labels (`letter-spacing: 2px`)
- Used for: athlete IDs, country codes, score numbers, "BE SEEN · EVERYWHERE" style kickers

### Type scale

| Role       | Family         | Size / Weight                            |
| ---------- | -------------- | ---------------------------------------- |
| Display XL | Hanken Grotesk | 108 / 900                                |
| Display L  | Hanken Grotesk | 72 / 900                                 |
| Display M  | Hanken Grotesk | 42 / 900                                 |
| Title      | Hanken Grotesk | 28 / 800                                 |
| Body L     | Hanken Grotesk | 18 / 500                                 |
| Body       | Hanken Grotesk | 14 / 500                                 |
| Label      | JetBrains Mono | 10 / 500 uppercase `letter-spacing: 2px` |
| Stat       | JetBrains Mono | 26–48 / 700                              |

---

## 5. Global motifs

Four ways the "global" pillar shows up. Use **one dominant** per surface — never stack.

- **A. Country chips** — pill tags with flag + 3-letter code (`🇳🇬 NGA`). Use in grids.
- **B. Latitude rings** — dashed concentric circles with location pins. Use as background decoration on dark grounds.
- **C. Multilingual wall** — stacked greetings in multiple scripts. Use on hero moments.
- **D. Flag stripes** — tri-color horizontal bands. Use as dividers or tickers, never as backgrounds for body text.

---

## 6. Components

- **Border radius scale:** `8px` (sm, chips & buttons) · `16px` (md, cards) · `28px` (lg, app surfaces) · `999px` (pill).
- **Card shadow:** `0 1px 3px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.06)` — subtle, never floaty.
- **Buttons:** pill, Night bg + Flash text, bold weight, `10px 18px` padding.
- **Data blocks:** JetBrains Mono, stacked stat-over-label, all-caps label, `letter-spacing: 1px`.

---

## 7. Applications

The system has been extended to:

- iOS app icon (primary, flash, chalk variants)
- Athlete profile card — portrait 320×540, rounded 28
- Scout Pass / jersey tag — portrait 260×320, Night ground
- Sticker sheet — "SCOUTED", "MVP", "HAT-TRICK", "ROOKIE"
- Billboard — 16:9 hero with global ring motif

See `Scoutgram Brand Identity.html` for live renders.

---

## 8. Design tokens (drop into code)

```css
:root {
  --sg-night: #0a0a0a; /* primary ground */
  --sg-flash: #ffd400; /* spotlight accent */
  --sg-chalk: #ffffff; /* light surface */
  --sg-ink: #0a0a0a; /* body copy */
  --sg-mute: #666666; /* captions, labels */
  --sg-surface: #efefef; /* subtle fills, dividers */

  --sg-font-display: 'Hanken Grotesk', system-ui, sans-serif;
  --sg-font-mono: 'JetBrains Mono', monospace;

  --sg-radius-sm: 8px;
  --sg-radius-md: 16px;
  --sg-radius-lg: 28px;
  --sg-radius-pill: 999px;
}
```

```js
// scoutgram.tokens.js
export const colors = {
  night: '#0A0A0A',
  flash: '#FFD400',
  chalk: '#FFFFFF',
  ink: '#0A0A0A',
  mute: '#666666',
  surface: '#EFEFEF',
};
export const fonts = {
  display: '"Hanken Grotesk", system-ui, sans-serif',
  mono: '"JetBrains Mono", monospace',
};
export const radius = { sm: 8, md: 16, lg: 28, pill: 9999 };
```

---

## 9. Do & don't (quick)

✅ Use Flash to spotlight one thing per screen.
✅ Lead with photography of real athletes whenever possible.
✅ Pair stats (JetBrains Mono) with names (Hanken Grotesk) for card rhythm.
✅ Go lowercase in voice. Uppercase only in mono labels.

⛔️ No gradients.
⛔️ No drop shadows on the mark.
⛔️ No emoji in headlines (flags are fine in chips).
⛔️ No stock "athlete silhouette" vector art.

---

_End of guide. Questions → design@scoutgram._
