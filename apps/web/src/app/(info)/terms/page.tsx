import { product } from '@predict/brand';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <article>
      <h1>terms of use</h1>
      <p>
        These terms cover your use of {product.name}. The full contest rules, with the exact numbers
        for each day, are on the <Link href="/rules">rules page</Link> and form part of these terms.
      </p>

      <h2>Who can play</h2>
      <ul>
        <li>You must be 18 or older and able to make payments in your own name.</li>
        <li>One account per person. Your phone number is your account.</li>
        <li>
          Accounts that look like duplicates may be reviewed. If we confirm a duplicate, its entries
          can be disqualified; their entry fees stay in the prize pool.
        </li>
      </ul>

      <h2>Entries and payment</h2>
      <ul>
        <li>Each day has its own entry fee, shown before you pay.</li>
        <li>
          Pay by bank transfer with the reference we give you. Your entry counts once we confirm the
          money arrived.
        </li>
        <li>Money that arrives after a day closes, or a wrong amount, is refunded.</li>
      </ul>

      <h2>Prizes</h2>
      <ul>
        <li>Prizes are paid by bank transfer to an account in your name.</li>
        <li>We may ask you to confirm details before paying, to protect your winnings.</li>
        <li>We never ask for your PIN, password or one-time code.</li>
      </ul>

      <h2>Fair play</h2>
      <p>
        Don&apos;t use bots, other people&apos;s numbers or anything that gives an unfair advantage.
        We keep a record of every admin decision about entries, results and payouts.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or disputes: <a href={`mailto:${product.supportEmail}`}>{product.supportEmail}</a>
      </p>
    </article>
  );
}
