/**
 * Scoutgram "Floodlight" tokens (see BRAND.md). Plain values so any renderer can use them:
 * Tailwind (via tokens.css), react-pdf CV templates, emails, and a future React Native app.
 */
export const colors = {
  night: '#0A0A0A',
  flash: '#FFD400',
  chalk: '#FFFFFF',
  ink: '#0A0A0A',
  mute: '#666666',
  surface: '#EFEFEF',
  danger: '#DC2626',
  success: '#15803D',
} as const;

export const fonts = {
  display: '"Hanken Grotesk", system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const radius = { sm: 8, md: 16, lg: 28, pill: 9999 } as const;

export const shadows = {
  card: '0 1px 3px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.06)',
} as const;

export const tagline = 'be seen.';

/**
 * The product built on this brand. The name isn't final: change it here (and in NEXT_PUBLIC_*
 * env if overridden) and every page, SMS and rules document follows.
 */
export const product = {
  /** Full name used in titles, SMS and the rules. */
  name: 'Scoutgram Predict',
  /** Lowercase wordmark next to the Flight-S mark. */
  wordmark: 'predict',
  /** Short name for the home screen icon and tight spaces. */
  shortName: 'Predict',
  tagline: 'call every set. win every day.',
  supportEmail: 'support@scoutgram.africa',
} as const;
