'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cmsErrorText, cmsRequest } from '@/lib/cms-client';
import { createInboxRequestScope, inboxRequestUrl, mergeInboxPages } from '@/lib/cms-inbox-client';
import type { EnquiryPage, InboxStatus } from '@/lib/inbox-query';

type InboxRequestKey = { query: string; status: InboxStatus; revision: number };
type InboxState = {
  key: InboxRequestKey | null;
  page: EnquiryPage | null;
  error: string;
  loadingMore: boolean;
};

export default function useCmsInbox(enabled: boolean, query: string, status: InboxStatus) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<InboxState>({ key: null, page: null, error: '', loadingMore: false });
  const [counts, setCounts] = useState<{ totalAll: number; newCount: number } | null>(null);
  const requestScope = useRef(createInboxRequestScope());
  const pendingMore = useRef(false);
  const previousQuery = useRef('');
  const normalizedQuery = query.trim();
  // A fresh identity also covers A → B → A filter changes: an old A response
  // cannot look finished while the new A request is still being fetched.
  const key = useMemo(() => ({ query: normalizedQuery, status, revision }), [normalizedQuery, status, revision]);

  const invalidate = useCallback(() => {
    requestScope.current.invalidate();
    pendingMore.current = false;
  }, []);

  const refresh = useCallback(() => {
    invalidate();
    setCounts(null);
    setRevision(value => value + 1);
  }, [invalidate]);

  useEffect(() => {
    const scope = requestScope.current;
    if (!enabled) { scope.invalidate(); return; }
    const request = scope.begin();
    pendingMore.current = false;
    const delay = normalizedQuery && normalizedQuery !== previousQuery.current ? 300 : 0;
    previousQuery.current = normalizedQuery;
    // Clearing a search, status filters and refreshes are immediate; typing is debounced.
    const timer = setTimeout(async () => {
      try {
        const page = await cmsRequest<EnquiryPage>(inboxRequestUrl(normalizedQuery, status), {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(65_000)]),
        });
        if (!request.isCurrent()) return;
        setState({ key, page, error: '', loadingMore: false });
        setCounts({ totalAll: page.totalAll, newCount: page.newCount });
      } catch (cause) {
        if (request.isCurrent()) setState({ key, page: null, error: cmsErrorText(cause), loadingMore: false });
      }
    }, delay);
    return () => { clearTimeout(timer); scope.invalidate(); };
  }, [enabled, key, normalizedQuery, status]);

  const loadMore = useCallback(async () => {
    if (!enabled || state.key !== key || !state.page?.nextCursor || pendingMore.current) return;
    const request = requestScope.current.begin();
    const cursor = state.page.nextCursor;
    pendingMore.current = true;
    setState(current => ({ ...current, error: '', loadingMore: true }));
    try {
      const page = await cmsRequest<EnquiryPage>(inboxRequestUrl(normalizedQuery, status, cursor), {
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(65_000)]),
      });
      if (!request.isCurrent()) return;
      setState(current => current.key !== key || !current.page ? current : {
        key, page: { ...page, enquiries: mergeInboxPages(current.page.enquiries, page.enquiries) }, error: '', loadingMore: false,
      });
      setCounts({ totalAll: page.totalAll, newCount: page.newCount });
    } catch (cause) {
      if (request.isCurrent()) setState(current => ({ ...current, error: cmsErrorText(cause), loadingMore: false }));
    } finally {
      if (request.isCurrent()) pendingMore.current = false;
    }
  }, [enabled, key, normalizedQuery, state.key, state.page, status]);

  // A response only belongs to its exact filter + refresh revision. Never show
  // an earlier filter's rows or counts under newly typed search criteria.
  const current = enabled && state.key === key ? state : null;
  return {
    enquiries: current?.page?.enquiries || [],
    total: current?.page?.total ?? null,
    totalAll: enabled ? counts?.totalAll ?? null : null,
    newCount: enabled ? counts?.newCount ?? null : null,
    nextCursor: current?.page?.nextCursor || null,
    searching: enabled && (!current || (!current.page && !current.error)),
    loadingMore: current?.loadingMore || false,
    error: current?.error || '',
    refresh, invalidate, loadMore,
  };
}
