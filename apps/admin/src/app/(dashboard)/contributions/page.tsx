import type { Metadata } from 'next';
import { ContributionsScreen } from './_components/contributions-screen';

export const metadata: Metadata = { title: 'Sponsors & top-ups' };

export default function ContributionsPage() {
  return <ContributionsScreen />;
}
