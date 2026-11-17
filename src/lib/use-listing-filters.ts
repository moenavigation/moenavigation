"use client";

import { usePublicSearchParams } from './use-public-search-params';
import { readListingFilters, writeListingFilters, type ListingFilters } from './listing-filters';

export function useListingFilters(categories: readonly string[], paginated = false) {
  const params = usePublicSearchParams();
  const filters = readListingFilters(params, categories, paginated);

  function update(patch: Partial<ListingFilters>, addHistory: boolean) {
    const current = readListingFilters(new URLSearchParams(window.location.search), categories, paginated);
    const next = { ...current, ...patch, ...(paginated && ('query' in patch || 'category' in patch) ? { page: 1 } : {}) };
    const search = writeListingFilters(window.location.search, next);
    const url = `${window.location.pathname}${search}${window.location.hash}`;
    if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
    // Next's native-history integration updates useSearchParams without a server fetch or scroll jump.
    if (addHistory) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }

  return {
    ...filters,
    setQuery: (query: string) => update({ query }, false),
    setCategory: (category: string) => update({ category }, true),
    setPage: (page: number) => update({ page }, true),
    replacePage: (page: number) => update({ page }, false),
    reset: () => update({ query: '', category: 'All' }, true),
  };
}
