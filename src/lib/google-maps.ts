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

type MapsDataNode = { field: number; type: string; value: string; children: MapsDataNode[] };

/** Message lengths count the following flattened tokens, including nested headers. */
function mapsDataTree(source: string): MapsDataNode[] | null {
  const start = source.indexOf('!');
  if (start < 0) return null;
  const tokens = source.slice(start + 1).replace(/\/$/, '').split('!');
  if (tokens.length > 1024) return null;
  let cursor = 0;
  function read(end: number, depth: number): MapsDataNode[] | null {
    if (depth > 32) return null;
    const nodes: MapsDataNode[] = [];
    while (cursor < end) {
      const match = /^([1-9]\d*)([a-z])([\s\S]*)$/.exec(tokens[cursor++]);
      if (!match || !Number.isSafeInteger(Number(match[1]))) return null;
      const node: MapsDataNode = { field: Number(match[1]), type: match[2], value: match[3], children: [] };
      if (node.type === 'm') {
        if (!/^\d+$/.test(node.value)) return null;
        const childEnd = cursor + Number(node.value);
        if (!Number.isSafeInteger(childEnd) || childEnd > end) return null;
        const children = read(childEnd, depth + 1);
        if (!children) return null;
        node.children = children;
      }
      nodes.push(node);
    }
    return nodes;
  }
  return read(tokens.length, 0);
}

/** A place payload can retain an earlier search under 4m/1m beside its selected 4m/3m pin. */
function selectedPlacePin(source: string, pathSource: boolean): GoogleMapsCoordinates | null {
  const dataStart = pathSource ? source.indexOf('/data=') : -1;
  if (dataStart >= 0) {
    // A place name can contain !; never discard coordinate tokens before the payload.
    if (/!3d|!4d/.test(source.slice(0, dataStart))) return null;
    source = source.slice(dataStart + '/data='.length);
  }
  const roots = mapsDataTree(source);
  if (!roots) return null;
  const places = roots.filter(node => node.field === 4 && node.type === 'm');
  if (places.length !== 1) return null;
  const selected = places[0].children.filter(node => node.field === 3 && node.type === 'm');
  if (selected.length !== 1) return null;
  const pins = selected[0].children.filter(node => node.field === 8 && node.type === 'm');
  if (pins.length !== 1) return null;
  const [latitude, longitude, extra] = pins[0].children;
  if (extra || latitude?.field !== 3 || latitude.type !== 'd' || longitude?.field !== 4 || longitude.type !== 'd') return null;
  const point = coordinates(latitude.value, longitude.value);
  if (!point) return null;
  const allowed = new Set<MapsDataNode>([latitude, longitude]);
  const includeContext = (node: MapsDataNode) => { allowed.add(node); node.children.forEach(includeContext); };
  places[0].children.filter(node => node.field === 1 && node.type === 'm').forEach(includeContext);
  const onlyKnownPoints = (nodes: MapsDataNode[]): boolean => nodes.every(node =>
    !(node.type === 'd' && (node.field === 3 || node.field === 4) && !allowed.has(node)) && onlyKnownPoints(node.children));
  return onlyKnownPoints(roots) ? point : null;
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
  const sources = [path, ...params.getAll('data')];
  const data = sources.join('\n');
  if (/!3d|!4d/.test(data)) {
    const matches = [...data.matchAll(/!3d([^!/?#\n]+)!4d([^!/?#\n]+)/g)];
    if (matches.length !== (data.match(/!3d/g)?.length ?? 0) || matches.length !== (data.match(/!4d/g)?.length ?? 0)) return null;
    const points = matches.map(match => coordinates(match[1], match[2]));
    if (points.some(point => !point)) return null;
    const unique = onePoint(points);
    if (unique) return unique;
    // Resolve each payload independently so a message cannot span path/query boundaries.
    return onePoint(sources.flatMap((source, index) => {
      if (!/!3d|!4d/.test(source)) return [];
      const sourcePoints = [...source.matchAll(/!3d([^!/?#\n]+)!4d([^!/?#\n]+)/g)].map(match => coordinates(match[1], match[2]));
      return [onePoint(sourcePoints) || selectedPlacePin(source, index === 0)];
    }));
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
