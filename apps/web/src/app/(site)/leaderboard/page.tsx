import type { Metadata } from 'next';
import { LeaderboardIndex } from '@/components/leaderboard/leaderboard-index';

export const metadata: Metadata = { title: 'Results' };

export default function LeaderboardPage() {
  return <LeaderboardIndex />;
}
