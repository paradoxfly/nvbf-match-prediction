import { product } from '@predict/brand';
import type { EmailContent } from '@predict/db';
import { formatNaira, formatWatDateTime, ordinal } from '@predict/domain';
import type { OutgoingEmail } from './email-transport';

// Every email players get, in one place so the wording is easy to review.

const dayFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Tue 13 Oct" for a YYYY-MM-DD match-day. */
const formatDay = (date: string) => {
  const parts = dayFormat.formatToParts(new Date(`${date}T00:00:00Z`));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')}`;
};

export function signInCodeEmail(code: string, minutes: number): OutgoingEmail {
  return {
    subject: `${code} is your ${product.name} code`,
    heading: 'Your sign-in code',
    paragraphs: [
      `Enter this code to sign in. It expires in ${minutes} minutes.`,
      "Never share it with anyone. We will never ask you for it. If you didn't ask for a code, you can ignore this email.",
    ],
    code,
  };
}

export function prizeWonEmail(input: {
  rank: number;
  date: string;
  prizeKobo: number;
  link: string;
}): EmailContent {
  return {
    subject: `You won ${formatNaira(input.prizeKobo)} on ${product.name}`,
    heading: `You finished ${ordinal(input.rank)} and won ${formatNaira(input.prizeKobo)}!`,
    paragraphs: [
      `Congratulations on your ${formatDay(input.date)} result.`,
      'Check that your bank details are in the app so we can pay you.',
    ],
    action: { label: 'Claim your prize', url: input.link },
  };
}

export function dayCancelledEmail(input: {
  date: string;
  feeKobo: number;
  link: string;
}): EmailContent {
  return {
    subject: `The ${formatDay(input.date)} contest was cancelled`,
    heading: 'This contest was cancelled',
    paragraphs: [
      `The ${formatDay(input.date)} contest was cancelled, so we're refunding your ${formatNaira(input.feeKobo)} in full.`,
      'Check that your bank details are in the app so we can send it.',
    ],
    action: { label: 'Check my bank details', url: input.link },
  };
}

export function paymentConfirmedEmail(input: {
  date: string;
  feeKobo: number;
  link: string;
}): EmailContent {
  return {
    subject: `Your ${formatDay(input.date)} entry is confirmed`,
    heading: "You're in. Good luck!",
    paragraphs: [
      `We've confirmed your ${formatNaira(input.feeKobo)} entry for ${formatDay(input.date)}.`,
      'You can keep changing your picks until each match locks.',
    ],
    action: { label: 'See my picks', url: input.link },
  };
}

export function jackpotWonEmail(input: {
  leagueName: string;
  amountKobo: number;
  link: string;
}): EmailContent {
  return {
    subject: `You won the ${input.leagueName} jackpot`,
    heading: `You won the jackpot: ${formatNaira(input.amountKobo)}!`,
    paragraphs: [
      `Your prediction of the final ${input.leagueName} tables was the closest.`,
      'Check that your bank details are in the app so we can pay you.',
    ],
    action: { label: 'Claim your jackpot', url: input.link },
  };
}

export function payoutAccountChangedEmail(input: { activeFrom: Date }): EmailContent {
  return {
    subject: 'Your payout bank details were changed',
    heading: 'Your bank details were changed',
    paragraphs: [
      `The bank account we pay your winnings into was changed. We'll start using the new account from ${formatWatDateTime(input.activeFrom)}.`,
      `Not you? Contact ${product.supportEmail} right away and we'll stop it.`,
    ],
  };
}

export function payoutFailedEmail(input: { amountKobo: number; link: string }): EmailContent {
  return {
    subject: `We couldn't pay your ${formatNaira(input.amountKobo)}`,
    heading: "We couldn't send your money",
    paragraphs: [
      `Our transfer of ${formatNaira(input.amountKobo)} didn't go through.`,
      'Please check your bank details in the app, and we will try again.',
    ],
    action: { label: 'Check my bank details', url: input.link },
  };
}
