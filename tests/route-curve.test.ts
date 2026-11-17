import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRouteDisplayGeometry, LONG_ROUTE_CORNER_FRACTION, LONG_ROUTE_LEG_METRES,
  MAX_LONG_ROUTE_DEVIATION_METRES, MAX_SMOOTHED_ROUTE_POINTS,
  smoothRoutePath, type RouteCurvePoint,
} from '../src/lib/route-curve';
import { legacyTradingRouteRecords } from '../scripts/data/legacy-trading-routes';
import { getSeaRouteLandMask } from '../src/server/sea-route-land';
import { seaRouteDistanceKm } from '../src/server/sea-route-network';

type Point = [number, number];
const radians = Math.PI / 180;
const project = ([latitude, longitude]: RouteCurvePoint): Point => [
  6378137 * longitude * radians,
  6378137 * Math.log(Math.tan(Math.PI / 4 + latitude * radians / 2)),
];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const segmentDistance = (point: Point, a: Point, b: Point) => {
  const x = b[0] - a[0], y = b[1] - a[1], squared = x * x + y * y;
  const t = squared ? Math.max(0, Math.min(1, ((point[0] - a[0]) * x + (point[1] - a[1]) * y) / squared)) : 0;
  return distance(point, [a[0] + t * x, a[1] + t * y]);
};
const pathDistance = (point: Point, path: Point[]) => Math.min(...path.slice(1).map((next, index) => segmentDistance(point, path[index], next)));

// The user's saved revision-2 offshore edits, supplied on 2026-11-17. Keep
// these separate from the historical import fixtures and never reseed them.
const userEditedRouteFixtures = [
  { id: 'bkk-lcb', offshore: [[13.056111, 100.887222], [13.111729, 100.708871], [13.229358, 100.620923], [13.521, 100.602]] },
  { id: 'bkk-lcb-songkhla', offshore: [[13.056111, 100.887222], [11.630173, 100.524946], [10.097679, 100.722525], [7.318, 100.682]] },
].map(({ id, offshore }) => {
  const source = legacyTradingRouteRecords.find(route => route.id === id)!;
  return { id: `${id}-user-edited`, waypoints: [...offshore as Point[], ...source.waypoints!.slice(4).map(point => [...point] as Point)] };
});

test('rounding is nonmutating and retains exact endpoint coordinates', () => {
  const points = Object.freeze([
    Object.freeze([10.123456789, 98.123456789] as const),
    Object.freeze([10.123456789, 99] as const),
    Object.freeze([11, 99] as const),
  ]);
  const snapshot = JSON.stringify(points);
  const curve = smoothRoutePath(points);
  assert.ok(curve.length > points.length);
  assert.deepEqual(curve[0], points[0]);
  assert.deepEqual(curve.at(-1), points.at(-1));
  assert.notEqual(curve[0], points[0]);
  assert.notEqual(curve.at(-1), points.at(-1));
  assert.equal(JSON.stringify(points), snapshot);
  assert.deepEqual(smoothRoutePath(points), curve, 'Drawing geometry is deterministic.');
});

test('short, straight, duplicate and doubling-back paths retain their original shape', () => {
  for (const points of [
    [], [[0, 0]], [[0, 0], [1, 1]],
    [[0, 0], [0, 1], [0, 2]],
    [[0, 0], [0, 0], [1, 0]],
    [[0, 0], [0, 1], [0, 0]],
  ] as Point[][]) assert.deepEqual(smoothRoutePath(points), points);
});

test('unsupported coordinates or dateline wraps do not invent a curve', () => {
  for (const points of [
    [[0, 0], [NaN, 1], [1, 1]],
    [[0, 0], [1, Infinity], [1, 1]],
    [[0, 0], [86, 1], [1, 1]],
    [[0, 179], [0, -179], [1, -179]],
  ] as Point[][]) assert.deepEqual(smoothRoutePath(points), points);
});

test('fine approaches remain exact while offshore curves span half-legs within a bounded local triangle', () => {
  for (const size of [0.001, 0.05]) {
    const points: Point[] = [[0, -size], [0, 0], [size, 0]];
    assert.deepEqual(createRouteDisplayGeometry(points), { path: points, markerPoints: points });
  }
  for (const size of [1, 3]) {
    const points: Point[] = [[0, -size], [0, 0], [size, 0]];
    const curve = smoothRoutePath(points).map(project);
    const entryTrim = distance(project(points[0]), project(points[1])) * LONG_ROUTE_CORNER_FRACTION;
    const exitTrim = distance(project(points[1]), project(points[2])) * LONG_ROUTE_CORNER_FRACTION;
    for (const [x, y] of curve.slice(1, -1)) {
      assert.ok(x >= -entryTrim - 0.00001 && x <= 0.00001 && y >= -0.00001 && y <= exitTrim + 0.00001);
      assert.ok(y / exitTrim - x / entryTrim <= 1.00001, 'No spline overshoot outside the entry/corner/exit triangle.');
      assert.ok(pathDistance([x, y], points.map(project)) <= MAX_LONG_ROUTE_DEVIATION_METRES);
    }
    assert.ok(curve.slice(2, -2).some(([x, y]) => x < -0.001 && y > 0.001), 'The corner is actually rounded.');
    assert.ok(Math.max(...curve.map(point => pathDistance(point, points.map(project)))) > 10000, 'The offshore change is substantial, rather than a tiny fillet.');
  }
});

