import React, { useEffect, useState } from 'react';
import { offlineDB } from '../services/offlineDB';
import '../styles/SyncStatusBadge.css';

interface SyncStatusBadgeProps {
  storeName: string;
  recordId: string;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ storeName, recordId }) => {
  const [syncStatus, setSyncStatus] = useState<'synced' | 'pending' | 'conflict' | null>(null);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        // Ensure DB is initialized
        if (!offlineDB['db']) {
          await offlineDB.init();
        }

        const data = await offlineDB.getData(storeName);
        const item = data.find((x) => x.id === recordId);
        if (item) {
          setSyncStatus(item.sync_status || 'synced');
        }
      } catch (error) {
        console.warn('[SyncStatusBadge] Failed to check sync status:', error);
      }
    };

    checkStatus();

    // Listen for sync events to update status
    const handleSyncComplete = () => checkStatus();
    window.addEventListener('sync:complete', handleSyncComplete);

    return () => {
      window.removeEventListener('sync:complete', handleSyncComplete);
    };
  }, [storeName, recordId]);

  if (!syncStatus || syncStatus === 'synced') {
    return null; // Don't show badge for synced items
  }

  if (syncStatus === 'pending') {
    return (
      <span className="sync-badge sync-badge-pending" title="Waiting to sync when online">
        ⏳ Pending
      </span>
    );
  }

  if (syncStatus === 'conflict') {
    return (
      <span className="sync-badge sync-badge-conflict" title="This item has a conflict. Click to resolve.">
        ⚠️ Conflict
      </span>
    );
  }

  return null;
};
