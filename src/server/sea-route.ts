import 'server-only';
import { clearFinderCache, NoRouteError, seaRoute, SnapFailedError, type MarnetNetwork } from 'searoute-ts';
import { DEFAULT_MARNET } from 'searoute-ts/marnet-20km';
import { MAX_ROUTE_POINTS } from '@/lib/cms-route-fields';
import { HttpError } from './http';
import { getSeaRouteLandMask } from './sea-route-land';

type Point = [number, number];
const maxSnapKm = 100;
const maxRoutingAttempts = 4;
let routeNetwork = DEFAULT_MARNET;
const messages = {
  coordinates: 'Enter valid origin and destination coordinates before generating a sea route.',
  same: 'Origin and destination must be different points.',
  land: 'This route touches land in the available map data. Move the endpoints to nearby open water or add intermediate points manually.',
  snap: 'An endpoint is too far from the sea-route network. Move it closer to a coastal shipping route or add intermediate points manually.',
  unavailable: 'No sea route could be generated between these points. Adjust the endpoints or add intermediate points manually.',
  dateline: 'Routes across the international date line need manual map setup.',
  count: 'This route needs more than 100 points to preserve its shape. Choose closer endpoints or add intermediate points manually.',
};

function validPoint(point: Point) {
  return Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
}
const samePoint = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];

function edgeKey(a: readonly number[], b: readonly number[]) {
  const first = `${a[0]},${a[1]}`, second = `${b[0]},${b[1]}`;
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

/** Only remove source graph edges proven to cross land; never add user connectors to the graph. */
function excludeNetworkEdges(blocked: Set<string>) {
  const features: MarnetNetwork['features'] = [];
  let removed = false;
  for (const feature of routeNetwork.features) {
    const coordinates = feature.geometry.coordinates;
    if (!coordinates.some((point, index) => index > 0 && blocked.has(edgeKey(coordinates[index - 1], point)))) {
      features.push(feature);
      continue;
    }
    removed = true;
    let section = [coordinates[0]];
    for (let index = 1; index < coordinates.length; index++) {
      if (blocked.has(edgeKey(coordinates[index - 1], coordinates[index]))) {
        if (section.length > 1) features.push({ ...feature, geometry: { type: 'LineString', coordinates: section } });
        section = [coordinates[index]];
      } else section.push(coordinates[index]);
    }
    if (section.length > 1) features.push({ ...feature, geometry: { type: 'LineString', coordinates: section } });
  }
  if (removed) {
    routeNetwork = { type: 'FeatureCollection', features };
    // The package caches by network object identity. Retain only the current graph.
    clearFinderCache();
  }
  return removed;
}
function distanceKm(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const halfLat = (b[0] - a[0]) * radians / 2, halfLon = (b[1] - a[1]) * radians / 2;
  const value = Math.sin(halfLat) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(halfLon) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(Math.max(0, value)), Math.sqrt(Math.max(0, 1 - value)));
}

/** Generates a preview only. Applying and saving remain explicit CMS actions. */
export async function generateSeaRoute(origin: Point, destination: Point): Promise<{ waypoints: Point[]; distanceKm: number }> {
  if (!validPoint(origin) || !validPoint(destination)) throw new HttpError(422, messages.coordinates);
  if (samePoint(origin, destination)) throw new HttpError(422, messages.same);
  if (Math.abs(origin[1] - destination[1]) > 180) throw new HttpError(422, messages.dateline);
  // Copy callers' arrays: the draft's exact endpoints must never be mutated or snapped in place.
  const start: Point = [...origin], finish: Point = [...destination];
  const mask = await getSeaRouteLandMask();
  if (mask.contains(start) || mask.contains(finish)) throw new HttpError(422, messages.land);
  // Everything after the awaited mask load is synchronous. A request cannot observe
  // a half-updated graph, and every request checks its resulting geometry again.
  for (let attempt = 0; attempt < maxRoutingAttempts; attempt++) {
    let route: ReturnType<typeof seaRoute>;
    try {
      route = seaRoute([start[1], start[0]], [finish[1], finish[0]], {
        network: routeNetwork, units: 'kilometers', maxSnapDistanceKm: maxSnapKm, allowArctic: false,
      });
    } catch (error) {
      if (error instanceof SnapFailedError) throw new HttpError(422, messages.snap);
      if (error instanceof NoRouteError) throw new HttpError(422, messages.unavailable);
      throw error;
    }
    // The library caps distance to the nearest line, not the chosen graph vertex.
    if (route.properties.originSnapKm > maxSnapKm || route.properties.destinationSnapKm > maxSnapKm) throw new HttpError(422, messages.snap);
    if (route.geometry.type !== 'LineString') throw new HttpError(422, messages.unavailable);
    const networkPoints: Point[] = route.geometry.coordinates.map(coordinate => [coordinate[1], coordinate[0]]);
    if (networkPoints.length < 2 || networkPoints.some(point => !validPoint(point))) throw new HttpError(422, messages.unavailable);
    const waypoints: Point[] = [start];
    for (const point of networkPoints) if (!samePoint(waypoints[waypoints.length - 1], point)) waypoints.push(point);
    if (!samePoint(waypoints[waypoints.length - 1], finish)) waypoints.push(finish);
    if (waypoints.some((point, index) => index > 0 && Math.abs(point[1] - waypoints[index - 1][1]) > 180)) throw new HttpError(422, messages.dateline);
    if (waypoints.length > MAX_ROUTE_POINTS) throw new HttpError(422, messages.count);
    if (mask.intersectsPath([start, networkPoints[0]]) || mask.intersectsPath([networkPoints[networkPoints.length - 1], finish])) throw new HttpError(422, messages.land);
    const blocked = new Set<string>();
    for (let index = 1; index < networkPoints.length; index++) {
      if (mask.intersectsPath([networkPoints[index - 1], networkPoints[index]])) {
        blocked.add(edgeKey(route.geometry.coordinates[index - 1], route.geometry.coordinates[index]));
      }
    }
    if (blocked.size) {
      if (attempt + 1 < maxRoutingAttempts && excludeNetworkEdges(blocked)) continue;
      throw new HttpError(422, messages.land);
    }
    return { waypoints, distanceKm: waypoints.slice(1).reduce((sum, point, index) => sum + distanceKm(waypoints[index], point), 0) };
  }
  throw new HttpError(422, messages.unavailable);
}
