import type { Enquiry } from './cms-types';

export function inboxRequestUrl(query: string, status: string, cursor?: string | null) {
  const params = new URLSearchParams({ q: query.trim(), status });
  if (cursor) params.set('cursor', cursor);
  return `/api/cms/inbox?${params}`;
}

export function mergeInboxPages(current: Enquiry[], incoming: Enquiry[]) {
  const rows = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) rows.set(item.id, item);
  return [...rows.values()];
}

// Every request shares this scope, including refreshes and later pages. An old
// response remains invalid even when a transport ignores its abort signal.
export function createInboxRequestScope() {
  let active: AbortController | null = null;
  return {
    begin() {
      active?.abort();
      const controller = new AbortController();
      active = controller;
      return { signal: controller.signal, isCurrent: () => active === controller && !controller.signal.aborted };
    },
    invalidate() { active?.abort(); active = null; },
  };
}
