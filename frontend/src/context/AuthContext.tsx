import React, { createContext, useState, useEffect } from 'react';
import { User, AuthContextType } from '../types';
import { apiService } from '../services/api';
import {
  validateJWTToken,
  validateOfflineCredentials,
  hashPassword,
  saveOfflineCredentials,
  clearOfflineCredentials,
  getOfflineUser,
  getOfflineToken,
} from '../services/offlineAuth';

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authMode, setAuthMode] = useState<'online' | 'offline'>('online');

  useEffect(() => {
    // Load token and user from localStorage with offline validation
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      // Validate JWT token (check format and expiration)
      if (validateJWTToken(savedToken)) {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
        setAuthMode('online');
      } else {
        // Token is expired or invalid, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }

    setIsInitializing(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.login(email, password);
      if (response.success && response.data) {
        const { user: userData, token: newToken } = response.data;
        setUser(userData);
        setToken(newToken);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setAuthMode('online');

        // Save credentials for offline access (including token)
        try {
          const passwordHash = await hashPassword(password);
          await saveOfflineCredentials(email, passwordHash, newToken, {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            role: userData.role,
          });
        } catch (error) {
          console.warn('Failed to save offline credentials:', error);
        }
      }
    } catch (err) {
      // If online login fails, try offline authentication with cached credentials
      console.log('Online login failed, attempting offline authentication...');
      try {
        const offlineUser = await validateOfflineCredentials(email, password);
        if (offlineUser) {
          console.log('Offline authentication successful');
          setUser(offlineUser as User);
          // Use the saved JWT token from previous online login
          const savedToken = getOfflineToken();
          if (savedToken) {
            setToken(savedToken);
          } else {
            // Fallback: create a placeholder token if no saved token exists
            setToken('offline-temp-token');
          }
          setAuthMode('offline');
          // Don't clear error, show that we're in offline mode
          setError('Working offline - changes will sync when you go online');
          return;
        }
      } catch (offlineErr) {
        console.error('Offline authentication also failed:', offlineErr);
      }

      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, name: string, password: string, role: string = 'sales_rep') => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiService.register(email, name, password, role);
      if (response.success && response.data) {
        const { user: userData, token: newToken } = response.data;
        setUser(userData);
        setToken(newToken);
        localStorage.setItem('token', newToken);
        localStorage.setItem('user', JSON.stringify(userData));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setAuthMode('online');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // NOTE: DO NOT clear offline credentials - they need to persist for offline login after logout
    // clearOfflineCredentials();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        isLoading,
        error,
        isInitializing,
        authMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
