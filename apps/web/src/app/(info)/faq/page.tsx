import { product } from '@predict/brand';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Questions and answers',
  description:
    'How to join and pay, when picks lock, how points and ties work, the league jackpot, prizes and refunds.',
};

interface Question {
  id: string;
  question: string;
  answer: ReactNode;
}

const QUESTIONS: Question[] = [
  {
    id: 'join',
    question: 'How do I join?',
    answer: (
      <>
        <p>
          Sign in with your email address. We email you a code, so there&apos;s no password to
          remember. The first time, we also ask for your phone number so we can reach you if you
          win.
        </p>
        <p>
          Open today&apos;s matches under <Link href="/play">Play</Link>, pick every match and tap
          Save. Then pay the entry fee by bank transfer. The fee is shown on each day (usually
          ₦500).
        </p>
      </>
    ),
  },
  {
    id: 'pay',
    question: 'How do I pay?',
    answer: (
      <>
        <p>
          On the payment page you&apos;ll see our bank account, the exact amount and your payment
          reference. Send exactly that amount from your bank app, with the reference in the
          description.
        </p>
        <p>
          Then tap &quot;I&apos;ve sent it&quot; and tell us whose account it came from. We check
          every payment against our bank account by hand.
        </p>
      </>
    ),
  },
  {
    id: 'reference',
    question: 'What is the payment reference for?',
    answer: (
      <p>
        It&apos;s a short code that belongs to your entry only, like 7K3QX9S. Typing it in the
        transfer description (narration) lets us match your money to your entry quickly. Without it
        we can still find your payment, but it takes longer.
      </p>
    ),
  },
  {
    id: 'lock',
    question: 'When do picks lock?',
    answer: (
      <>
        <p>
          Each match locks when it starts, or when we close the day, whichever comes first. If a
          match starts early, it locks when it starts. Some days lock a few minutes before kick-off:
          the day&apos;s rules say so.
        </p>
        <p>You can change your picks as often as you like until each match locks.</p>
      </>
    ),
  },
  {
    id: 'not-counting',
    question: "Why doesn't my pick count?",
    answer: (
      <>
        <p>
          A pick only counts for matches that start after your money reaches our account. Otherwise
          someone could watch the first matches and only pay if they were doing well. So pay early,
          before the first match.
        </p>
        <p>
          It&apos;s the time your money arrived that matters, not when we confirmed it. Picks also
          don&apos;t count for matches that are cancelled or postponed.
        </p>
      </>
    ),
  },
  {
    id: 'points',
    question: 'How do points work?',
    answer: (
      <>
        <p>For each match you predict the set score (like 3–1) and the points in every set.</p>
        <ul>
          <li>3 points for the right winner.</li>
          <li>2 more for the right number of sets.</li>
          <li>2 more for the exact set score.</li>
        </ul>
        <p>
          The extra points need the right winner, so a match is worth 0, 3 or 7 points. Each
          day&apos;s <Link href="/rules">rules</Link> show its exact numbers.
        </p>
      </>
    ),
  },
  {
    id: 'ties',
    question: 'What happens when players have the same points?',
    answer: (
      <>
        <p>
          The player whose set scores were closest ranks higher. We add up how many points your
          predicted sets were off, for every set of every match. Lower is better. After that: most
          exact set scores, then most correct winners.
        </p>
        <p>
          If players are still level, they share the prize money of the places they take up in equal
          parts.
        </p>
      </>
    ),
  },
  {
    id: 'jackpot',
    question: 'How does the league jackpot work?',
    answer: (
      <>
        <p>
          Predict the final men&apos;s and women&apos;s league tables on the{' '}
          <Link href="/jackpot">Jackpot</Link> page. For each team we count how many places you are
          off and add them up. The lowest total wins the whole jackpot.
        </p>
        <p>
          If players are equally close, whoever saved first wins, so changing your prediction resets
          your time. Entering is free, but to win you need at least one paid, confirmed daily entry
          in the league.
        </p>
      </>
    ),
  },
  {
    id: 'prizes',
    question: 'When and how are prizes paid?',
    answer: (
      <>
        <p>
          Once every result of the day is confirmed, we announce the winners and their prizes. We
          pay by bank transfer to an account in your name.
        </p>
        <p>
          Add your bank details under <Link href="/me">Me</Link>. You can follow each payment there
          too. A change of bank details takes effect after 24 hours, and we email you about it.
        </p>
      </>
    ),
  },
  {
    id: 'refunds',
    question: 'Can I get a refund?',
    answer: (
      <>
        <p>
          If we cancel a match day, for example because fewer than half of its matches are played,
          everyone who paid gets a full refund.
        </p>
        <p>
          We also refund money that arrives after the last match has locked, and payments of the
          wrong amount. Refunds show under <Link href="/me">Me</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    question: 'Can I have more than one account?',
    answer: (
      <p>
        No. It&apos;s one account per person, and you must be 18 or older. If we find duplicate
        accounts after a review, their entries can be disqualified, and their fees stay in the prize
        pool.
      </p>
    ),
  },
  {
    id: 'safety',
    question: 'Will you ever ask for my PIN or code?',
    answer: (
      <p>
        Never. We will never ask for your bank PIN, password or the sign-in code we email you.
        Anyone who asks is not us.
      </p>
    ),
  },
  {
    id: 'contact',
    question: 'How do I contact you?',
    answer: (
      <p>
        Email <a href={`mailto:${product.supportEmail}`}>{product.supportEmail}</a>. If it&apos;s
        about a payment, include your payment reference.
      </p>
    ),
  },
];

export default function FaqPage() {
  return (
    <article>
      <h1>questions and answers</h1>
      <p>
        Short answers to what players ask most. The full detail is in the{' '}
        <Link href="/rules">rules</Link>.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        {QUESTIONS.map((item) => (
          <details
            key={item.id}
            id={item.id}
            className="group scroll-mt-6 rounded-lg border border-border bg-card px-4 open:pb-4"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-extrabold [&::-webkit-details-marker]:hidden">
              {item.question}
              <span
                aria-hidden
                className="font-mono text-lg leading-none text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="text-sm leading-relaxed [&>p:first-child]:mt-0">{item.answer}</div>
          </details>
        ))}
      </div>
    </article>
  );
}
