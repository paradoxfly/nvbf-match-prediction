import type { UserStatus } from '@predict/contracts';
import { Badge } from '@predict/ui/badge';
import { TriangleAlert } from 'lucide-react';

export function PlayerStatusBadge({ status }: { status: UserStatus }) {
  return status === 'suspended' ? (
    <Badge variant="destructive">Suspended</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  );
}

/** Red flag: the player's payout bank account matches other players' (possible duplicates). */
export function SharedAccountBadge({ others }: { others: { id: string; displayName: string }[] }) {
  if (others.length === 0) return null;
  const names = others.map((other) => other.displayName);
  const shown =
    names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  return (
    <Badge variant="destructive" title={`Same payout bank account as ${names.join(', ')}`}>
      <TriangleAlert aria-hidden />
      Shares bank account with {shown}
    </Badge>
  );
}
