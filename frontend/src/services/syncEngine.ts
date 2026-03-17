import axios, { AxiosError } from 'axios';
import { offlineDB } from './offlineDB';
import { config as appConfig } from '../config';

interface SyncRequest {
  id: number;
  method: string;
  url: string;
  data?: any;
  headers?: any;
  timestamp: number;
  status?: string;
  retry_count?: number;
}

interface TempIdMapping {
  tempId: string;
  realId: string;
  storeName: string;
}

export class SyncEngine {
  private isSyncing = false;
  private tempIdMappings: Map<string, TempIdMapping> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly BASE_RETRY_DELAY = 1000; // 1 second

  async syncPendingRequests(): Promise<void> {
    if (this.isSyncing) {
      console.log('[Sync] Sync already in progress');
      return;
    }

    this.isSyncing = true;
    window.dispatchEvent(new Event('sync:start'));

    try {
      const pendingRequests = await offlineDB.getSyncQueue();

      if (pendingRequests.length === 0) {
        console.log('[Sync] No pending requests to sync');
        this.isSyncing = false;
        window.dispatchEvent(new Event('sync:end'));
        return;
      }

      console.log(`[Sync] Starting sync of ${pendingRequests.length} pending requests (FIFO)...`);

      // Process requests sequentially (FIFO)
      for (const request of pendingRequests) {
        await this.processRequest(request);
      }

      // Update last sync time
      await offlineDB.setLastSyncTime();

      // Clean up old data (older than 30 days)
      await offlineDB.clearOldData(30);

      console.log('[Sync] Sync completed successfully');
      window.dispatchEvent(new CustomEvent('sync:complete', { detail: { success: true } }));
    } catch (error) {
      console.error('[Sync] Sync failed:', error);
      window.dispatchEvent(new CustomEvent('sync:complete', { detail: { success: false, error } }));
    } finally {
      this.isSyncing = false;
      window.dispatchEvent(new Event('sync:end'));
    }
  }

