/** Verifies a Cloudflare Turnstile token. Returns true when no secret is configured (dev). */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  ip: string,
): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5_000),
    });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
