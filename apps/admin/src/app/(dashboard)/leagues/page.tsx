import type { Metadata } from 'next';
import { LeaguesScreen } from './_components/leagues-screen';

export const metadata: Metadata = { title: 'Leagues' };

export default function LeaguesPage() {
  return <LeaguesScreen />;
}
