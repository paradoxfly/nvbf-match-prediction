import type { Metadata } from 'next';
import { PlayIndex } from '@/components/play/play-index';

export const metadata: Metadata = { title: 'Play', robots: { index: false, follow: false } };

export default function PlayPage() {
  return <PlayIndex />;
}
