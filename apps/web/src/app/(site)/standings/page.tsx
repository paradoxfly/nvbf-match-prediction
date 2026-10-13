import type { Metadata } from 'next';
import { StandingsScreen } from '@/components/standings-screen';

export const metadata: Metadata = {
  title: 'Standings',
  description: "The men's and women's league tables.",
};

export default function StandingsPage() {
  return <StandingsScreen />;
}
