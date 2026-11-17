import { addRouteCoordinate, MAX_ROUTE_POINTS, routeCoordinateRows, updateRouteCoordinate } from './cms-route-fields';
import { isSeaRoutePoint, type SeaRoutePoint } from './sea-route';

/** Empty rows stay unplaced until the editor explicitly supplies their locations. */
export function initialMapRouteText(source: string): string {
  return routeCoordinateRows(source).length < 2 ? addRouteCoordinate(source) : source;
}

export function mapRoutePoints(text: string): (SeaRoutePoint | null)[] {
  return routeCoordinateRows(text).map(row => {
    if (!row.latitude.trim() || !row.longitude.trim()) return null;
    const point = [Number(row.latitude), Number(row.longitude)];
    return isSeaRoutePoint(point) ? point : null;
  });
}

export function isMapRouteReady(text: string): boolean {
  const points = mapRoutePoints(text);
  return points.length >= 2 && points.length <= MAX_ROUTE_POINTS && points.every(point => point !== null);
}

/** Round only a deliberately moved point; preserve every other row verbatim. */
export function moveMapRoutePoint(text: string, index: number, latitude: number, longitude: number): string {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isInteger(index) || index < 0) return text;
  const lat = Math.max(-90, Math.min(90, latitude));
  const lng = longitude >= -180 && longitude <= 180 ? longitude : ((longitude + 180) % 360 + 360) % 360 - 180;
  const next = updateRouteCoordinate(text, index, 'latitude', String(Number(lat.toFixed(6))));
  return updateRouteCoordinate(next, index, 'longitude', String(Number(lng.toFixed(6))));
}

type MapPosition = readonly [number, number];
const radians = Math.PI / 180;
const mercatorLimit = 85.0511287798;
const project = ([latitude, longitude]: MapPosition): MapPosition => [
  longitude * radians,
  Math.log(Math.tan(Math.PI / 4 + Math.max(-mercatorLimit, Math.min(mercatorLimit, latitude)) * radians / 2)),
];
function geographicDistance(a: MapPosition, b: MapPosition) {
  const halfLatitude = (b[0] - a[0]) * radians / 2, halfLongitude = (b[1] - a[1]) * radians / 2;
  const value = Math.sin(halfLatitude) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(halfLongitude) ** 2;
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.max(0, value)), Math.sqrt(Math.max(0, 1 - value)));
}
function distanceToMapSegment(point: MapPosition, start: MapPosition, finish: MapPosition) {
  const p = project(point), a = project(start), b = project(finish);
  const x = b[0] - a[0], y = b[1] - a[1], squared = x * x + y * y;
  const t = squared ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / squared)) : 0;
  const candidate: MapPosition = [(2 * Math.atan(Math.exp(a[1] + t * y)) - Math.PI / 2) / radians, (a[0] + t * x) / radians];
  return Math.min(geographicDistance(point, start), geographicDistance(point, finish), geographicDistance(point, candidate));
}

/** Insert at the closest displayed segment; equal distances keep the first segment. */
export function addMapRoutePoint(text: string, latitude: number, longitude: number): { text: string; index: number } | null {
  const points = mapRoutePoints(text);
  if (!isMapRouteReady(text) || points.length >= MAX_ROUTE_POINTS || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // Match moved-point world-copy normalization, retaining the placed precision.
  const point: MapPosition = [Math.max(-90, Math.min(90, latitude)), longitude >= -180 && longitude <= 180 ? longitude : ((longitude + 180) % 360 + 360) % 360 - 180];
  let index = 1, closest = Infinity;
  for (let segment = 1; segment < points.length; segment++) {
    const distance = distanceToMapSegment(point, points[segment - 1]!, points[segment]!);
    if (distance < closest - 0.000001) { closest = distance; index = segment; }
  }
  const parts = text.split(/(\r?\n)/);
  const newline = parts[index * 2 - 1] || parts[1] || '\n';
  parts.splice(index * 2, 0, `${point[0]},${point[1]}`, newline);
  return { text: parts.join(''), index };
}

export function applyMapRouteChanges(source: string, current: string, draft: string): string {
  if (source !== current) throw new Error('The route points changed while this map was open. Close it and open the map again.');
  if (!isMapRouteReady(draft)) throw new Error('Set a valid location for every point before applying.');
  return draft;
}
