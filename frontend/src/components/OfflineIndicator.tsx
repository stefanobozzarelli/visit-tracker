import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useEffect, useState } from 'react';
import '../styles/OfflineIndicator.css';

export function OfflineIndicator() {
  const { isOnline, isInitialized } = useOnlineStatus();
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done'>('idle');

  useEffect(() => {
    if (!isOnline) {
      setSyncStatus('idle');
    }
  }, [isOnline]);

  useEffect(() => {
    const handleSyncStart = () => setSyncStatus('syncing');
    const handleSyncEnd = () => setSyncStatus('done');

    window.addEventListener('sync:start', handleSyncStart);
    window.addEventListener('sync:end', handleSyncEnd);

    // Auto-hide "done" message
    if (syncStatus === 'done') {
      const timer = setTimeout(() => setSyncStatus('idle'), 3000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('sync:start', handleSyncStart);
      window.removeEventListener('sync:end', handleSyncEnd);
    };
  }, [syncStatus]);

  if (!isInitialized) return null;

  if (isOnline) {
    if (syncStatus === 'syncing') {
      return (
        <div className="offline-indicator online syncing">
          <div className="indicator-content">
            <span className="spinner"></span>
            <span>Sincronizzazione in corso...</span>
          </div>
        </div>
      );
    }

    if (syncStatus === 'done') {
      return (
        <div className="offline-indicator online synced">
          <div className="indicator-content">
            <span className="check-icon">✓</span>
            <span>Sincronizzazione completata</span>
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
        <span>Modalità offline - I dati verranno sincronizzati quando tornerai online</span>
      </div>
    </div>
  );
}
