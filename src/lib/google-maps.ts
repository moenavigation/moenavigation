export type GoogleMapsCoordinates = { latitude: number; longitude: number };

export const MAX_GOOGLE_MAPS_URL_LENGTH = 8192;

// Keep the network allowlist explicit: a Google-looking suffix is not sufficient.
const mapsHosts = new Set([
  'google.com', 'www.google.com', 'maps.google.com',
  'google.co.th', 'www.google.co.th', 'maps.google.co.th',
]);
const decimal = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const pairPattern = new RegExp(`^\\s*(${decimal})\\s*,\\s*(${decimal})\\s*$`, 'i');

export function googleMapsPointUrl(latitude: number, longitude: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
}

/** Accept only Maps URLs, never arbitrary Google pages or redirect endpoints. */
export function googleMapsUrl(input: string): URL | null {
  const value = input.trim();
  if (!value || value.length > MAX_GOOGLE_MAPS_URL_LENGTH || /[\u0000-\u001f\u007f\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (isGoogleMapsShortUrl(url)) return url;
    if (!mapsHosts.has(url.hostname)) return null;
    if (/^\/maps(?:\/|$)/.test(url.pathname)) return url;
    return url.hostname.startsWith('maps.') && url.pathname === '/' ? url : null;
  } catch { return null; }
}

export function isGoogleMapsShortUrl(url: URL): boolean {
  return (url.hostname === 'maps.app.goo.gl' && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname))
    || (url.hostname === 'goo.gl' && /^\/maps\/[A-Za-z0-9_-]+\/?$/.test(url.pathname));
}

function coordinates(latitude: string, longitude: string): GoogleMapsCoordinates | null {
  if (!pairPattern.test(`${latitude},${longitude}`)) return null;
  const lat = Number(latitude), lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { latitude: lat, longitude: lng } : null;
}

function parsePair(value: string): GoogleMapsCoordinates | null {
  const match = pairPattern.exec(value);
  return match ? coordinates(match[1], match[2]) : null;
}

function onePoint(points: (GoogleMapsCoordinates | null)[]): GoogleMapsCoordinates | null {
  if (!points.length || points.some(point => !point)) return null;
  const first = points[0]!;
  return points.every(point => point!.latitude === first.latitude && point!.longitude === first.longitude) ? first : null;
}

/** Read explicit point coordinates. A named place's viewport is not its pin. */
export function parseGoogleMapsCoordinates(input: string): GoogleMapsCoordinates | null {
  const url = googleMapsUrl(input);
  if (!url || isGoogleMapsShortUrl(url)) return null;
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { return null; }
  const params = url.searchParams;
  if (/^\/maps\/dir(?:\/|$)/.test(path)
    || ['origin', 'destination', 'waypoints', 'saddr', 'daddr', 'dir_action'].some(key => params.has(key))
    || (params.has('map_action') && params.get('map_action') !== 'map')
    || params.get('f') === 'd' || params.get('layer') === 'c') return null;

  // Place pin payloads take precedence over a different @ camera center.
  const data = `${path}\n${params.getAll('data').join('\n')}`;
  if (/!3d|!4d/.test(data)) {
    const matches = [...data.matchAll(/!3d([^!/?#\n]+)!4d([^!/?#\n]+)/g)];
    if (matches.length !== (data.match(/!3d/g)?.length ?? 0) || matches.length !== (data.match(/!4d/g)?.length ?? 0)) return null;
    return onePoint(matches.map(match => coordinates(match[1], match[2])));
  }

  // A Place ID overrides the fallback query, which may identify a different pin.
  if (['query_place_id', 'cid', 'ftid'].some(key => params.has(key))) return null;
  const queries = [...params.getAll('query'), ...params.getAll('q')];
  if (queries.length) return onePoint(queries.map(value => parsePair(value.replace(/^loc:\s*/i, ''))));

  const pointPath = /^\/maps\/(?:place|search)\/([^/]+)(?:\/|$)/.exec(path);
  if (pointPath) return parsePair(pointPath[1]);

  // A plain map-view URL has only a camera center, with no competing place.
  const centerPath = /^\/maps\/@([^/]+)(?:\/|$)/.exec(path);
  if (centerPath) {
    const match = new RegExp(`^(${decimal}),(${decimal})(?:,\\d+(?:\\.\\d+)?[zm])?$`, 'i').exec(centerPath[1]);
    return match ? coordinates(match[1], match[2]) : null;
  }
  if ((path === '/maps' || path === '/maps/' || path === '/maps/@' || path === '/')
    && (!params.has('map_action') || params.get('map_action') === 'map')) {
    const centers = [...params.getAll('center'), ...params.getAll('ll')];
    return onePoint(centers.map(parsePair));
  }
  return null;
}