  private async processRequest(request: SyncRequest): Promise<void> {
    const retryCount = request.retry_count || 0;

    console.log(`[Sync] Processing: ${request.method} ${request.url} (attempt ${retryCount + 1}/${this.MAX_RETRIES + 1})`);

    try {
      // Replace temp IDs in URL and data
      let url = request.url;
      let data = request.data;

      // Ensure URL is absolute (fix for old queue items stored with relative URLs)
      if (url && !url.startsWith('http')) {
        url = appConfig.API_BASE_URL + url;
      }

      // Replace temp IDs in URL
      for (const [tempId, mapping] of this.tempIdMappings) {
        url = url.replace(tempId, mapping.realId);
      }

      // Replace temp IDs in request data
      if (data) {
        data = this.replaceTempIdsInData(data);
      }

      const config: any = {
        method: request.method,
        url,
        headers: {
          ...request.headers,
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      };

      if (request.method !== 'GET' && request.method !== 'DELETE') {
        config.data = data;
      }

      const response = await axios(config);

      if (response.status >= 200 && response.status < 300) {
        // Success - handle temp ID mapping for POST requests
        if (request.method === 'POST' && response.data?.data) {
          await this.handlePostSuccess(request, response.data.data);
        } else if (request.method === 'PUT') {
          // Update sync_status to synced for PUT requests
          const storeName = this.extractStoreNameFromUrl(request.url);
          const idMatch = request.url.match(/\/([a-f0-9-]+)(?:\/|$)/);
          if (storeName && idMatch) {
            await offlineDB.updateSyncStatus(storeName, idMatch[1], 'synced');
          }
        } else if (request.method === 'DELETE') {
          // Remove from offlineDB cache for DELETE requests
          const storeName = this.extractStoreNameFromUrl(request.url);
          const idMatch = request.url.match(/\/([a-f0-9-]+)(?:\/|$)/);
          if (storeName && idMatch) {
            const id = idMatch[1];
            const cached = await offlineDB.getData(storeName);
            const filtered = cached.filter((item) => item.id !== id);
            if (filtered.length < cached.length) {
              await offlineDB.saveData(storeName, filtered);
            }
          }
        }

        // Remove from sync queue
        await offlineDB.removeSyncQueueItem(request.id);
        console.log(`[Sync] ✅ Synced: ${request.method} ${request.url}`);
      }
    } catch (error) {
      await this.handleSyncError(error as AxiosError, request, retryCount);
    }
  }

  private async handlePostSuccess(request: SyncRequest, responseData: any): Promise<void> {
    const storeName = this.extractStoreNameFromUrl(request.url);

    if (!storeName || !responseData?.id) {
      return;
    }

    // Find temp ID in original request data
    const originalData = request.data;
    if (!originalData?.id?.startsWith('temp_')) {
      return;
    }

    const tempId = originalData.id;
    const realId = responseData.id;

    console.log(`[Sync] Mapping temp ID ${tempId} → ${realId}`);

    // Store mapping for future references
    this.tempIdMappings.set(tempId, { tempId, realId, storeName });

    // Update all references in offlineDB
    await this.updateTempIdReferences(tempId, realId, storeName);

    // Update the item in offlineDB with real ID
    const cached = await offlineDB.getData(storeName);
    const itemIndex = cached.findIndex((item) => item.id === tempId);

    if (itemIndex >= 0) {
      const updatedItem = {
        ...responseData,
        sync_status: 'synced',
        last_modified: Date.now(),
      };
      cached[itemIndex] = updatedItem;
      await offlineDB.saveData(storeName, cached);
      console.log(`[Sync] Updated ${storeName} item: ${tempId} → ${realId}`);
    }
  }

  private async updateTempIdReferences(tempId: string, realId: string, sourceStore: string): Promise<void> {
    // Update references in other stores
    const storesToCheck = ['visits', 'reports', 'todos', 'orders'];
    const replacementField = sourceStore === 'clients' ? 'client_id' : sourceStore === 'companies' ? 'company_id' : null;

    if (!replacementField) return;

    for (const storeName of storesToCheck) {
      try {
        const items = await offlineDB.getData(storeName);
        let modified = false;

        const updated = items.map((item) => {
          if (item[replacementField] === tempId) {
            modified = true;
            return { ...item, [replacementField]: realId };
          }
          return item;
        });

        if (modified) {
          await offlineDB.saveData(storeName, updated);
          console.log(`[Sync] Updated ${replacementField} references in ${storeName}`);
        }
      } catch (error) {
        console.warn(`[Sync] Failed to update references in ${storeName}:`, error);
      }
    }
  }

  private async handleSyncError(error: AxiosError, request: SyncRequest, retryCount: number): Promise<void> {
    // Handle conflict (409)
    if (error.response?.status === 409) {
      console.warn(`[Sync] ⚠️ Conflict detected for ${request.url}`);
      const storeName = this.extractStoreNameFromUrl(request.url);
      const idMatch = request.url.match(/\/([a-f0-9-]+)(?:\/|$)/);

      if (storeName && idMatch) {
        const id = idMatch[1];
        await offlineDB.updateSyncStatus(storeName, id, 'conflict');
        await offlineDB.removeSyncQueueItem(request.id);
        console.log(`[Sync] Marked ${id} as conflicted for manual resolution`);
      }
      return;
    }

    // Retry logic with exponential backoff
    if (retryCount < this.MAX_RETRIES) {
      const delayMs = this.BASE_RETRY_DELAY * Math.pow(2, retryCount);
      console.log(`[Sync] ⏳ Retrying in ${delayMs}ms (attempt ${retryCount + 1}/${this.MAX_RETRIES})...`);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Update retry count and re-process
      const updatedRequest: SyncRequest = {
        ...request,
        retry_count: retryCount + 1,
      };
      await this.processRequest(updatedRequest);
    } else {
      // Max retries exceeded - keep in queue but log error
      console.error(`[Sync] ❌ Failed to sync ${request.method} ${request.url} after ${this.MAX_RETRIES + 1} attempts`);
      // The request stays in the queue for next sync attempt
    }
  }

  private replaceTempIdsInData(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const result = Array.isArray(data) ? [...data] : { ...data };

    for (const [tempId, mapping] of this.tempIdMappings) {
      if (typeof result === 'object') {
        for (const key in result) {
          if (result[key] === tempId) {
            result[key] = mapping.realId;
          } else if (typeof result[key] === 'object' && result[key] !== null) {
            result[key] = this.replaceTempIdsInData(result[key]);
          }
        }
      }
    }

    return result;
  }

  private extractStoreNameFromUrl(url: string): string | null {
    const match = url.match(/\/([a-zA-Z]+)(?:\/|$)/);
    if (!match) return null;

    const storeName = match[1];
    const validStores = [
      'users',
      'clients',
      'companies',
      'visits',
      'reports',
      'attachments',
      'permissions',
      'todos',
      'orders',
    ];

    return validStores.includes(storeName) ? storeName : null;
  }
}

export const syncEngine = new SyncEngine();
