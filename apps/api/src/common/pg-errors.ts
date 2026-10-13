/** The Postgres error behind a failed query (drizzle wraps it in `cause`). */
function pgError(error: unknown): { code?: string; constraint?: string } | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth++) {
    const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string') {
      return {
        code: candidate.code,
        constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
      };
    }
    current = candidate.cause;
  }
  return null;
}

/** True for a unique-constraint violation, optionally on a constraint whose name contains `name`. */
export function isUniqueViolation(error: unknown, name?: string): boolean {
  const pg = pgError(error);
  if (pg?.code !== '23505') return false;
  return name === undefined || (pg.constraint ?? '').includes(name);
}
