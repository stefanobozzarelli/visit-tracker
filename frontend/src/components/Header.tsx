import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/Header.css';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="header">
      <div className="header-container">
        <Link to="/" className="logo">
          <h1>Visit Tracker</h1>
        </Link>
        {user && (
          <nav className="nav">
            <Link to="/dashboard">Dashboard</Link>
            <Link to="/clients">Clienti</Link>
            <Link to="/companies">Aziende</Link>
            <Link to="/visits">Visite</Link>
            <Link to="/my-todos">📋 I Miei TODO</Link>
            <Link to="/export-pdf">📊 Esporta PDF</Link>
            {user.role === 'admin' && (
              <>
                <Link to="/admin/todos" className="admin-link">
                  📋 Tutti i TODO
                </Link>
                <Link to="/admin/permissions/view" className="admin-link">
                  ⚙️ Gestione Permessi
                </Link>
                <Link to="/admin/users" className="admin-link">
                  👥 Gestione Utenti
                </Link>
              </>
            )}
            <div className="user-info">
              <span>Welcome, {user.name}</span>
              <button onClick={logout} className="logout-btn">
                Logout
              </button>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};
