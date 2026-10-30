import assert from 'node:assert/strict';
import test from 'node:test';
import { addRouteCoordinate, MAX_ROUTE_POINTS, removeRouteCoordinate, routeCoordinateRows, updateRouteCoordinate } from '../src/lib/cms-route-fields';
import { parseRouteCoordinates } from '../src/lib/cms-client';

test('editing one coordinate preserves every other value, precision, and line ending', () => {
  const text = '13.12345678912345, 100.22222222222222\r\n1e-7, 103.8\r\n-10.2, 110.000000000123';
  const changed = updateRouteCoordinate(text, 1, 'latitude', '1.000000001e-7');
  assert.equal(changed, '13.12345678912345, 100.22222222222222\r\n1.000000001e-7, 103.8\r\n-10.2, 110.000000000123');
  assert.deepEqual(parseRouteCoordinates(changed)[0], parseRouteCoordinates(text)[0]);
  assert.deepEqual(parseRouteCoordinates(changed)[2], parseRouteCoordinates(text)[2]);
});

test('unfinished and malformed values stay visible until normal Save validation', () => {
  const text = '13,100\n-.,\n12, 103,extra';
  assert.deepEqual(routeCoordinateRows(text), [{ latitude: '13', longitude: '100' }, { latitude: '-.', longitude: '' }, { latitude: '12', longitude: ' 103,extra' }]);
  const changed = updateRouteCoordinate(text, 1, 'longitude', '1e-');
  assert.equal(changed, '13,100\n-.,1e-\n12, 103,extra');
  assert.throws(() => parseRouteCoordinates(changed));
  assert.equal(updateRouteCoordinate('13', 0, 'longitude', '100'), '13,100');
  assert.equal(updateRouteCoordinate(text, 10, 'latitude', '9'), text);
});

test('map setup adds blank endpoints and intermediate points without inventing coordinates', () => {
  assert.equal(addRouteCoordinate(''), ',\n,');
  assert.equal(addRouteCoordinate('13,100'), '13,100\n,');
  const text = '13,100\r\n12,101\r\n11,102';
  assert.equal(addRouteCoordinate(text), '13,100\r\n12,101\r\n,\r\n11,102');
  assert.throws(() => parseRouteCoordinates(addRouteCoordinate(text)));
  const full = Array.from({ length: MAX_ROUTE_POINTS }, (_, index) => `13,${index}`).join('\n');
  assert.equal(addRouteCoordinate(full), full);
});

test('removal only changes the explicitly selected point', () => {
  const text = '13,100\r\n12,101\r\n11,102';
  assert.equal(removeRouteCoordinate(text, 0), '12,101\r\n11,102');
  assert.equal(removeRouteCoordinate(text, 1), '13,100\r\n11,102');
  assert.equal(removeRouteCoordinate(text, 2), '13,100\r\n12,101');
  assert.equal(removeRouteCoordinate('13,100', 0), '');
  assert.deepEqual(routeCoordinateRows(''), []);
  assert.deepEqual(routeCoordinateRows(','), [{ latitude: '', longitude: '' }]);
  assert.equal(removeRouteCoordinate(text, 7), text);
});
