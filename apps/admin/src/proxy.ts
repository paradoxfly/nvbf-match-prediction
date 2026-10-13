import { NextResponse, type NextRequest } from 'next/server';

/**
 * Optimistic routing only: every admin API call is authorized by the API. The hint cookie is
 * set with the admin session and cleared when it can't be refreshed.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const signedIn = request.cookies.has('pd_admin_signed_in') || request.cookies.has('pd_admin_at');

  if (pathname === '/login') {
    return signedIn ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next();
  }
  if (!signedIn) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)'],
};
