import { Alert } from '@predict/ui/alert';
import { cn } from '@predict/ui/utils';
import { errorDetails, errorMessage } from '@/lib/errors';

/** An API error for staff: the message, plus blockers/issues/amounts when the API sends them. */
export function ErrorAlert({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const details = errorDetails(error);
  return (
    <Alert variant="destructive" className={cn('flex flex-col gap-1', className)}>
      <p className="font-semibold">{errorMessage(error)}</p>
      {details.length > 0 ? (
        <ul className="flex list-disc flex-col gap-0.5 pl-4">
          {details.map((line, index) => (
            <li key={`${index}-${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}
    </Alert>
  );
}
