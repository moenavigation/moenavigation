import { MAX_ROUTE_POINTS, routeCoordinateRows } from './cms-route-fields';

export type SeaRoutePoint = [number, number];
export type GeneratedSeaRoute = { waypoints: SeaRoutePoint[]; distanceKm: number; touchesLand?: boolean };

export function isSeaRoutePoint(value: unknown): value is SeaRoutePoint {
  return Array.isArray(value) && value.length === 2 && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate))
    && Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180;
}

export function readSeaRouteEndpoints(text: string): { origin: SeaRoutePoint; destination: SeaRoutePoint } | null {
  const rows = routeCoordinateRows(text);
  if (rows.length < 2) return null;
  const endpoints = [rows[0], rows.at(-1)!].map(row => row.latitude.trim() && row.longitude.trim() ? [Number(row.latitude), Number(row.longitude)] : null);
  if (!isSeaRoutePoint(endpoints[0]) || !isSeaRoutePoint(endpoints[1])) return null;
  const [origin, destination] = endpoints;
  if (origin[0] === destination[0] && origin[1] === destination[1]) return null;
  return { origin, destination };
}

export function isGeneratedSeaRoute(value: unknown): value is GeneratedSeaRoute {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<GeneratedSeaRoute>;
  return Array.isArray(result.waypoints) && result.waypoints.length >= 2 && result.waypoints.length <= MAX_ROUTE_POINTS
    && result.waypoints.every(isSeaRoutePoint) && typeof result.distanceKm === 'number' && Number.isFinite(result.distanceKm) && result.distanceKm > 0
    && (result.touchesLand === undefined || typeof result.touchesLand === 'boolean');
}

/** Replace only the intermediate rows; preserve the editor's endpoint precision and formatting. */
export function applyGeneratedSeaRoute(text: string, result: GeneratedSeaRoute): string {
  const endpoints = readSeaRouteEndpoints(text);
  if (!endpoints || !isGeneratedSeaRoute(result)
    || !endpoints.origin.every((coordinate, index) => coordinate === result.waypoints[0][index])
    || !endpoints.destination.every((coordinate, index) => coordinate === result.waypoints.at(-1)![index])) {
    throw new Error('The generated route no longer matches these endpoints. Generate it again.');
  }
  const lines = text.split(/\r?\n/);
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  return [lines[0], ...result.waypoints.slice(1, -1).map(point => point.join(',')), lines.at(-1)!].join(newline);
}
