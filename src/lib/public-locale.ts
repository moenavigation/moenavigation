import type { Locale } from './content';
import type { MouseEvent } from 'react';

export const PUBLIC_LANGUAGE_COOKIE = 'moe-public-language';
export const PUBLIC_LANGUAGE_MAX_AGE = 60 * 60 * 24 * 365;

export function publicLanguageCookie(locale: Locale, secure: boolean) {
  return `${PUBLIC_LANGUAGE_COOKIE}=${locale}; Path=/; Max-Age=${PUBLIC_LANGUAGE_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

// Save before navigation so selecting English home cannot be redirected by an
// older Thai preference. Cookie restrictions must never interrupt navigation.
export function rememberPublicLocale(locale: Locale) {
  if (typeof document === 'undefined') return;
  try { document.cookie = publicLanguageCookie(locale, window.location.protocol === 'https:'); }
  catch { /* The requested language still opens when cookies are unavailable. */ }
}

export function selectPublicLocale(event: MouseEvent<HTMLAnchorElement>, locale: Locale) {
  if (event.defaultPrevented) return;
  rememberPublicLocale(locale);
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
    || (event.currentTarget.target && event.currentTarget.target !== '_self')) return;
  // Next 16 can cache an initial URL with its fragment, then append that
  // fragment again on a revisit. An anchored language change loads the cached
  // document directly so the exact query and anchor survive both directions.
  if (event.currentTarget.hash) {
    event.preventDefault();
    window.location.assign(event.currentTarget.href);
  }
}
