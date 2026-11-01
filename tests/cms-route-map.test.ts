import assert from 'node:assert/strict';
import test from 'node:test';
import { addMapRoutePoint, applyMapRouteChanges, initialMapRouteText, isMapRouteReady, mapRoutePoints, moveMapRoutePoint } from '../src/lib/cms-route-map';

test('map editing starts with unplaced endpoints and preserves unfinished existing rows', () => {
  assert.equal(initialMapRouteText(''), ',\n,');
  assert.equal(initialMapRouteText('13.000, 100.00'), '13.000, 100.00\n,');
  const unfinished = '13.000, 100.00\r\nunfinished,\r\n1,103';
  assert.equal(initialMapRouteText(unfinished), unfinished);
  assert.deepEqual(mapRoutePoints(unfinished), [[13, 100], null, [1, 103]]);
});

test('moving a point preserves untouched precision, row order and line endings', () => {
  const source = '13.12345678912345, 100.22222222222222\r\nold,unfinished\r\n1e-7, 103.80000000000000';
  assert.equal(moveMapRoutePoint(source, 1, 11.123456789, 101.123456789),
    '13.12345678912345, 100.22222222222222\r\n11.123457,101.123457\r\n1e-7, 103.80000000000000');
  assert.equal(moveMapRoutePoint(source, 0, 12.5, 100.5), '12.5,100.5\r\nold,unfinished\r\n1e-7, 103.80000000000000');
  assert.equal(moveMapRoutePoint(source, 2, 1.5, 103.5), '13.12345678912345, 100.22222222222222\r\nold,unfinished\r\n1.5,103.5');
  for (const index of [-1, 0.5, 3]) assert.equal(moveMapRoutePoint(source, index, 1, 2), source);
  assert.equal(moveMapRoutePoint(source, 1, NaN, 2), source);
});

test('map world copies normalize moved coordinates without changing untouched endpoints', () => {
  assert.deepEqual(mapRoutePoints(moveMapRoutePoint('13,100\n1,103', 0, 91, 541)), [[90, -179], [1, 103]]);
  assert.deepEqual(mapRoutePoints(moveMapRoutePoint('13,100\n1,103', 1, -91, -541)), [[13, 100], [-90, 179]]);
});

test('applying map edits rejects stale drafts, missing locations and invalid coordinates', () => {
  const source = '13.000,100\n1,103', edited = '12,101\n1,103';
  assert.equal(applyMapRouteChanges(source, source, edited), edited);
  assert.throws(() => applyMapRouteChanges(source, edited, edited), /changed while this map was open/);
  for (const invalid of ['', '13,100', ',\n,', '13,100\n1,', '91,100\n1,103', '13,181\n1,103', '13,Infinity\n1,103', Array(101).fill('13,100').join('\n')]) {
    assert.equal(isMapRouteReady(invalid), false);
    assert.throws(() => applyMapRouteChanges(source, source, invalid), /valid location/);
  }
  assert.equal(isMapRouteReady('0,0\n-90,-180\n90,180'), true);
});

test('adding on the map inserts before the destination and preserves existing precision and order', () => {
  const source = '13.12345678912345, 100.22222222222222\r\n12.00000,101.00000\r\n1e-7, 103.80000000000000';
  const first = addMapRoutePoint(source, 11.123456789, 102.123456789)!;
  assert.equal(first.index, 2);
  assert.equal(first.text, '13.12345678912345, 100.22222222222222\r\n12.00000,101.00000\r\n11.123457,102.123457\r\n1e-7, 103.80000000000000');
  const second = addMapRoutePoint(first.text, 10, 103)!;
  assert.equal(second.index, 3);
  assert.equal(second.text, '13.12345678912345, 100.22222222222222\r\n12.00000,101.00000\r\n11.123457,102.123457\r\n10,103\r\n1e-7, 103.80000000000000');
  assert.equal(addMapRoutePoint(',\n,', 10, 100), null);
  assert.equal(addMapRoutePoint(source, NaN, 100), null);
  const atLimit = Array(100).fill('13,100').join('\n');
  assert.equal(addMapRoutePoint(atLimit, 12, 101), null);
  assert.equal(mapRoutePoints(addMapRoutePoint(Array(99).fill('13,100').join('\n'), 12, 101)!.text).length, 100);
});
