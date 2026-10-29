import assert from 'node:assert/strict';
import test from 'node:test';
import { listingHref, listingQueryLimit, matchesListingSearch, readListingFilters, writeListingFilters } from '../src/lib/listing-filters';
import { categoryName } from '../src/lib/category-name';

test('shared collection links restore Unicode search and a known category', () => {
  const filters = { query: 'เรือ MOE', category: 'Container' };
  const url = new URL(listingHref('/th/fleet/ranong-moe', filters), 'https://example.com');
  assert.deepEqual(readListingFilters(url.searchParams, ['All', 'Container']), filters);
  assert.equal(listingHref('/fleet', readListingFilters(url.searchParams)), `/fleet${url.search}`);
});

test('unknown and oversized URL filters have bounded, usable fallbacks', () => {
  const result = readListingFilters(new URLSearchParams({ q: 'x'.repeat(500), category: 'Removed category' }), ['All', 'Tanker']);
  assert.equal(result.category, 'All');
  assert.equal(result.query.length, listingQueryLimit);
});

test('reset removes only collection parameters and detail links exclude unrelated data', () => {
  assert.equal(writeListingFilters('?q=old&category=Tanker&campaign=summer', { query: '', category: 'All' }), '?campaign=summer');
  assert.equal(listingHref('/fleet', { query: '', category: 'All' }), '/fleet');
  const href = listingHref('/news/item', { query: 'a&next=https://other.test', category: 'A/B' });
  const url = new URL(href, 'https://example.com');
  assert.equal(url.pathname, '/news/item');
  assert.equal(url.searchParams.get('next'), null);
  assert.equal(url.searchParams.get('q'), 'a&next=https://other.test');
});

test('search matches multiple terms across bilingual titles, summaries and categories', () => {
  const fields = ['MOE LINE 3', 'เรือบรรทุกน้ำมัน', 'Regional tanker operations'];
  assert.equal(matchesListingSearch('  tanker   MOE ', fields), true);
  assert.equal(matchesListingSearch('เรือ MOE', fields), true);
  assert.equal(matchesListingSearch('ＭＯＥ tanker', fields), true);
  assert.equal(matchesListingSearch('MOE cargo', fields), false);
  assert.equal(matchesListingSearch('   ', fields), true);
  assert.equal(matchesListingSearch('เรือบรรทุกน้ำมัน', ['Tanker', categoryName('th', 'Tanker')]), true);
});
