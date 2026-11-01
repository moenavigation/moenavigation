import assert from 'node:assert/strict';
import test from 'node:test';
import { NoRouteError, seaRoute, clearFinderCache, type MarnetNetwork } from 'searoute-ts';
import { connectSeaRouteEndpoints } from '../src/server/sea-route-network';

const network = (coordinates: number[][]): MarnetNetwork => ({
  type: 'FeatureCollection', features: [{ type: 'Feature', id: 'shipping-edge', properties: { pass: 'malacca' }, geometry: { type: 'LineString', coordinates } }],
});

test('both endpoint anchors split one sparse shipping segment in geometric order without changing its metadata', () => {
  const source = network([[0, 0], [10, 0]]);
  const original = JSON.stringify(source);
  const result = connectSeaRouteEndpoints(source, [.1, 8], [-.1, 2], 20)!;
  assert.ok(result);
  assert.deepEqual(result.origin.coordinates, [8, 0]);
  assert.deepEqual(result.destination.coordinates, [2, 0]);
  assert.deepEqual(result.network.features[0].geometry.coordinates, [[0, 0], [2, 0], [8, 0], [10, 0]]);
  assert.equal(result.network.features[0].id, 'shipping-edge');
  assert.deepEqual(result.network.features[0].properties, { pass: 'malacca' });
  assert.equal(JSON.stringify(source), original);
  try {
    const route = seaRoute(result.origin.coordinates, result.destination.coordinates, { network: result.network, units: 'kilometers' });
    assert.deepEqual(route.geometry.coordinates, [[8, 0], [2, 0]]);
    assert.equal(route.properties.originSnapKm, 0);
    assert.equal(route.properties.destinationSnapKm, 0);
  } finally { clearFinderCache(); }
});

test('coincident projected positions and existing vertices do not create duplicate graph points', () => {
  const source = network([[0, 0], [5, 0], [10, 0]]);
  const vertices = connectSeaRouteEndpoints(source, [0, 5], [0, 10], 0)!;
  assert.equal(vertices.network, source);
  assert.deepEqual(vertices.origin.coordinates, [5, 0]);
  assert.deepEqual(vertices.destination.coordinates, [10, 0]);
  const interior = connectSeaRouteEndpoints(source, [.1, 7], [-.1, 7], 20)!;
  assert.deepEqual(interior.origin.coordinates, [7, 0]);
  assert.deepEqual(interior.destination.coordinates, [7, 0]);
  assert.deepEqual(interior.network.features[0].geometry.coordinates, [[0, 0], [5, 0], [7, 0], [10, 0]]);
});

test('connection points follow the displayed Mercator shipping segment at high latitude', () => {
  const source = network([[0, 0], [10, 80]]);
  const result = connectSeaRouteEndpoints(source, [57.04516467328687, 5], [80, 10], 1)!;
  assert.ok(result);
  assert.ok(Math.abs(result.origin.coordinates[0] - 5) < 1e-8);
  assert.ok(Math.abs(result.origin.coordinates[1] - 57.04516467328687) < 1e-8);
  assert.ok(result.origin.distanceKm < .000001);
});

test('wrapped dateline segments cannot become false nearby anchors through other longitudes', () => {
  const wrapped = network([[179, 1], [-179, 1]]);
  assert.equal(connectSeaRouteEndpoints(wrapped, [1, 104], [1, 105], 100), null);
  const source: MarnetNetwork = { type: 'FeatureCollection', features: [...wrapped.features, ...network([[104, 2], [106, 2]]).features] };
  const result = connectSeaRouteEndpoints(source, [2, 104.5], [2, 105.5], 1)!;
  assert.ok(result);
  assert.ok(result.origin.coordinates[1] > 1.9);
  assert.ok(result.destination.coordinates[1] > 1.9);
  assert.equal(result.network.features[0], wrapped.features[0]);
});

test('connection limits apply to the actual segment position and invalid coordinates fail without mutation', () => {
  const source = network([[0, 0], [10, 0]]);
  const original = JSON.stringify(source);
  assert.ok(connectSeaRouteEndpoints(source, [.5, 5], [-.5, 6], 100));
  assert.equal(connectSeaRouteEndpoints(source, [1, 5], [0, 6], 100), null);
  for (const point of [[NaN, 5], [Infinity, 5], [91, 5], [0, 181]] as [number, number][]) {
    assert.equal(connectSeaRouteEndpoints(source, point, [0, 6], 100), null);
    assert.equal(connectSeaRouteEndpoints(source, [0, 6], point, 100), null);
  }
  for (const limit of [-1, Infinity, NaN]) assert.equal(connectSeaRouteEndpoints(source, [0, 5], [0, 6], limit), null);
  assert.equal(connectSeaRouteEndpoints(network([[NaN, 0], [1, 0]]), [0, 5], [0, 6], 100), null);
  assert.equal(JSON.stringify(source), original);
});

test('projecting onto disconnected shipping edges does not invent a connection between them', () => {
  const source: MarnetNetwork = { type: 'FeatureCollection', features: [...network([[0, 0], [1, 0]]).features, ...network([[3, 0], [4, 0]]).features] };
  const result = connectSeaRouteEndpoints(source, [.05, .5], [.05, 3.5], 20)!;
  assert.ok(result);
  try {
    assert.throws(() => seaRoute(result.origin.coordinates, result.destination.coordinates, { network: result.network }), NoRouteError);
  } finally { clearFinderCache(); }
});
