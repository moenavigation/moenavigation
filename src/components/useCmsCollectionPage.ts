'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import type { ContentRecord, ContentType } from '@/lib/cms-types';

type CollectionType = Exclude<ContentType, 'Page' | 'Section'>;
type CollectionPage = { records: ContentRecord[]; nextCursor: string | null; total: number };
type PageState = CollectionPage & { key: string; loading: boolean; loadingMore: boolean; error: string };
const empty: PageState = { key: '', records: [], nextCursor: null, total: 0, loading: false, loadingMore: false, error: '' };

function url(type: CollectionType, query: string, cursor?: string) {
  const params = new URLSearchParams({ type, q: query });
  if (cursor) params.set('cursor', cursor);
  return `/api/cms/content?${params}`;
}

export default function useCmsCollectionPage(type: CollectionType | null, query: string, enabled: boolean, revision: number) {
  const normalized = query.trim();
  const key = `${type || ''}\u0000${normalized}\u0000${revision}`;
  const [retryCount, setRetryCount] = useState(0);
  const [state, setState] = useState<PageState>(empty);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    request.current?.abort();
    if (!enabled || !type) { request.current = null; return; }
    const controller = new AbortController();
    request.current = controller;
    setState({ ...empty, key, loading: true });
    const timer = setTimeout(async () => {
      try {
        const result = await cmsRequest<CollectionPage>(url(type, normalized), { signal: controller.signal });
        if (generation.current === current && !controller.signal.aborted) setState({ ...result, key, loading: false, loadingMore: false, error: '' });
      } catch (cause) {
        if (generation.current === current && !controller.signal.aborted) setState({ ...empty, key, error: cmsErrorText(cause) });
      }
    }, normalized ? 300 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, key, normalized, retryCount, type]);

  const loadMore = useCallback(async () => {
    if (!enabled || !type || state.key !== key || state.loading || state.loadingMore || !state.nextCursor) return;
    const current = generation.current;
    const controller = new AbortController();
    request.current = controller;
    setState(previous => ({ ...previous, loadingMore: true, error: '' }));
    try {
      const result = await cmsRequest<CollectionPage>(url(type, normalized, state.nextCursor), { signal: controller.signal });
      if (generation.current !== current || controller.signal.aborted) return;
      setState(previous => previous.key !== key ? previous : {
        ...previous,
        records: [...previous.records, ...result.records.filter(record => !previous.records.some(existing => existing.type === record.type && existing.id === record.id))],
        total: result.total,
        nextCursor: result.nextCursor,
        loadingMore: false,
      });
    } catch (cause) {
      if (generation.current === current && !controller.signal.aborted) setState(previous => ({ ...previous, loadingMore: false, error: cmsErrorText(cause) }));
    }
  }, [enabled, key, normalized, state, type]);

  const current = enabled && type && state.key === key ? state : null;
  return {
    records: current?.records || [],
    total: current?.total ?? null,
    nextCursor: current?.nextCursor || null,
    loading: enabled && Boolean(type) && (!current || current.loading),
    loadingMore: current?.loadingMore || false,
    error: current?.error || '',
    loadMore,
    retry: () => setRetryCount(value => value + 1),
  };
}
