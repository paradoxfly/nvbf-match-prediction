import type { Metadata } from 'next';
import { JackpotScreen } from '@/components/jackpot/jackpot-screen';

export const metadata: Metadata = {
  title: 'League jackpot',
  description:
    "Predict the final men's and women's league tables. The closest prediction wins the whole jackpot.",
};

export default function JackpotPage() {
  return <JackpotScreen />;
}
