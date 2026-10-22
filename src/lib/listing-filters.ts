export const listingQueryLimit = 160;
export type ListingFilters = { query: string; category: string };
type SearchValues = Pick<URLSearchParams, 'get'>;

export function readListingFilters(search: SearchValues, categories?: readonly string[]): ListingFilters {
  const category = (search.get('category') || 'All').slice(0, 100);
  return {
    query: (search.get('q') || '').slice(0, listingQueryLimit),
    category: !categories || categories.includes(category) ? category : 'All',
  };
}

export function writeListingFilters(search: string, filters: ListingFilters) {
  const params = new URLSearchParams(search);
  if (filters.query) params.set('q', filters.query.slice(0, listingQueryLimit));
  else params.delete('q');
  if (filters.category && filters.category !== 'All') params.set('category', filters.category.slice(0, 100));
  else params.delete('category');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function listingHref(path: string, filters: ListingFilters) {
  // Carry only collection state to detail/back links, never unrelated URL parameters.
  return `${path}${writeListingFilters('', filters)}`;
}

export function matchesListingSearch(query: string, fields: readonly (string | undefined)[]) {
  const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[\u200B\uFEFF]/g, '');
  const haystack = normalize(fields.filter(Boolean).join(' '));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}