test('unequal offshore legs retain a long sweep with a restrained short-side arm', () => {
  const points: Point[] = [[0, -.4], [0, 0], [4, 0]];
  const { path, markerPoints } = createRouteDisplayGeometry(points);
  const projected = path.map(project);
  assert.ok(projected.at(-2)![1] > project(points[2])[1] * .49, 'The broad sweep consumes half the long leg.');
  assert.ok(distance(projected[1], project(points[1])) < distance(project(points[0]), project(points[1])) * .21);
  assert.notDeepEqual(markerPoints[1], points[1], 'Only the coarse control marker follows the display curve.');
  assert.ok(pathDistance(project(markerPoints[1]), projected) < .00001);
  assert.deepEqual(markerPoints[0], points[0]);
  assert.deepEqual(markerPoints.at(-1), points.at(-1));
});

test('the maximum CMS path stays within the display sampling budget', () => {
  const points: Point[] = Array.from({ length: 100 }, (_, index) => [Math.floor(index / 2) / 4, Math.ceil(index / 2) / 4]);
  const curve = smoothRoutePath(points);
  assert.ok(curve.length > points.length);
  assert.ok(curve.length <= MAX_SMOOTHED_ROUTE_POINTS);
  assert.deepEqual(curve[0], points[0]);
  assert.deepEqual(curve.at(-1), points.at(-1));
});

test('five historical and two user-edited paths gain no new mapped-land contacts in clear corner windows', async () => {
  const mask = await getSeaRouteLandMask();
  assert.equal(legacyTradingRouteRecords.length, 5);
  for (const route of [...legacyTradingRouteRecords, ...userEditedRouteFixtures]) {
    const points = route.waypoints!;
    const original = JSON.stringify(points);
    const curve = smoothRoutePath(points);
    const { markerPoints } = createRouteDisplayGeometry(points);
    assert.deepEqual(curve[0], points[0], route.id);
    assert.deepEqual(curve.at(-1), points.at(-1), route.id);
    assert.ok(curve.length <= MAX_SMOOTHED_ROUTE_POINTS, route.id);
    assert.equal(markerPoints.length, points.length, route.id);
    const projected = points.map(project), display = curve.map(project);
    for (const point of curve) {
      assert.ok(pathDistance(project(point), projected) * Math.cos(point[0] * radians) <= MAX_LONG_ROUTE_DEVIATION_METRES, route.id);
    }
    for (let index = 1; index < points.length - 1; index++) {
      const window = points.slice(index - 1, index + 2);
      const shortestLeg = Math.min(distance(projected[index - 1], projected[index]), distance(projected[index], projected[index + 1]));
      if (shortestLeg * Math.cos(points[index][0] * radians) <= LONG_ROUTE_LEG_METRES) {
        assert.deepEqual(markerPoints[index], points[index], `${route.id} fine marker ${index}`);
        assert.ok(curve.some(point => point[0] === points[index][0] && point[1] === points[index][1]), route.id);
      } else assert.ok(pathDistance(project(markerPoints[index]), display) < .00001, `${route.id} displayed marker ${index}`);
      if (!mask.intersectsPath(window)) {
        assert.equal(mask.intersectsPath(smoothRoutePath(window)), false, `${route.id} corner ${index}`);
      }
    }
    if (!mask.intersectsPath(points)) assert.equal(mask.intersectsPath(curve), false, route.id);
    const contactLength = (path: readonly RouteCurvePoint[]) => path.slice(1).reduce((sum, point, index) =>
      sum + (mask.intersectsPath([path[index], point]) ? seaRouteDistanceKm(path[index], point) : 0), 0);
    // Bangkok's river, Yangon's harbour connector, and the edited Songkhla
    // departure already touch mapped land. Compare total length of touching
    // segments, since sampling changes segment count (not distance on land).
    assert.ok(contactLength(curve) <= contactLength(points) + 0.001, route.id);
    assert.equal(JSON.stringify(points), original, route.id);
  }
});

test('the lower threshold softens the edited Bangkok controls and Surat offshore turn', () => {
  const bangkok = userEditedRouteFixtures[0].waypoints;
  const display = createRouteDisplayGeometry(bangkok);
  for (const index of [1, 2]) assert.notDeepEqual(display.markerPoints[index], bangkok[index]);
  for (let index = 3; index < bangkok.length; index++) assert.deepEqual(display.markerPoints[index], bangkok[index]);
  const surat = legacyTradingRouteRecords.find(route => route.id === 'bkk-lcb-suratthani')!.waypoints!;
  assert.notDeepEqual(createRouteDisplayGeometry(surat).markerPoints[3], surat[3], 'The16km offshore connector now participates in the broad curve.');
});
