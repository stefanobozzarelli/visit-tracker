import { useEffect, useState } from 'react';
import { useOnlineStatus } from './useOnlineStatus';
import { useAuth } from '../context/AuthContext';
import { offlineDB } from '../services/offlineDB';
import { apiService } from '../services/api';

const PRELOAD_INTERVAL = 5 * 60 * 1000; // 5 minutes

export function useDataPreload() {
  const { isOnline } = useOnlineStatus();
  const { user } = useAuth();
  const [isPreloading, setIsPreloading] = useState(false);

  // Preload critical data
  const prefetchData = async () => {
    if (!isOnline || !user) return;

    try {
      setIsPreloading(true);

      // Preload clients
      try {
        const clientsResponse = await apiService.getClients();
        if (clientsResponse.success && clientsResponse.data) {
          await offlineDB.saveData('clients', clientsResponse.data);
        }
      } catch (error) {
        console.warn('Failed to preload clients:', error);
      }

      // Preload companies
      try {
        const companiesResponse = await apiService.getCompanies();
        if (companiesResponse.success && companiesResponse.data) {
          await offlineDB.saveData('companies', companiesResponse.data);
        }
      } catch (error) {
        console.warn('Failed to preload companies:', error);
      }

      // Preload visits
      try {
        const visitsResponse = await apiService.getVisits();
        if (visitsResponse.success && visitsResponse.data) {
          await offlineDB.saveData('visits', visitsResponse.data);
        }
      } catch (error) {
        console.warn('Failed to preload visits:', error);
      }

      // Update last sync time
      await offlineDB.setLastSyncTime();

      console.log('Data preload completed');
    } catch (error) {
      console.error('Error preloading data:', error);
    } finally {
      setIsPreloading(false);
    }
  };

  // Initial preload when going online and user is authenticated
  useEffect(() => {
    if (isOnline && user) {
      prefetchData();
    }
  }, [isOnline, user]);

  // Schedule periodic refresh while online
  useEffect(() => {
    if (!isOnline || !user) return;

    const interval = setInterval(() => {
      prefetchData();
    }, PRELOAD_INTERVAL);

    return () => clearInterval(interval);
  }, [isOnline, user]);

  return { isPreloading };
}
