import { useEffect } from 'react';
import { offlineDB } from '../services/offlineDB';

export function useOfflineDatabaseInit() {
  useEffect(() => {
    const initDb = async () => {
      try {
        await offlineDB.init();
        console.log('[OfflineDB] Offline database initialized');
      } catch (error) {
        console.error('[OfflineDB] Failed to initialize offline database:', error);
      }
    };

    initDb();
  }, []);
}
