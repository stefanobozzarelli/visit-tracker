// IndexedDB utilities for 30-day offline support

const DB_NAME = 'visit-tracker-offline';
const DB_VERSION = 2;

export interface StoredData {
  [key: string]: any[];
}

class OfflineDB {
  private db: IDBDatabase | null = null;
  private objectStores = [
    'users',
    'clients',
    'companies',
    'visits',
    'reports',
    'attachments',
    'permissions',
    'todos',
    'orders',
    'syncQueue',
    'metadata',
  ];

  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    // Verify existing connection is still valid before returning early
    if (this.db) {
      try {
        this.db.transaction(['metadata'], 'readonly');
        return; // Connection is valid
      } catch (e) {
        console.warn('[OfflineDB] Existing connection stale in init(), reinitializing...');
        try { this.db.close(); } catch (_) { /* ignore */ }
        this.db = null;
        this.initPromise = null;
      }
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        this.initPromise = null;
        reject(request.error);
      };
      request.onsuccess = () => {
        this.db = request.result;
        // Listen for the database being closed externally (e.g., clear site data, version change)
        this.db.onclose = () => {
          console.warn('[OfflineDB] Database connection closed externally');
          this.db = null;
          this.initPromise = null;
        };
        this.db.onversionchange = () => {
          console.warn('[OfflineDB] Database version changed, closing connection');
          this.db?.close();
          this.db = null;
          this.initPromise = null;
        };
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        this.objectStores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            if (storeName === 'syncQueue') {
              // syncQueue needs autoIncrement
              const store = db.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            } else {
              const store = db.createObjectStore(storeName, { keyPath: 'id' });
              store.createIndex('timestamp', 'timestamp', { unique: false });
            }
          }
        });
      };
    });

    return this.initPromise;
  }

  isReady(): boolean {
    return this.db !== null;
  }

  // Auto-initialize DB if not ready OR if connection became stale/closing
  private async ensureReady(): Promise<void> {
    if (this.db) {
      // Verify the connection is still valid by trying a trivial transaction
      try {
        this.db.transaction(['metadata'], 'readonly');
      } catch (e) {
        // Connection is stale/closing - reset and reinitialize
        console.warn('[OfflineDB] Connection stale, reinitializing...');
        this.db = null;
        this.initPromise = null;
      }
    }
    if (!this.db) {
      await this.init();
    }
  }

  async saveData(storeName: string, data: any[]): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      // Clear existing data
      store.clear();

      // Add new data with timestamp, sync_status, and version
      data.forEach((item) => {
        // Ensure item has an id field (required for keyPath)
        const dataWithId = {
          ...item,
          // If no id, use _id, user_id, or generate one
          id: item.id || item._id || item.user_id || `temp_${Date.now()}_${Math.random()}`,
          timestamp: Date.now(),
          sync_status: 'synced',
          last_modified: Date.now(),
          version: 1,
        };

        // Use put instead of add to handle items with or without existing keys
        store.put(dataWithId);
      });

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  async getData(storeName: string): Promise<any[]> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async addToSyncQueue(
    method: string,
    url: string,
    data: any,
    headers: any = {}
  ): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');

      // Always provide an explicit id - autoIncrement may not work if the
      // store was created in an earlier DB version without it
      const request = store.put({
        id: Date.now() + Math.floor(Math.random() * 10000),
        method,
        url,
        data,
        headers,
        timestamp: Date.now(),
        status: 'pending',
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSyncQueue(): Promise<any[]> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readonly');
      const store = transaction.objectStore('syncQueue');
      const index = store.index('timestamp');
      // Get all items ordered by timestamp (FIFO) - 'next' means ascending order (oldest first)
      const request = index.openCursor(null, 'next');

      const items: any[] = [];

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        } else {
          // Filter only pending items, maintaining FIFO order
          const pending = items.filter((item) => item.status === 'pending');
          resolve(pending);
        }
      };
    });
  }

  async removeSyncQueueItem(id: number): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clearOldData(days: number = 30): Promise<void> {
    await this.ensureReady();

    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

    const storesToClean = ['visits', 'reports', 'attachments'];

    for (const storeName of storesToClean) {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const index = store.index('timestamp');
        const range = IDBKeyRange.upperBound(cutoffTime);
        const request = index.openCursor(range);

        request.onerror = () => reject(request.error);
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          }
        };

        transaction.oncomplete = () => resolve();
      });
    }
  }

  async getLastSyncTime(): Promise<number> {
    await this.ensureReady();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(['metadata'], 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get('lastSync');

      request.onsuccess = () => {
        resolve(request.result?.timestamp || 0);
      };
    });
  }

  async setLastSyncTime(): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');

      const request = store.put({
        id: 'lastSync',
        timestamp: Date.now(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async markAsPending(storeName: string, id: string): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          const updatedItem = {
            ...item,
            sync_status: 'pending',
            last_modified: Date.now(),
          };
          const putRequest = store.put(updatedItem);
          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
        } else {
          reject(new Error(`Item ${id} not found in ${storeName}`));
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Upsert a single item into a store WITHOUT clearing existing data
  async upsertData(storeName: string, item: any): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const dataWithMeta = {
        ...item,
        id: item.id || item._id || item.user_id || `temp_${Date.now()}_${Math.random()}`,
        timestamp: Date.now(),
        sync_status: item.sync_status || 'synced',
        last_modified: Date.now(),
        version: item.version || 1,
      };

      store.put(dataWithMeta);

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  // Upsert multiple items into a store WITHOUT clearing existing data
  async upsertBatch(storeName: string, items: any[]): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      for (const item of items) {
        const dataWithMeta = {
          ...item,
          id: item.id || item._id || item.user_id || `temp_${Date.now()}_${Math.random()}`,
          timestamp: Date.now(),
          sync_status: item.sync_status || 'synced',
          last_modified: Date.now(),
          version: item.version || 1,
        };
        store.put(dataWithMeta);
      }

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  async getPendingItems(storeName: string): Promise<any[]> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const pending = request.result.filter((item) => item.sync_status === 'pending');
        resolve(pending);
      };
    });
  }

  async getConflictedItems(): Promise<any[]> {
    await this.ensureReady();

    const conflicted: any[] = [];
    const storesToCheck = ['clients', 'companies', 'visits', 'reports', 'attachments', 'permissions'];

    for (const storeName of storesToCheck) {
      await new Promise<void>((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const items = request.result.filter((item) => item.sync_status === 'conflict');
          items.forEach((item) => {
            conflicted.push({ ...item, storeName });
          });
          resolve();
        };
      });
    }

    return conflicted;
  }

  async resolveConflict(storeName: string, id: string, resolution: 'server' | 'client', serverData?: any): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      if (resolution === 'server' && serverData) {
        // Use server version
        const updatedItem = {
          ...serverData,
          sync_status: 'synced',
          last_modified: Date.now(),
          version: (serverData.version || 0) + 1,
        };
        const putRequest = store.put(updatedItem);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      } else if (resolution === 'client') {
        // Keep client version and mark for retry
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
          const item = getRequest.result;
          if (item) {
            const updatedItem = {
              ...item,
              sync_status: 'pending',
              last_modified: Date.now(),
            };
            const putRequest = store.put(updatedItem);
            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => resolve();
          } else {
            reject(new Error(`Item ${id} not found in ${storeName}`));
          }
        };

        getRequest.onerror = () => reject(getRequest.error);
      } else {
        reject(new Error('Invalid resolution type'));
      }
    });
  }

  async updateSyncStatus(storeName: string, id: string, status: 'pending' | 'synced' | 'conflict'): Promise<void> {
    await this.ensureReady();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const getRequest = store.get(id);

      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          const updatedItem = {
            ...item,
            sync_status: status,
            last_modified: Date.now(),
          };
          const putRequest = store.put(updatedItem);
          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
        } else {
          resolve(); // Item not found, silently resolve
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  }
}

export const offlineDB = new OfflineDB();
