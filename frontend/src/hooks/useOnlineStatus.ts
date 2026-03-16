import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    setIsInitialized(true);

    const handleOnline = () => {
      setIsOnline(true);
      // Dispatch custom event for sync
      window.dispatchEvent(new Event('app:online'));
    };

    const handleOffline = () => {
      setIsOnline(false);
      // Dispatch custom event
      window.dispatchEvent(new Event('app:offline'));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, isInitialized };
}
