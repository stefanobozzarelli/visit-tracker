import React, { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Sidebar.css';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const isManager = user.role === 'manager';

  const closeSidebar = () => setOpen(false);

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

      <aside className={`sidebar ${open ? 'open' : ''}`}>
        {/* Logo */}
        <Link to="/dashboard" className="sidebar-logo" onClick={closeSidebar}>
          <div className="sidebar-logo-icon">VT</div>
          <span className="sidebar-logo-text">Visit Tracker</span>
        </Link>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="sidebar-section">
            <div className="sidebar-section-label">Main</div>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-link-icon">📊</span>
              Dashboard
            </NavLink>
            <NavLink
              to="/visits"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-link-icon">📅</span>
              Visits
            </NavLink>
            <NavLink
              to="/companies"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-link-icon">🏢</span>
              Companies
            </NavLink>
            <NavLink
              to="/contacts"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-link-icon">👥</span>
              Clients
            </NavLink>
            <NavLink
              to="/tasks"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-link-icon">✅</span>
              Tasks
            </NavLink>
            <NavLink
              to="/reports"
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              onClick={closeSidebar}
            >
              <span className="sidebar-link-icon">📄</span>
              Reports
            </NavLink>
          </div>

          {(isAdmin || isManager) && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section">
                <div className="sidebar-section-label">Admin</div>
                <NavLink
                  to="/settings"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={closeSidebar}
                >
                  <span className="sidebar-link-icon">⚙️</span>
                  Settings
                </NavLink>
              </div>
            </>
          )}
        </nav>

        {/* Footer with user info */}
        <div className="sidebar-footer">
          <NavLink to="/profile" className="sidebar-user" onClick={closeSidebar}>
            <div className="sidebar-avatar">{initials}</div>
            <div>
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
          </NavLink>
          <button className="sidebar-logout" onClick={logout} title="Logout">
            ↪
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
