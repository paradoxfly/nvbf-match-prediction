import type { Metadata } from 'next';
import { MeScreen } from '@/components/me/me-screen';

export const metadata: Metadata = { title: 'Me', robots: { index: false, follow: false } };

export default function MePage() {
  return <MeScreen />;
}
