import type { Metadata } from 'next';
import { ReportsScreen } from './_components/reports-screen';

export const metadata: Metadata = { title: 'Reports' };

export default function ReportsPage() {
  return <ReportsScreen />;
}
