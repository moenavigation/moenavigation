import 'server-only';
import { googleMapsUrl, isGoogleMapsShortUrl, parseGoogleMapsCoordinates, type GoogleMapsCoordinates } from '@/lib/google-maps';
import { HttpError } from './http';

const invalidLink = 'Enter a valid HTTPS Google Maps link.';
const noPoint = 'This link does not identify one precise point. In Google Maps, select a pin and copy its full link, or enter the coordinates manually.';
const unavailable = 'The Google Maps link could not be opened. Try again or paste its full link.';
const timeout = 'Google Maps took too long to respond. Try again or paste its full link.';
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maximumRequests = 4;

/** Expand only short Maps links; never download or scrape a place page. */
export async function resolveGoogleMapsCoordinates(input: string, options: {
  fetch?: typeof fetch;
  signal?: AbortSignal;
} = {}): Promise<GoogleMapsCoordinates> {
  let url = googleMapsUrl(input);
  if (!url) throw new HttpError(400, invalidLink);
  const direct = parseGoogleMapsCoordinates(url.href);
  if (direct) return direct;
  if (!isGoogleMapsShortUrl(url)) throw new HttpError(422, noPoint);

  const fetcher = options.fetch ?? fetch;
  const deadline = AbortSignal.timeout(8000);
  const signal = options.signal ? AbortSignal.any([deadline, options.signal]) : deadline;
  const visited = new Set<string>();
  try {
    for (let request = 0; request < maximumRequests; request++) {
      if (visited.has(url.href)) throw new HttpError(502, unavailable);
      visited.add(url.href);
      const response = await fetcher(url.href, {
        method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit',
        headers: { Accept: 'text/html' }, signal,
      });
      // Headers alone are sufficient. Cancel response bodies, including errors.
      await response.body?.cancel();
      if (response.status === 429 || response.status >= 500) throw new HttpError(502, unavailable);
      if (!redirectStatuses.has(response.status)) throw new HttpError(422, noPoint);
      const location = response.headers.get('location');
      if (!location) throw new HttpError(502, unavailable);
      let next: URL | null;
      try { next = googleMapsUrl(new URL(location, url).href); } catch { next = null; }
      if (!next) throw new HttpError(400, invalidLink);
      const point = parseGoogleMapsCoordinates(next.href);
      if (point) return point;
      if (!isGoogleMapsShortUrl(next)) throw new HttpError(422, noPoint);
      url = next;
    }
    throw new HttpError(502, unavailable);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(deadline.aborted ? 504 : 502, deadline.aborted ? timeout : unavailable);
  }
}
