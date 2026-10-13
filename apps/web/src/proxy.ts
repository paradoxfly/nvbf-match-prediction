import { NextResponse, type NextRequest } from 'next/server';

/** Pages that need a signed-in player. Everything else is public. */
const PLAYER_ONLY = ['/me', '/play'];

/**
 * Optimistic routing only: the API is the real gatekeeper. `pd_signed_in` is a non-secret hint
 * the API sets alongside the session cookies and clears when a session can't be refreshed.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has('pd_signed_in') || request.cookies.has('pd_at');

  if (
    !signedIn &&
    PLAYER_ONLY.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  ) {
    const url = new URL('/sign-in', request.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }

  if (signedIn && pathname === '/sign-in') {
    return NextResponse.redirect(new URL('/me', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)'],
};
