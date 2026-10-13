import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LeaderboardScreen } from '@/components/leaderboard/leaderboard-screen';
import { formatDay, isIsoDate } from '@/lib/format';

export async function generateMetadata({
  params,
}: PageProps<'/leaderboard/[date]'>): Promise<Metadata> {
  const { date } = await params;
  return { title: isIsoDate(date) ? `Results · ${formatDay(date)}` : 'Results' };
}

export default async function LeaderboardDayPage({ params }: PageProps<'/leaderboard/[date]'>) {
  const { date } = await params;
  if (!isIsoDate(date)) notFound();
  return <LeaderboardScreen date={date} />;
}
