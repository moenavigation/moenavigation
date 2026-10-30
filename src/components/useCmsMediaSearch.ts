'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import type { MediaItem } from '@/lib/cms-types';

type SearchState = {
  query: string;
  items: MediaItem[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string;
};

const empty: SearchState = { query: '', items: [], nextCursor: null, loading: false, loadingMore: false, error: '' };

export default function useCmsMediaSearch(query: string, enabled: boolean, revision = 0) {
  const normalized = query.trim();
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<SearchState>(empty);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    request.current?.abort();
    if (!enabled || !normalized) { request.current = null; return; }
    const controller = new AbortController();
    request.current = controller;
    setState({ ...empty, query: normalized, loading: true });
    const timer = setTimeout(async () => {
      try {
        const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>(`/api/cms/media?q=${encodeURIComponent(normalized)}`, { signal: controller.signal });
        if (generation.current === current && !controller.signal.aborted) setState({ query: normalized, items: result.media, nextCursor: result.nextCursor, loading: false, loadingMore: false, error: '' });
      } catch (cause) {
        if (generation.current === current && !controller.signal.aborted) setState({ ...empty, query: normalized, error: cmsErrorText(cause) });
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, normalized, revision, retryCount]);

  const loadMore = useCallback(async () => {
    if (!enabled || !normalized || state.query !== normalized || state.loading || state.loadingMore || !state.nextCursor) return;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ ...previous, loadingMore: true, error: '' }));
    try {
      const result = await cmsRequest<{ media: MediaItem[]; nextCursor: string | null }>(`/api/cms/media?q=${encodeURIComponent(normalized)}&cursor=${encodeURIComponent(state.nextCursor)}`, { signal: controller.signal });
      if (generation.current !== current || controller.signal.aborted) return;
      setState(previous => previous.query !== normalized ? previous : {
        ...previous,
        items: [...previous.items, ...result.media.filter(item => !previous.items.some(existing => existing.id === item.id))],
        nextCursor: result.nextCursor,
        loadingMore: false,
      });
    } catch (cause) {
      if (generation.current === current && !controller.signal.aborted) setState(previous => ({ ...previous, loadingMore: false, error: cmsErrorText(cause) }));
    }
  }, [enabled, normalized, state]);

  const current = enabled && normalized && state.query === normalized ? state : null;
  return {
    items: current?.items || [],
    nextCursor: current?.nextCursor || null,
    loading: enabled && Boolean(normalized) && (!current || current.loading),
    loadingMore: current?.loadingMore || false,
    error: current?.error || '',
    loadMore,
    retry: () => setRetryCount(value => value + 1),
  };
}
