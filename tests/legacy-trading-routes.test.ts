import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { legacyRoutePorts, legacyTradingRouteFacts, legacyTradingRouteRecords } from '../scripts/data/legacy-trading-routes';
import { recordSchema } from '../src/lib/validation';

type SourceRoute = {
  detailPageUrl: string;
  detailPageUrlTh: string;
  distanceNM: number;
  capacityTEU: { min: number; max: number };
  sailingHours: { min: number; max: number };
  sourceConflict?: {
    listingObservation: { min: number; max: number };
    detailObservation: { min: number; max: number };
  };
};
const archive = JSON.parse(readFileSync(new URL('../docs/research/legacy-moe-line-2026-11-16/routes-company.json', import.meta.url), 'utf8')) as { routes: SourceRoute[] };

test('the five imported route particulars retain the reviewed bilingual source figures', () => {
  assert.deepEqual(legacyTradingRouteRecords.map(route => [route.id, route.routeSpecs?.distanceNm]), [
    ['bkk-lcb', 58], ['bkk-lcb-suratthani', 261], ['bkk-lcb-songkhla', 361], ['ranong-yangon', 459], ['lcb-sihanoukville', 248],
  ]);
  for (const route of legacyTradingRouteRecords) {
    const facts = legacyTradingRouteFacts[route.id];
    const source = archive.routes.find(item => facts.sources.includes(item.detailPageUrl));
    assert.ok(source, route.id);
    assert.ok(facts.sources.includes(source.detailPageUrlTh), route.id);
    assert.deepEqual(route.routeSpecs, {
      distanceNm: source.distanceNM,
      capacityMinTeu: source.capacityTEU.min,
      capacityMaxTeu: source.capacityTEU.max,
      ...(!source.sourceConflict ? { sailingMinHours: source.sailingHours.min, sailingMaxHours: source.sailingHours.max } : {}),
    }, route.id);
  }
});

test('conflicting Surat Thani sailing observations remain archived and absent from imported data', () => {
  const source = archive.routes.find(item => item.detailPageUrl.endsWith('/bkk-lcb-suratthani/'))!;
  assert.equal(source.sourceConflict?.listingObservation.min, 34);
  assert.equal(source.sourceConflict?.listingObservation.max, 36);
  assert.equal(source.sourceConflict?.detailObservation.min, 8);
  assert.equal(source.sourceConflict?.detailObservation.max, 10);
  const route = legacyTradingRouteRecords.find(item => item.id === 'bkk-lcb-suratthani')!;
  for (const particulars of [route.routeSpecs!, legacyTradingRouteFacts[route.id]]) {
    assert.equal(Object.hasOwn(particulars, 'sailingMinHours'), false);
    assert.equal(Object.hasOwn(particulars, 'sailingMaxHours'), false);
  }
});

test('reviewed paths preserve source endpoint precision and intermediate geometry through validation', () => {
  const endpoints = [
    { from: 'laemChabang', to: 'bangkok', first: [13.056111, 100.887222], last: [13.701667, 100.58], points: 60 },
    { from: 'laemChabang', to: 'suratThani', first: [13.056111, 100.887222], last: [9.265, 99.434444], points: 10 },
    { from: 'laemChabang', to: 'songkhla', first: [13.056111, 100.887222], last: [7.216944, 100.58], points: 14 },
    { from: 'ranong', to: 'yangon', first: [10.006944, 98.608056], last: [16.766667, 96.166667], points: 39 },
    { from: 'laemChabang', to: 'sihanoukville', first: [13.056111, 100.887222], last: [10.633333, 103.5], points: 5 },
  ];
  for (const [index, route] of legacyTradingRouteRecords.entries()) {
    const expected = endpoints[index];
    assert.deepEqual(legacyRoutePorts[expected.from].coordinates, expected.first);
    assert.deepEqual(legacyRoutePorts[expected.to].coordinates, expected.last);
    assert.deepEqual(route.waypoints?.[0], expected.first, route.id);
    assert.deepEqual(route.waypoints?.at(-1), expected.last, route.id);
    assert.equal(route.waypoints?.length, expected.points, route.id);
    assert.deepEqual(recordSchema.parse(route).waypoints, route.waypoints, route.id);
  }
});
