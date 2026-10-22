"use client";

import { useSearchParams } from 'next/navigation';
import { readListingFilters, writeListingFilters, type ListingFilters } from './listing-filters';

export function useListingFilters(categories: readonly string[]) {
  const params = useSearchParams();
  const filters = readListingFilters(params, categories);

  function update(patch: Partial<ListingFilters>, addHistory: boolean) {
    const current = readListingFilters(new URLSearchParams(window.location.search), categories);
    const search = writeListingFilters(window.location.search, { ...current, ...patch });
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
    reset: () => update({ query: '', category: 'All' }, true),
  };
}
