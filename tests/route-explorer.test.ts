import assert from 'node:assert/strict';
import test from 'node:test';
import type { RoutePort } from '../src/lib/cms-types';
import { listingQueryLimit } from '../src/lib/listing-filters';
import {
  ROUTE_PAGE_SIZE, emptyRouteFilters, filterMappedRoutes, getRoutePage,
  readRouteFilters, routePortKey, routePortOptions, writeRouteFilters, type MappedRoute,
} from '../src/lib/route-explorer';

const thailand: RoutePort = { name: 'Laem Chabang', nameTh: 'แหลมฉบัง', country: 'Thailand', countryTh: 'ประเทศไทย' };
const singapore: RoutePort = { name: 'Singapore', nameTh: 'สิงคโปร์', country: 'Singapore', countryTh: 'สิงคโปร์' };
const vietnam: RoutePort = { name: 'Ho Chi Minh City', nameTh: 'นครโฮจิมินห์', country: 'Vietnam', countryTh: 'เวียดนาม' };

function route(index: number, overrides: Partial<MappedRoute> = {}): MappedRoute {
  return {
    id: `route-${index}`, type: 'Route', title: `Regional connection ${index}`, titleTh: `เส้นทางภูมิภาค ${index}`,
    description: index % 2 ? 'Container connection' : 'Marine logistics', descriptionTh: index % 2 ? 'ขนส่งตู้คอนเทนเนอร์' : 'งานโลจิสติกส์ทางทะเล',
    origin: thailand, destination: index % 2 ? singapore : vietnam,
    waypoints: [[13.08, 100.88], [1.26, 103.84]], image: '', category: '', status: 'Published', revision: 1,
    ...overrides,
  };
}

test('200 routes retain their order while port and bilingual token searches narrow the collection', () => {
  const routes = Array.from({ length: 200 }, (_, index) => route(index));
  const before = routes.map(item => item.id);
  const filtered = filterMappedRoutes(routes, {
    ...emptyRouteFilters, query: '  แหลมฉบัง CONTAINER สิงคโปร์  ',
    origin: routePortKey(thailand), destination: routePortKey(singapore),
  });
  assert.equal(filtered.length, 100);
  assert.deepEqual(filtered.map(item => item.id), before.filter((_, index) => index % 2));
  assert.equal(filterMappedRoutes(routes, { ...emptyRouteFilters, query: 'เวียดนาม marine' }).length, 100);
  assert.equal(filterMappedRoutes(routes, { ...emptyRouteFilters, query: 'ＭＡＲＩＮＥ Thailand' }).length, 100);
  assert.equal(filterMappedRoutes(routes, { ...emptyRouteFilters, query: 'Singapore marine' }).length, 0);
  assert.equal(filterMappedRoutes(routes, { ...emptyRouteFilters, origin: routePortKey(singapore) }).length, 0);
  assert.deepEqual(routes.map(item => item.id), before, 'Filtering must not mutate editorial order.');
});

test('port identity ignores case and spacing, survives language changes, and distinguishes countries', () => {
  const duplicate = { ...thailand, name: '  ＬＡＥＭ   CHABANG ', country: ' THAILAND ', nameTh: 'แหลมฉบัง' };
  assert.equal(routePortKey(thailand), routePortKey(duplicate));
  assert.equal(routePortKey(thailand), routePortKey({ ...thailand, nameTh: 'ชื่อภาษาไทยใหม่', countryTh: 'ไทย' }));
  assert.notEqual(routePortKey(thailand), routePortKey({ ...thailand, country: 'Vietnam' }));
  assert.notEqual(routePortKey({ ...thailand, name: 'A|B', country: 'C' }), routePortKey({ ...thailand, name: 'A', country: 'B|C' }));

  const routes = [route(1), route(2, { origin: duplicate }), route(3, { origin: singapore })];
  const english = routePortOptions(routes, 'origin', 'en');
  const thai = routePortOptions(routes, 'origin', 'th');
  assert.deepEqual(english.map(option => option.label), ['Laem Chabang · Thailand', 'Singapore · Singapore']);
  assert.deepEqual(new Set(thai.map(option => option.value)), new Set(english.map(option => option.value)));
  assert.equal(thai.find(option => option.value === routePortKey(thailand))?.label, 'แหลมฉบัง · ประเทศไทย');
  assert.equal(routePortOptions(routes, 'destination', 'en').length, 2);
  assert.equal(routePortOptions([route(1, { origin: { ...thailand, nameTh: '', countryTh: '' } })], 'origin', 'th')[0].label, 'Laem Chabang · Thailand');
});

