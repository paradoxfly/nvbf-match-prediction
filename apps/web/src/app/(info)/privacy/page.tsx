import { product } from '@predict/brand';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <article>
      <h1>privacy</h1>
      <p>
        We collect as little as we can, keep it safe, and only use it to run {product.name}. This
        notice follows the Nigeria Data Protection Act 2023.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          Your email address, to sign you in with an emailed code and to tell you about your entries
          and prizes.
        </li>
        <li>
          Your phone number, so we can reach you if you win. Each number can only be used by one
          account.
        </li>
        <li>Your display name, shown on leaderboards.</li>
        <li>Your predictions, entries and payment confirmations.</li>
        <li>
          If you win or are owed a refund: your bank name, account number and account name. The
          account number is encrypted and only our finance team can see it, to pay you.
        </li>
      </ul>

      <h2>What we never show publicly</h2>
      <p>Your email address, phone number and bank details are never shown to other players.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li>Our email provider (Zapiack), to deliver your sign-in codes and notifications.</li>
        <li>Our bank, to send prizes and refunds.</li>
        <li>Authorities, only where the law requires it.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask to see, correct or delete your data at{' '}
        <a href={`mailto:${product.supportEmail}`}>{product.supportEmail}</a>. Records we must keep
        for payments and audits are kept for as long as the law requires.
      </p>
    </article>
  );
}
