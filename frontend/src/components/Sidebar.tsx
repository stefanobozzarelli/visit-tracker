import React, { useState, useEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import '../styles/Sidebar.css';

const DEFAULT_MENU_ORDER = [
  'dashboard',
  'contacts',
  'visits',
  'companies',
  'company-visits',
  'tasks',
  'projects',
  'claims',
  'reports',
];

type MenuItemKey = typeof DEFAULT_MENU_ORDER[number];

const MENU_ITEMS: Record<MenuItemKey, { path: string; label: string; icon: string }> = {
  dashboard: { path: '/dashboard', label: 'Dashboard', icon: '◊' },
  visits: { path: '/visits', label: 'Client Meetings', icon: '📅' },
  'company-visits': { path: '/company-visits', label: 'Supplier Meetings', icon: '🏢' },
  companies: { path: '/companies', label: 'Suppliers', icon: '🏠' },
  contacts: { path: '/contacts', label: 'Clients', icon: '👥' },
  projects: { path: '/projects', label: 'Projects', icon: '📁' },
  tasks: { path: '/tasks', label: 'Tasks', icon: '✓' },
  claims: { path: '/claims', label: 'Claims', icon: '⚠' },
  reports: { path: '/reports', label: 'Reports', icon: '📄' },
};

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar-collapsed') === 'true';
  });
  const [menuOrder, setMenuOrder] = useState<MenuItemKey[]>(DEFAULT_MENU_ORDER);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(collapsed));
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '64px' : '260px'
    );
  }, [collapsed]);

  // Load sidebar menu order on mount
  useEffect(() => {
    const loadMenuOrder = async () => {
      try {
        const result = await apiService.getSidebarMenuOrder();
        if (result.success && result.data && Array.isArray(result.data)) {
          setMenuOrder(result.data as MenuItemKey[]);
        }
      } catch {
        // Use default order on error
        setMenuOrder(DEFAULT_MENU_ORDER);
      }
    };
    loadMenuOrder();
  }, []);

  const handleDragStart = (e: React.DragEvent, itemKey: string) => {
    setDraggedItem(itemKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, dropItemKey: string) => {
    e.preventDefault();
    if (!draggedItem || draggedItem === dropItemKey) {
      setDraggedItem(null);
      return;
    }

    const draggedIndex = menuOrder.indexOf(draggedItem as MenuItemKey);
    const dropIndex = menuOrder.indexOf(dropItemKey as MenuItemKey);

    if (draggedIndex === -1 || dropIndex === -1) {
      setDraggedItem(null);
      return;
    }

    const newOrder = [...menuOrder];
    const [item] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, item);
    setMenuOrder(newOrder);
    setDraggedItem(null);

    // Save to backend
    try {
      await apiService.saveSidebarMenuOrder(newOrder);
    } catch (error) {
      console.error('Failed to save menu order:', error);
    }
  };

  if (!user) return null;

  const isMasterAdmin = user.role === 'master_admin';
  const isAdmin = user.role === 'admin' || isMasterAdmin;
  const isManager = user.role === 'manager' || isMasterAdmin;
  const canViewRevenue = isMasterAdmin || (user.role === 'admin' && !!user.can_view_revenue);

  const closeSidebar = () => setOpen(false);
  const toggleCollapse = () => setCollapsed(!collapsed);

  const initials = user.name
    ? user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      {/* Mobile hamburger */}
      <button className="sidebar-toggle" onClick={() => setOpen(!open)} aria-label="Toggle menu">
        {open ? '✕' : '☰'}
      </button>

      {/* Overlay for mobile */}
      <div
        className={`sidebar-overlay ${open ? 'visible' : ''}`}
        onClick={closeSidebar}
      />

      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        {/* Logo */}
        <div className="sidebar-header">
          <Link to="/dashboard" className="sidebar-logo" onClick={closeSidebar}>
            <div className="sidebar-logo-icon">TF</div>
            {!collapsed && <span className="sidebar-logo-text">TradeFlow</span>}
          </Link>
          <button className="sidebar-collapse-btn" onClick={toggleCollapse} title={collapsed ? 'Espandi' : 'Nascondi'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed
                ? <><polyline points="9 18 15 12 9 6" /></>
                : <><polyline points="15 18 9 12 15 6" /></>
              }
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-label">Main</div>
            {menuOrder.map((itemKey) => {
              const item = MENU_ITEMS[itemKey];
              if (!item) return null;
              return (
                <div
                  key={itemKey}
                  draggable
                  onDragStart={(e) => handleDragStart(e, itemKey)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, itemKey)}
                  className={`sidebar-link-wrapper ${draggedItem === itemKey ? 'dragging' : ''}`}
                >
                  <NavLink
                    to={item.path}
                    className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                    onClick={closeSidebar}
                  >
                    <span className="sidebar-link-drag-handle">⋮⋮</span>
                    <span className="sidebar-link-icon">
                      {itemKey === 'dashboard' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>}
                      {itemKey === 'visits' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>}
                      {itemKey === 'company-visits' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9h1"/><path d="M9 13h1"/><path d="M9 17h1"/></svg>}
                      {itemKey === 'companies' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>}
                      {itemKey === 'contacts' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                      {itemKey === 'projects' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>}
                      {itemKey === 'tasks' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
                      {itemKey === 'claims' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
                      {itemKey === 'reports' && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
                    </span>
                    {item.label}
                  </NavLink>
                </div>
              );
            })}
          </div>

          {(isAdmin || isManager) && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section">
                <div className="sidebar-section-label">Admin</div>
                {canViewRevenue && (
                <NavLink
                  to="/amministrazione"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={closeSidebar}
                >
                  <span className="sidebar-link-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
                  Amministrazione
                </NavLink>
                )}
                <NavLink
                  to="/settings"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={closeSidebar}
                >
                  <span className="sidebar-link-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
                  Users Settings
                </NavLink>
              </div>
            </>
          )}
        </nav>

        {/* Footer with user info */}
        <div className="sidebar-footer">
          <NavLink to="/profile" className="sidebar-user" onClick={closeSidebar}>
            <div className="sidebar-avatar">{initials}</div>
            {!collapsed && (
              <div>
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-role">{user.role}</div>
              </div>
            )}
          </NavLink>
          {!collapsed && (
            <button className="sidebar-logout" onClick={logout} title="Logout">
              ↪
            </button>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
