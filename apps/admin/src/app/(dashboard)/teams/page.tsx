import type { Metadata } from 'next';
import { TeamsScreen } from './_components/teams-screen';

export const metadata: Metadata = { title: 'Teams' };

export default function TeamsPage() {
  return <TeamsScreen />;
}
