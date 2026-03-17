import { useCallback, useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import { offlineDB } from '../services/offlineDB';
import { apiService } from '../services/api';

const PRELOAD_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useDataPreload() {
  const { isOnline } = useOnlineStatus();
  const { user } = useAuth();
  const [isPreloading, setIsPreloading] = useState(false);

  // Preload critical data for offline use.
  // The api.ts response interceptor automatically caches GET responses into IndexedDB,
  // so we just need to trigger the API calls - no manual saveData needed.
  const prefetchData = useCallback(async () => {
    if (!user) return;

    try {
      setIsPreloading(true);

      // Fire all preloads independently - each has its own try-catch
      // so one failure doesn't block the others
      const preloads = [
        apiService.getClients().catch(() => null),
        apiService.getCompanies().catch(() => null),
        apiService.getVisits().catch(() => null),
        apiService.getTodos().catch(() => null),
        apiService.getUsers().catch(() => null),
      ];

      await Promise.all(preloads);

      // Update last sync time
      await offlineDB.setLastSyncTime();

      console.log('[Preload] Data preload completed');
    } catch (error) {
      console.warn('[Preload] Error during preload:', error);
    } finally {
      setIsPreloading(false);
    }
  }, [user]);

  // Initial preload when user is authenticated
  useEffect(() => {
    if (user && isOnline) {
      prefetchData();
    }
  }, [user, isOnline]);

  // Schedule periodic refresh while online
  useEffect(() => {
    if (!isOnline || !user) return;

    const interval = setInterval(() => {
      prefetchData();
    }, PRELOAD_INTERVAL);

    return () => clearInterval(interval);
  }, [isOnline, user, prefetchData]);

  return { isPreloading };
}
