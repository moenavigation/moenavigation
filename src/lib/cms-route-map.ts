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

export function applyMapRouteChanges(source: string, current: string, draft: string): string {
  if (source !== current) throw new Error('The route points changed while this map was open. Close it and open the map again.');
  if (!isMapRouteReady(draft)) throw new Error('Set a valid location for every point before applying.');
  return draft;
}
