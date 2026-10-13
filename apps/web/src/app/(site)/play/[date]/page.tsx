import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PlayScreen } from '@/components/play/play-screen';
import { SessionGate } from '@/components/session';
import { formatDay, isIsoDate } from '@/lib/format';

export async function generateMetadata({ params }: PageProps<'/play/[date]'>): Promise<Metadata> {
  const { date } = await params;
  return {
    title: isIsoDate(date) ? `Picks · ${formatDay(date)}` : 'Picks',
    robots: { index: false, follow: false },
  };
}

export default async function PlayDayPage({ params }: PageProps<'/play/[date]'>) {
  const { date } = await params;
  if (!isIsoDate(date)) notFound();
  return (
    <SessionGate>
      <PlayScreen date={date} />
    </SessionGate>
  );
}
