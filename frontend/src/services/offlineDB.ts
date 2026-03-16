// IndexedDB utilities for 30-day offline support

const DB_NAME = 'visit-tracker-offline';
const DB_VERSION = 1;

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
    'syncQueue', // For pending operations
    'metadata', // For last sync time, etc
  ];

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores
        this.objectStores.forEach((storeName) => {
          if (!db.objectStoreNames.contains(storeName)) {
            const store = db.createObjectStore(storeName, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        });

        // Create syncQueue store with compound key
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async saveData(storeName: string, data: any[]): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      // Clear existing data
      store.clear();

      // Add new data with timestamp, sync_status, and version
      data.forEach((item) => {
        // Use put instead of add to handle items with or without existing keys
        store.put({
          ...item,
          timestamp: Date.now(),
          sync_status: 'synced',
          last_modified: Date.now(),
          version: 1,
        });
      });

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve();
    });
  }

  async getData(storeName: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

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
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');

      const request = store.add({
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
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readonly');
      const store = transaction.objectStore('syncQueue');
      const index = store.index('timestamp');
      const request = index.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        // Filter only pending items
        const pending = request.result.filter((item) => item.status === 'pending');
        resolve(pending);
      };
    });
  }

  async removeSyncQueueItem(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['syncQueue'], 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.oncomplete = () => resolve();
    });
  }

  async clearOldData(days: number = 30): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

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
    if (!this.db) throw new Error('Database not initialized');

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
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['metadata'], 'readwrite');
      const store = transaction.objectStore('metadata');

      const request = store.put({
        id: 'lastSync',
        timestamp: Date.now(),
      });

      request.onerror = () => reject(request.error);
      request.oncomplete = () => resolve();
    });
  }

  async markAsPending(storeName: string, id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

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

  async getPendingItems(storeName: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized');

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
    if (!this.db) throw new Error('Database not initialized');

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
    if (!this.db) throw new Error('Database not initialized');

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
    if (!this.db) throw new Error('Database not initialized');

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
