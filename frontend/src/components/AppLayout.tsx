import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { OfflineIndicator } from './OfflineIndicator';
import '../styles/AppLayout.css';

export const AppLayout: React.FC = () => {
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
