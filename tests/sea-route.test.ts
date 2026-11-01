import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { DEFAULT_MARNET } from 'searoute-ts/marnet-20km';
import { MAX_ROUTE_POINTS } from '../src/lib/cms-route-fields';
import { HttpError } from '../src/server/http';
import { generateSeaRoute } from '../src/server/sea-route';
import { createLandMask, getSeaRouteLandMask } from '../src/server/sea-route-land';

type Point = [number, number];
const gulf: Point = [12.9, 100.7];
const portKlang: Point = [3, 101];
const rejection = (message: RegExp) => (error: unknown) => error instanceof HttpError && error.status === 422 && message.test(error.message);

const syntheticLand: FeatureCollection<Polygon | MultiPolygon> = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature', properties: {}, geometry: {
      type: 'MultiPolygon', coordinates: [
        [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]],
        [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]],
      ],
    },
  }],
};

test('land guard treats coastlines as land and respects island multipolygons and water holes', () => {
  const mask = createLandMask(syntheticLand);
  assert.equal(mask.contains([1, 1]), true);
  assert.equal(mask.contains([5, 5]), false);
  assert.equal(mask.contains([3, 5]), true);
  assert.equal(mask.contains([0, 5]), true);
  assert.equal(mask.contains([20.5, 20.5]), true);
  assert.equal(mask.contains([15, 15]), false);
});

test('water endpoints do not hide a land crossing, coastline touch or collinear boundary', () => {
  const mask = createLandMask(syntheticLand);
  assert.equal(mask.intersectsPath([[5, -1], [5, 11]]), true);
  assert.equal(mask.intersectsPath([[-1, -1], [0, 0]]), true);
  assert.equal(mask.intersectsPath([[0, -1], [0, 11]]), true);
  assert.equal(mask.intersectsPath([[4, 4], [6, 6]]), false);
  assert.equal(mask.intersectsPath([[5, 5], [5, 11]]), true);
  assert.equal(mask.intersectsPath([[-2, -1], [-2, 11]]), false);
});

test('land checks follow the displayed Web Mercator segment instead of a different latitude interpolation', () => {
  const mask = createLandMask({
    type: 'FeatureCollection', features: [{
      type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[4.8, 56], [5.2, 56], [5.2, 59], [4.8, 59], [4.8, 56]]] },
    }],
  });
  // The displayed segment passes latitude ~57 at its midpoint, not latitude 40.
  assert.equal(mask.intersectsPath([[0, 0], [80, 10]]), true);
});

test('a real Gulf-to-Malacca route detours around the Malay peninsula using original maritime vertices', async () => {
  const origin: Point = [...gulf], destination: Point = [...portKlang];
  const originalNetwork = JSON.stringify(DEFAULT_MARNET);
  const mask = await getSeaRouteLandMask();
  assert.equal(mask.intersectsPath([origin, destination]), true, 'A direct line would cross the peninsula.');
  const route = await generateSeaRoute(origin, destination);
  assert.deepEqual(origin, gulf);
  assert.deepEqual(destination, portKlang);
  assert.deepEqual(route.waypoints[0], origin);
  assert.deepEqual(route.waypoints.at(-1), destination);
  assert.notEqual(route.waypoints[0], origin);
  assert.notEqual(route.waypoints.at(-1), destination);
  assert.ok(route.waypoints.length > 4 && route.waypoints.length <= MAX_ROUTE_POINTS);
  assert.ok(Math.min(...route.waypoints.map(point => point[0])) < 1.5, 'The path must reach the Singapore Strait.');
  assert.ok(Math.max(...route.waypoints.map(point => point[1])) > 104, 'The path must go around the east coast.');
  assert.ok(route.distanceKm > 1700 && route.distanceKm < 2300);
  assert.equal(mask.intersectsPath(route.waypoints), false);
  const networkVertices = new Set(DEFAULT_MARNET.features.flatMap(feature => feature.geometry.coordinates.map(([longitude, latitude]) => `${latitude},${longitude}`)));
  for (const point of route.waypoints.slice(1, -1)) assert.ok(networkVertices.has(`${point[0]},${point[1]}`));
  assert.equal(JSON.stringify(DEFAULT_MARNET), originalNetwork, 'Land exclusions must not mutate the packaged network.');
  assert.deepEqual(await generateSeaRoute(origin, destination), route, 'Cached graph results stay stable.');
});

test('generation preserves endpoint precision and supports several nearby coastal routes', async () => {
  const origin: Point = [13.070123456789, 100.850123456789];
  const destination: Point = [1.200123456789, 103.700123456789];
  const route = await generateSeaRoute(origin, destination);
  assert.deepEqual(route.waypoints[0], origin);
  assert.deepEqual(route.waypoints.at(-1), destination);
  const songkhla = await generateSeaRoute(gulf, [7.3, 100.65]);
  assert.ok(songkhla.waypoints.length >= 3 && songkhla.waypoints.length <= MAX_ROUTE_POINTS);
  assert.equal((await getSeaRouteLandMask()).intersectsPath(songkhla.waypoints), false);
});

test('invalid, identical and date-line endpoints fail with actionable errors', async () => {
  for (const input of [[NaN, 100], [Infinity, 100], [91, 100], [13, 181], ['13', 100], [13], null]) {
    await assert.rejects(generateSeaRoute(input as Point, portKlang), rejection(/valid origin and destination/));
    await assert.rejects(generateSeaRoute(gulf, input as Point), rejection(/valid origin and destination/));
  }
  await assert.rejects(generateSeaRoute(gulf, gulf), rejection(/different points/));
  await assert.rejects(generateSeaRoute([0, 179], [0, -179]), rejection(/date line/));
});

test('inland endpoints and water endpoints whose connectors cross land are both rejected', async () => {
  await assert.rejects(generateSeaRoute([13.75, 100.5], portKlang), rejection(/touches land/));
  const waterPoint: Point = [1.43, 103.9];
  assert.equal((await getSeaRouteLandMask()).contains(waterPoint), false);
  await assert.rejects(generateSeaRoute(waterPoint, [7.3, 100.65]), rejection(/touches land/));
  assert.deepEqual(waterPoint, [1.43, 103.9]);
});

test('distant snaps and unavailable short hops never fall back to a straight line', async () => {
  await assert.rejects(generateSeaRoute([85, 0], gulf), rejection(/too far/));
  // Penang is near a network line, but its chosen graph vertex exceeds the snap limit.
  await assert.rejects(generateSeaRoute(gulf, [5.3, 100.1]), rejection(/too far/));
  await assert.rejects(generateSeaRoute(gulf, [12.91, 100.71]), rejection(/No sea route/));
});

test('long routes exceeding the CMS point budget are rejected without cutting corners', async () => {
  await assert.rejects(generateSeaRoute(gulf, [50, -4]), rejection(/more than 100 points/));
});
