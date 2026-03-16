import axios from 'axios';
import { offlineDB } from './offlineDB';

export class SyncEngine {
  private isSyncing = false;

  async syncPendingRequests(): Promise<void> {
    if (this.isSyncing) {
      console.log('Sync already in progress');
      return;
    }

    this.isSyncing = true;
    window.dispatchEvent(new Event('sync:start'));

    try {
      const pendingRequests = await offlineDB.getSyncQueue();

      if (pendingRequests.length === 0) {
        console.log('No pending requests to sync');
        this.isSyncing = false;
        window.dispatchEvent(new Event('sync:end'));
        return;
      }

      console.log(`Syncing ${pendingRequests.length} pending requests...`);

      for (const request of pendingRequests) {
        try {
          const config: any = {
            method: request.method,
            url: request.url,
            headers: {
              ...request.headers,
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          };

          if (request.method !== 'GET' && request.method !== 'DELETE') {
            config.data = request.data;
          }

          const response = await axios(config);

          if (response.status >= 200 && response.status < 300) {
            // Success - remove from queue
            await offlineDB.removeSyncQueueItem(request.id);
            console.log(`Synced: ${request.method} ${request.url}`);
          }
        } catch (error) {
          console.error(`Failed to sync ${request.method} ${request.url}:`, error);
          // Keep in queue for retry
        }
      }

      // Update last sync time
      await offlineDB.setLastSyncTime();

      // Clean up old data (older than 30 days)
      await offlineDB.clearOldData(30);

      console.log('Sync completed');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
      window.dispatchEvent(new Event('sync:end'));
    }
  }
}

export const syncEngine = new SyncEngine();
