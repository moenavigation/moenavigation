'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const NOTICE_DURATION_MS = 5_000;

/** Every published notice gets a fresh lifetime, even if its text is unchanged. */
export default function useTimedNotice() {
  const [notice, setNotice] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const publish = useCallback((message: string) => {
    if (!mounted.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setNotice(message);
    if (message) timer.current = setTimeout(() => {
      timer.current = null;
      setNotice('');
    }, NOTICE_DURATION_MS);
  }, []);

  return [notice, publish] as const;
}