test('pagination bounds a large collection and handles empty, partial and invalid pages', () => {
  const routes = Array.from({ length: 200 }, (_, index) => route(index));
  const first = getRoutePage(routes, 0);
  assert.equal(ROUTE_PAGE_SIZE, 6);
  assert.deepEqual({ page: first.page, pageCount: first.pageCount, total: first.total, start: first.start, end: first.end }, { page: 1, pageCount: 34, total: 200, start: 1, end: 6 });
  assert.deepEqual(first.items.map(item => item.id), routes.slice(0, 6).map(item => item.id));
  const last = getRoutePage(routes, 1000);
  assert.deepEqual({ page: last.page, start: last.start, end: last.end }, { page: 34, start: 199, end: 200 });
  assert.deepEqual(last.items.map(item => item.id), ['route-198', 'route-199']);
  assert.equal(getRoutePage(routes, 2.9).page, 2);
  assert.equal(getRoutePage(routes, Number.NaN).page, 1);
  assert.equal(getRoutePage(routes, Number.POSITIVE_INFINITY).page, 1);
  assert.deepEqual(getRoutePage([], 99), { items: [], page: 1, pageCount: 1, total: 0, start: 0, end: 0 });
});

test('route URL state round-trips bilingual search and preserves selected route and campaign parameters', () => {
  const filters = { query: 'เรือ marine', origin: routePortKey(thailand), destination: routePortKey(singapore), page: 3 };
  const search = writeRouteFilters('?route=selected-route&campaign=summer&campaign=return', filters);
  const params = new URLSearchParams(search);
  assert.deepEqual(readRouteFilters(params), filters);
  assert.equal(params.get('route'), 'selected-route');
  assert.deepEqual(params.getAll('campaign'), ['summer', 'return']);
  assert.equal(writeRouteFilters(search, emptyRouteFilters), '?route=selected-route&campaign=summer&campaign=return');
  assert.equal(writeRouteFilters('', emptyRouteFilters), '');
  assert.equal(new URLSearchParams(writeRouteFilters('', { ...emptyRouteFilters, page: 2.9 })).get('routePage'), '2');
});

test('invalid and oversized query parameters become bounded usable filters', () => {
  const read = (routePage: string) => readRouteFilters(new URLSearchParams({ routePage })).page;
  assert.equal(read('-4'), 1);
  assert.equal(read('not-a-page'), 1);
  assert.equal(read('Infinity'), 1);
  assert.equal(read('3.8'), 3);
  assert.equal(read('999999999999999999999'), Number.MAX_SAFE_INTEGER);
  assert.equal(readRouteFilters(new URLSearchParams()).page, 1);
  const oversized = readRouteFilters(new URLSearchParams({ q: 'ก'.repeat(1000), from: 'x'.repeat(1000), to: 'y'.repeat(1000) }));
  assert.equal(oversized.query.length, listingQueryLimit);
  assert.ok(oversized.origin.length < 1000);
  assert.ok(oversized.destination.length < 1000);
  const written = readRouteFilters(new URLSearchParams(writeRouteFilters('', { query: 'x'.repeat(1000), origin: '', destination: '', page: 1 })));
  assert.equal(written.query.length, listingQueryLimit);
});
