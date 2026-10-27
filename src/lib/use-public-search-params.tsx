'use client';

import { useSearchParams } from 'next/navigation';
import { createContext, Suspense, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

function createSearchStore() {
  let search = '';
  const listeners = new Set<() => void>();
  return {
    snapshot: () => search,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish(next: string) {
      if (search === next) return;
      search = next;
      listeners.forEach(listener => listener());
    },
  };
}

type SearchStore = ReturnType<typeof createSearchStore>;
const SearchContext = createContext<SearchStore | null>(null);
const serverSnapshot = () => '';

function SearchObserver({ store }: { store: SearchStore }) {
  const search = useSearchParams().toString();
  useLayoutEffect(() => { store.publish(search); }, [search, store]);
  return null;
}

/** Keep query-dependent preferences out of the cached HTML without hiding page content. */
export function PublicSearchParamsProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createSearchStore);
  return <SearchContext.Provider value={store}>
    {/* Next updates this observer for link navigation, native history and Back/Forward. */}
    <Suspense fallback={null}><SearchObserver store={store} /></Suspense>
    {children}
  </SearchContext.Provider>;
}

export function usePublicSearchParams() {
  const store = useContext(SearchContext);
  if (!store) throw new Error('PublicSearchParamsProvider is required for public query preferences.');
  const search = useSyncExternalStore(store.subscribe, store.snapshot, serverSnapshot);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Update controlled route controls immediately while Next synchronizes native history. */
export function useReplacePublicSearchParams() {
  const store = useContext(SearchContext);
  if (!store) throw new Error('PublicSearchParamsProvider is required for public query preferences.');
  return useCallback((params: URLSearchParams) => {
    const search = params.toString();
    const url = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', url);
    store.publish(search);
  }, [store]);
}
