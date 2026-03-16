import { useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { syncEngine } from '../services/syncEngine';
import { offlineDB } from '../services/offlineDB';

export function useOfflineSync() {
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    if (isOnline) {
      console.log('[Sync] Online detected - triggering sync...');
      // Delay slightly to ensure network is stable and DB is initialized
      const timer = setTimeout(async () => {
        try {
          // Ensure DB is initialized before syncing
          if (!offlineDB['db']) {
            await offlineDB.init();
          }
          await syncEngine.syncPendingRequests();
        } catch (error) {
          console.error('[Sync] Error during sync:', error);
        }
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  // Also listen for manual sync events
  useEffect(() => {
    const handleSyncRequest = async () => {
      if (isOnline) {
        try {
          if (!offlineDB['db']) {
            await offlineDB.init();
          }
          await syncEngine.syncPendingRequests();
        } catch (error) {
          console.error('[Sync] Error during manual sync:', error);
        }
      }
    };

    window.addEventListener('app:sync', handleSyncRequest);
    return () => window.removeEventListener('app:sync', handleSyncRequest);
  }, [isOnline]);
}
