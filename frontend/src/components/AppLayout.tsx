import React from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sidebar } from './Sidebar';
import { OfflineIndicator } from './OfflineIndicator';
import '../styles/AppLayout.css';

export const AppLayout: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  // Accounts made from the Ferie module only see that section (and their profile)
  if (user?.leave_only && !location.pathname.startsWith('/ferie') && !location.pathname.startsWith('/profile')) {
    return <Navigate to="/ferie" replace />;
  }
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-layout-main">
        <OfflineIndicator />
        <div className="app-layout-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
