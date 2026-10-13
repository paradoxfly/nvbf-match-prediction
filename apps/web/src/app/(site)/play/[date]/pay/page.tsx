import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PayScreen } from '@/components/play/pay-screen';
import { SessionGate } from '@/components/session';
import { formatDay, isIsoDate } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/play/[date]/pay'>): Promise<Metadata> {
  const { date } = await params;
  return {
    title: isIsoDate(date) ? `Pay · ${formatDay(date)}` : 'Pay',
    robots: { index: false, follow: false },
  };
}

export default async function PayPage({ params }: PageProps<'/play/[date]/pay'>) {
  const { date } = await params;
  if (!isIsoDate(date)) notFound();
  return (
    <SessionGate>
      <PayScreen date={date} />
    </SessionGate>
  );
}
