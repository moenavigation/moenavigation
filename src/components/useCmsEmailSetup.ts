'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cmsRequest } from '@/lib/cms-client';
import type { EmailSetupStatus } from '@/lib/enquiry-email';

const refreshCooldownMs = 3000;
type Scope = { userId: string | null };
type Snapshot = { scope: Scope | null; status: EmailSetupStatus | null; loading: boolean; error: boolean; checkedAt: string | null; cooldownUntil: number };
const emptySnapshot: Snapshot = { scope: null, status: null, loading: false, error: false, checkedAt: null, cooldownUntil: 0 };

/** A local deadline wake-up; it never polls the server. */
export function useCmsDeadline(deadline: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline || deadline <= now) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(2_147_483_647, Math.max(0, deadline - Date.now()) + 25));
    return () => clearTimeout(timer);
  }, [deadline, now]);
  return deadline > now;
}

export default function useCmsEmailSetup(userId: string | null, enabled: boolean) {
  const scope = useMemo(() => ({ userId }), [userId]);
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const request = useRef<AbortController | null>(null);
  const completedScope = useRef<Scope | null>(null);
  const cooldown = useRef<{ scope: Scope | null; until: number }>({ scope: null, until: 0 });

  const refresh = useCallback(async (afterSave = false) => {
    if (!enabled || !userId) return;
    if (afterSave) { request.current?.abort(); request.current = null; }
    if (request.current || !afterSave && cooldown.current.scope === scope && cooldown.current.until > Date.now()) return;
    const controller = new AbortController();
    request.current = controller;
    const cooldownUntil = Date.now() + refreshCooldownMs;
    cooldown.current = { scope, until: cooldownUntil };
    setSnapshot(current => ({ ...(current.scope === scope ? current : emptySnapshot), scope, loading: true, error: false, cooldownUntil }));
    try {
      const status = await cmsRequest<EmailSetupStatus>('/api/cms/email/status', {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
      });
      if (controller.signal.aborted || request.current !== controller) return;
      completedScope.current = scope;
      setSnapshot({ scope, status, loading: false, error: false, checkedAt: new Date().toISOString(), cooldownUntil });
    } catch {
      if (controller.signal.aborted || request.current !== controller) return;
      completedScope.current = scope;
      setSnapshot(current => ({ ...(current.scope === scope ? current : emptySnapshot), scope, loading: false, error: true, cooldownUntil }));
    } finally {
      if (request.current === controller) request.current = null;
    }
  }, [enabled, scope, userId]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const timer = setTimeout(() => { if (completedScope.current !== scope) void refresh(); }, 0);
    return () => {
      clearTimeout(timer);
      if (request.current) {
        request.current.abort();
        request.current = null;
        completedScope.current = null;
        cooldown.current = { scope: null, until: 0 };
      }
    };
  }, [enabled, refresh, scope, userId]);

  const current = snapshot.scope === scope ? snapshot : emptySnapshot;
  const coolingDown = useCmsDeadline(current.cooldownUntil);
  const loading = enabled && (!current.status && !current.error || current.loading);
  return {
    status: current.status,
    checkedAt: current.checkedAt,
    error: current.error,
    loading,
    canSend: enabled && !loading && !current.error && current.status?.configured === true,
    canRefresh: enabled && Boolean(userId) && !loading && !coolingDown,
    refresh,
  };
}

export type CmsEmailSetupState = ReturnType<typeof useCmsEmailSetup>;
