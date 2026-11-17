import assert from 'node:assert/strict';
import test from 'node:test';
import { getPageNumbers, normalizePage, paginateItems } from '../src/lib/pagination';
import { listingHref, readListingFilters, writeListingFilters } from '../src/lib/listing-filters';

test('forty fleet records paginate into 18, 18 and 4 without changing their order', () => {
  const records = Array.from({ length: 40 }, (_, index) => index + 1);
  assert.deepEqual(paginateItems(records, 1, 18).items, records.slice(0, 18));
  assert.deepEqual(paginateItems(records, 2, 18).items, records.slice(18, 36));
  assert.deepEqual(paginateItems(records, 3, 18), { items: [37, 38, 39, 40], page: 3, totalPages: 3, total: 40, offset: 36 });
  assert.deepEqual(paginateItems(records, 999, 18).items, [37, 38, 39, 40]);
  assert.equal(paginateItems(records, -2, 18).page, 1);
  assert.deepEqual(paginateItems([], 9, 18), { items: [], page: 1, totalPages: 1, total: 0, offset: 0 });
  assert.throws(() => paginateItems(records, 1, 0), /positive integer/);
  assert.throws(() => paginateItems(records, 1, 1.5), /positive integer/);
});

test('page inputs normalize invalid, fractional, negative and huge numbers safely', () => {
  for (const input of [undefined, null, '', 'invalid', Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 0]) assert.equal(normalizePage(input), 1);
  assert.equal(normalizePage('2.9'), 2);
  assert.equal(normalizePage('90071992547409999'), Number.MAX_SAFE_INTEGER);
});

test('numbered controls include the current page and endpoints with bounded gaps for huge collections', () => {
  assert.deepEqual(getPageNumbers(1, 1), [1]);
  assert.deepEqual(getPageNumbers(2, 3), [1, 2, 3]);
  assert.deepEqual(getPageNumbers(1, 0), []);
  for (const total of [8, 1000, Number.MAX_SAFE_INTEGER]) for (const page of [1, 2, 5, Math.floor(total / 2), total - 1, total]) {
    const numbers = getPageNumbers(page, total);
    const actual = numbers.filter((number): number is number => typeof number === 'number');
    assert.ok(numbers.length <= 7);
    assert.equal(actual[0], 1);
    assert.equal(actual.at(-1), total);
    assert.ok(actual.includes(page));
    assert.equal(new Set(actual).size, actual.length);
    assert.ok(actual.every(number => Number.isSafeInteger(number) && number >= 1 && number <= total));
    assert.ok(numbers.filter(number => number === 'ellipsis').length <= 2);
  }
});

test('fleet links retain page, Unicode search and category while excluding unrelated parameters', () => {
  const filters = { query: 'เรือ pagination', category: 'Container', page: 3 };
  const url = new URL(listingHref('/th/fleet/synthetic-vessel', filters), 'https://example.com');
  assert.deepEqual(readListingFilters(url.searchParams, ['All', 'Container'], true), filters);
  assert.equal(listingHref('/th/fleet', readListingFilters(url.searchParams, undefined, true)), `/th/fleet${url.search}`);
  assert.equal(url.searchParams.has('campaign'), false);
  assert.equal(writeListingFilters('?campaign=keep&page=3&q=old', { query: '', category: 'All', page: 1 }), '?campaign=keep');
  assert.deepEqual(readListingFilters(new URLSearchParams('page=bad'), ['All'], true), { query: '', category: 'All', page: 1 });
});

test('ordinary News and Project filters keep their original non-paginated contract', () => {
  const filters = { query: 'industry', category: 'All' };
  assert.deepEqual(readListingFilters(new URLSearchParams('q=industry&page=4')), filters);
  assert.equal(writeListingFilters('?page=4&campaign=keep', filters), '?page=4&campaign=keep&q=industry');
  assert.equal(listingHref('/news/article', filters), '/news/article?q=industry');
});
