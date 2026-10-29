import { NextResponse, type NextRequest } from 'next/server';
import { PUBLIC_LANGUAGE_COOKIE, PUBLIC_LANGUAGE_MAX_AGE } from '@/lib/public-locale';
import { siteOrigin } from '@/lib/site-config';

function isBackgroundRequest(request: NextRequest) {
  return request.headers.get('rsc') === '1'
    || request.headers.get('next-router-prefetch') === '1'
    || request.headers.get('purpose') === 'prefetch'
    || request.headers.get('sec-purpose')?.includes('prefetch');
}

function isInternalNavigation(request: NextRequest) {
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    const origin = new URL(referer).origin;
    // A reverse proxy can expose HTTPS while Next sees an internal HTTP URL.
    return origin === request.nextUrl.origin || (Boolean(process.env.NEXT_PUBLIC_SITE_URL) && origin === siteOrigin());
  }
  catch { return false; }
}

export function proxy(request: NextRequest) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return NextResponse.next();
  const { pathname } = request.nextUrl;

  // Old English links remain English, including /en with a Thai preference.
  if (pathname === '/en' || pathname.startsWith('/en/')) {
    const target = request.nextUrl.clone();
    target.pathname = pathname.slice(3) || '/';
    const response = NextResponse.redirect(target, 308);
    if (!isBackgroundRequest(request)) response.cookies.set(PUBLIC_LANGUAGE_COOKIE, 'en', {
      path: '/', maxAge: PUBLIC_LANGUAGE_MAX_AGE, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:',
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  // Only a new homepage entrance restores a preference. Explicit links from
  // the site and RSC navigation retain the language encoded in their URL.
  if (pathname === '/' && request.cookies.get(PUBLIC_LANGUAGE_COOKIE)?.value === 'th'
    && !isBackgroundRequest(request) && !isInternalNavigation(request)) {
    const target = request.nextUrl.clone();
    target.pathname = '/th';
    const response = NextResponse.redirect(target, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Vary', 'Cookie');
    return response;
  }
  return NextResponse.next();
}

export const config = { matcher: ['/', '/en/:path*'] };
