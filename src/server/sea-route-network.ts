import 'server-only';
import type { MarnetNetwork } from 'searoute-ts';

type Point = readonly [number, number];
type Coordinate = [number, number];
type Connection = { coordinates: Coordinate; distanceKm: number; feature: number; segment: number; fraction: number };
const mercatorLimit = 85.0511287798;

export function seaRouteDistanceKm(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const halfLat = (b[0] - a[0]) * radians / 2, halfLon = (b[1] - a[1]) * radians / 2;
  const value = Math.sin(halfLat) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(halfLon) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.max(0, value)), Math.sqrt(Math.max(0, 1 - value)));
}

function valid(coordinate: readonly number[]) {
  return coordinate.length >= 2 && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1])
    && Math.abs(coordinate[0]) <= 180 && Math.abs(coordinate[1]) <= 90;
}
function project([longitude, latitude]: readonly number[]): Coordinate {
  const clamped = Math.max(-mercatorLimit, Math.min(mercatorLimit, latitude));
  return [longitude, Math.log(Math.tan(Math.PI / 4 + clamped * Math.PI / 360)) * 180 / Math.PI];
}
function unproject([x, y]: Coordinate): Coordinate {
  return [x, (2 * Math.atan(Math.exp(y * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI];
}
const same = (a: readonly number[], b: readonly number[]) => a[0] === b[0] && a[1] === b[1];

function nearestConnection(network: MarnetNetwork, point: Point, maximumKm: number): Connection | null {
  if (!valid([point[1], point[0]])) return null;
  const p = project([point[1], point[0]]);
  let closest: Connection | null = null;
  network.features.forEach((feature, featureIndex) => {
    const coordinates = feature.geometry.coordinates;
    for (let index = 1; index < coordinates.length; index++) {
      const a = coordinates[index - 1], b = coordinates[index];
      // A wrapped dateline edge must not appear to run through every longitude.
      if (!valid(a) || !valid(b) || Math.abs(a[0] - b[0]) > 180) continue;
      const start = project(a), end = project(b);
      const dx = end[0] - start[0], dy = end[1] - start[1];
      const lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared ? Math.max(0, Math.min(1, ((p[0] - start[0]) * dx + (p[1] - start[1]) * dy) / lengthSquared)) : 0;
      const anchor: Coordinate = fraction === 0 ? [a[0], a[1]] : fraction === 1 ? [b[0], b[1]] : unproject([start[0] + fraction * dx, start[1] + fraction * dy]);
      const distanceKm = seaRouteDistanceKm(point, [anchor[1], anchor[0]]);
      if (distanceKm <= maximumKm && (!closest || distanceKm < closest.distanceKm)) {
        closest = { coordinates: anchor, distanceKm, feature: featureIndex, segment: index, fraction };
      }
    }
  });
  return closest;
}

/** Split existing displayed segments at the connection points, never add shortcut edges. */
export function connectSeaRouteEndpoints(network: MarnetNetwork, origin: Point, destination: Point, maximumKm: number) {
  if (!Number.isFinite(maximumKm) || maximumKm < 0) return null;
  const start = nearestConnection(network, origin, maximumKm), finish = nearestConnection(network, destination, maximumKm);
  if (!start || !finish) return null;
  let changed = false;
  const features = network.features.map((feature, index) => {
    const insertions = [start, finish].filter(connection => connection.feature === index && connection.fraction > 0 && connection.fraction < 1);
    if (!insertions.length) return feature;
    const source = feature.geometry.coordinates;
    const coordinates = [source[0]];
    for (let segment = 1; segment < source.length; segment++) {
      for (const insertion of insertions.filter(connection => connection.segment === segment).sort((a, b) => a.fraction - b.fraction)) {
        if (!same(coordinates.at(-1)!, insertion.coordinates) && !same(source[segment], insertion.coordinates)) coordinates.push(insertion.coordinates);
      }
      coordinates.push(source[segment]);
    }
    changed = true;
    return { ...feature, geometry: { ...feature.geometry, coordinates } };
  });
  return { network: changed ? { ...network, features } : network, origin: start, destination: finish };
}
