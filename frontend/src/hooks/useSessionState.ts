import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Like useState, but persists to sessionStorage keyed by `key`.
 * On remount (back navigation) the saved value is restored automatically.
 */
export function useSessionState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = sessionStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {}
    return defaultValue;
  });

  const set: React.Dispatch<React.SetStateAction<T>> = useCallback((action) => {
    setValue(prev => {
      const next = typeof action === 'function' ? (action as (p: T) => T)(prev) : action;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [value, set];
}

/**
 * Saves scroll position on unmount and restores it on mount (after `ready` becomes true).
 * Pass `ready = true` once the page data has loaded and the DOM is settled.
 */
export function useScrollRestore(key: string, ready: boolean) {
  const location = useLocation();
  const restoredRef = useRef(false);

  // Restore once data is ready
  useEffect(() => {
    if (!ready || restoredRef.current) return;
    try {
      const saved = sessionStorage.getItem(key + '__scroll');
      if (saved) {
        const y = parseInt(saved, 10);
        if (y > 0) {
          // small delay to let the DOM paint
          setTimeout(() => window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior }), 50);
        }
      }
    } catch {}
    restoredRef.current = true;
  }, [key, ready]);

  // Save on unmount
  useEffect(() => {
    return () => {
      try { sessionStorage.setItem(key + '__scroll', String(window.scrollY)); } catch {}
    };
  }, [key]);

  // Reset restored flag on location change (new navigation, not back)
  useEffect(() => {
    restoredRef.current = false;
  }, [location.key]);
}
