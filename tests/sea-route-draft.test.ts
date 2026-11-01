import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGeneratedSeaRoute, isGeneratedSeaRoute, readSeaRouteEndpoints, type GeneratedSeaRoute } from '../src/lib/sea-route';

test('sea-route generation requires two valid distinct endpoints without validating the intermediates being replaced', () => {
  for (const text of ['', '13,100', ',\n,', '13,100\n13,100', '91,100\n1,103', '13,Infinity\n1,103', '13,100\n1,181']) {
    assert.equal(readSeaRouteEndpoints(text), null);
  }
  assert.deepEqual(readSeaRouteEndpoints('13.001, 100.00001\nunfinished,\n1e-2,103.1'), {
    origin: [13.001, 100.00001], destination: [0.01, 103.1],
  });
});

test('applying a generated route preserves endpoint text, precision and line endings', () => {
  const text = '13.12345678912345, 100.22222222222222\r\nold,unfinished\r\n1e-7, 103.80000000000000';
  const endpoints = readSeaRouteEndpoints(text)!;
  const result: GeneratedSeaRoute = { waypoints: [endpoints.origin, [10.2, 101.3], [8, 102], endpoints.destination], distanceKm: 800 };
  assert.equal(applyGeneratedSeaRoute(text, result), '13.12345678912345, 100.22222222222222\r\n10.2,101.3\r\n8,102\r\n1e-7, 103.80000000000000');
  assert.equal(text, '13.12345678912345, 100.22222222222222\r\nold,unfinished\r\n1e-7, 103.80000000000000');
});

test('stale endpoints and malformed generated routes cannot overwrite the draft', () => {
  const result: GeneratedSeaRoute = { waypoints: [[13, 100], [12, 101], [1, 103]], distanceKm: 600 };
  assert.throws(() => applyGeneratedSeaRoute('13.1,100\n1,103', result), /no longer matches/);
  for (const invalid of [null, {}, { ...result, distanceKm: Infinity }, { ...result, distanceKm: -1 },
    { ...result, waypoints: [[13, 100], [1, 181]] }, { ...result, waypoints: [[13, 100]] },
    { ...result, waypoints: Array.from({ length: 101 }, () => [13, 100]) }]) {
    assert.equal(isGeneratedSeaRoute(invalid), false);
  }
  assert.equal(isGeneratedSeaRoute(result), true);
});

test('land-contact metadata permits preview application without relaxing coordinate validation', () => {
  const text = '13.750000,100.500000\n3.000000,101.000000';
  const result: GeneratedSeaRoute = { waypoints: [[13.75, 100.5], [13, 100.4], [3, 101]], distanceKm: 1800, touchesLand: true };
  assert.equal(isGeneratedSeaRoute(result), true);
  assert.equal(isGeneratedSeaRoute({ ...result, touchesLand: false }), true);
  assert.equal(applyGeneratedSeaRoute(text, result), '13.750000,100.500000\n13,100.4\n3.000000,101.000000');
  for (const touchesLand of [null, 'true', 1, {}, []]) assert.equal(isGeneratedSeaRoute({ ...result, touchesLand }), false);
  assert.equal(isGeneratedSeaRoute({ ...result, waypoints: [[13.75, 100.5], [91, 101]] }), false);
});
