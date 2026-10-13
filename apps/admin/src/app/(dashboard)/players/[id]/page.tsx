import type { Metadata } from 'next';
import { PlayerScreen } from './_components/player-screen';

export const metadata: Metadata = { title: 'Player' };

export default function PlayerPage() {
  return <PlayerScreen />;
}
