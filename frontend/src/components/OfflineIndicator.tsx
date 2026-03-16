import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { offlineDB } from '../services/offlineDB';
import { useEffect, useState } from 'react';
import '../styles/OfflineIndicator.css';

interface SyncState {
  status: 'idle' | 'syncing' | 'done' | 'error';
  pendingCount: number;
  conflictCount: number;
  successCount?: number;
}

export function OfflineIndicator() {
  const { isOnline, isInitialized } = useOnlineStatus();
  const [syncState, setSyncState] = useState<SyncState>({
    status: 'idle',
    pendingCount: 0,
    conflictCount: 0,
  });

  const updatePendingCounts = async () => {
    try {
      // Ensure DB is initialized before accessing it
      if (!offlineDB['db']) {
        await offlineDB.init();
      }

      const queue = await offlineDB.getSyncQueue();
      const conflicts = await offlineDB.getConflictedItems();

      setSyncState((prev) => ({
        ...prev,
        pendingCount: queue.length,
        conflictCount: conflicts.length,
      }));
    } catch (error) {
      console.warn('[OfflineIndicator] Failed to update pending counts:', error);
    }
  };

  useEffect(() => {
    if (!isOnline) {
      setSyncState((prev) => ({ ...prev, status: 'idle' }));
    }
    updatePendingCounts();
  }, [isOnline]);

  useEffect(() => {
    const handleSyncStart = () => {
      setSyncState((prev) => ({ ...prev, status: 'syncing' }));
    };

    const handleSyncEnd = () => {
      setSyncState((prev) => ({ ...prev, status: 'done' }));
      updatePendingCounts();
    };

    const handleSyncComplete = (event: any) => {
      if (event.detail?.success) {
        setSyncState((prev) => ({ ...prev, status: 'done' }));
      } else {
        setSyncState((prev) => ({ ...prev, status: 'error' }));
      }
      updatePendingCounts();
    };

    window.addEventListener('sync:start', handleSyncStart);
    window.addEventListener('sync:end', handleSyncEnd);
    window.addEventListener('sync:complete', handleSyncComplete);

    // Auto-hide "done" message after 3 seconds
    if (syncState.status === 'done') {
      const timer = setTimeout(() => {
        setSyncState((prev) => ({ ...prev, status: 'idle' }));
      }, 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('sync:start', handleSyncStart);
      window.removeEventListener('sync:end', handleSyncEnd);
      window.removeEventListener('sync:complete', handleSyncComplete);
    };
  }, [syncState.status]);

  if (!isInitialized) return null;

  if (isOnline) {
    if (syncState.status === 'syncing') {
      return (
        <div className="offline-indicator online syncing">
          <div className="indicator-content">
            <span className="spinner"></span>
            <span>Syncing {syncState.pendingCount} pending operation{syncState.pendingCount !== 1 ? 's' : ''}...</span>
          </div>
        </div>
      );
    }

    if (syncState.status === 'done') {
      return (
        <div className="offline-indicator online synced">
          <div className="indicator-content">
            <span className="check-icon">✓</span>
            <span>All changes synced</span>
          </div>
        </div>
      );
    }

    if (syncState.status === 'error') {
      return (
        <div className="offline-indicator online error">
          <div className="indicator-content">
            <span className="error-icon">❌</span>
            <span>{syncState.pendingCount} items failed to sync - will retry</span>
          </div>
        </div>
      );
    }

    if (syncState.pendingCount > 0) {
      return (
        <div className="offline-indicator online pending">
          <div className="indicator-content">
            <span className="pending-icon">⏳</span>
            <span>{syncState.pendingCount} pending operation{syncState.pendingCount !== 1 ? 's' : ''}</span>
            {syncState.conflictCount > 0 && <span className="conflict-info">({syncState.conflictCount} conflict{syncState.conflictCount !== 1 ? 's' : ''})</span>}
          </div>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="offline-indicator offline">
      <div className="indicator-content">
        <span className="wifi-icon">📡</span>
        <span>Offline mode - Data will sync when you go online</span>
        {syncState.pendingCount > 0 && <span className="pending-info">({syncState.pendingCount} pending operation{syncState.pendingCount !== 1 ? 's' : ''})</span>}
      </div>
    </div>
  );
}
