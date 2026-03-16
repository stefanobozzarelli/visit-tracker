import { useEffect } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { syncEngine } from '../services/syncEngine';

export function useOfflineSync() {
  const { isOnline } = useOnlineStatus();

  useEffect(() => {
    if (isOnline) {
      console.log('Online detected - triggering sync...');
      // Delay slightly to ensure network is stable
      const timer = setTimeout(() => {
        syncEngine.syncPendingRequests();
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  // Also listen for manual sync events
  useEffect(() => {
    const handleSyncRequest = () => {
      if (isOnline) {
        syncEngine.syncPendingRequests();
      }
    };

    window.addEventListener('app:sync', handleSyncRequest);
    return () => window.removeEventListener('app:sync', handleSyncRequest);
  }, [isOnline]);
}
