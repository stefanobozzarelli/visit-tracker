import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/AdminPermissions.css';

import { config } from '../config';
const API_BASE_URL = config.API_BASE_URL;

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface Client {
  id: string;
  name: string;
}

interface Company {
  id: string;
  name: string;
}

interface Permission {
  id: string;
  user_id: string;
  client_id: string;
  company_id: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  user?: User;
  client?: Client;
  company?: Company;
}

export const ViewPermissions = () => {
  const navigate = useNavigate();
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [editCanView, setEditCanView] = useState(true);
  const [editCanCreate, setEditCanCreate] = useState(false);
  const [editCanEdit, setEditCanEdit] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [permsRes, usersRes, clientsRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/clients`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        axios.get(`${API_BASE_URL}/companies`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      setPermissions(permsRes.data.data);
      setUsers(usersRes.data.data);
      setClients(clientsRes.data.data);
      setCompanies(companiesRes.data.data);
    } catch (err) {
      setError('Errore nel caricamento dei dati');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    if (!window.confirm('Sei sicuro di voler revocare questo permesso?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/admin/permissions/${permissionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess('Permesso revocato');
      loadData();
    } catch (err) {
      setError('Errore nella revoca del permesso');
      console.error(err);
    }
  };

  const handleEditPermission = (perm: Permission) => {
    setEditingPermission(perm);
    setEditCanView(perm.can_view);
    setEditCanCreate(perm.can_create);
    setEditCanEdit(perm.can_edit);
  };

  const handleSavePermission = async () => {
    if (!editingPermission) return;

    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API_BASE_URL}/admin/permissions/${editingPermission.id}`,
        {
          can_view: editCanView,
          can_create: editCanCreate,
          can_edit: editCanEdit,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setSuccess('Permesso aggiornato con successo');
      setEditingPermission(null);
      loadData();
    } catch (err) {
      setError('Errore nell\'aggiornamento del permesso');
      console.error(err);
    }
  };

  if (loading) {
    return <div className="admin-permissions"><p>Caricamento...</p></div>;
  }

  return (
    <div className="admin-permissions">
      <div className="header">
        <h1>Permessi Assegnati</h1>
        <div>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/permissions/assign')}>
            ← Assegna Permessi
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/visits')} style={{ marginLeft: '10px' }}>
            ← Indietro
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="table-section">
        {permissions.length === 0 ? (
          <p>Nessun permesso assegnato</p>
        ) : (
          <table className="permissions-table">
            <thead>
              <tr>
                <th>Utente</th>
                <th>Cliente</th>
                <th>Azienda</th>
                <th>Visualizza</th>
                <th>Crea</th>
                <th>Modifica</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((perm) => (
                <tr key={perm.id}>
                  <td>{perm.user?.name || perm.user_id}</td>
                  <td>{perm.client?.name || perm.client_id}</td>
                  <td>{perm.company?.name || perm.company_id}</td>
                  <td>{perm.can_view ? '✓' : '-'}</td>
                  <td>{perm.can_create ? '✓' : '-'}</td>
                  <td>{perm.can_edit ? '✓' : '-'}</td>
                  <td>
                    <button
                      className="btn btn-small btn-warning"
                      onClick={() => handleEditPermission(perm)}
                    >
                      Modifica
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleRevokePermission(perm.id)}
                    >
                      Revoca
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editingPermission && (
        <div className="modal-overlay" onClick={() => setEditingPermission(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Modifica Permesso</h2>
            <div className="modal-body">
              <p>
                <strong>Utente:</strong> {editingPermission.user?.name || editingPermission.user_id}
              </p>
              <p>
                <strong>Cliente:</strong> {editingPermission.client?.name || editingPermission.client_id}
              </p>
              <p>
                <strong>Azienda:</strong> {editingPermission.company?.name || editingPermission.company_id}
              </p>

              <div className="permissions-checkboxes">
                <label>
                  <input
                    type="checkbox"
                    checked={editCanView}
                    onChange={(e) => setEditCanView(e.target.checked)}
                  />
                  Visualizzare
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editCanCreate}
                    onChange={(e) => setEditCanCreate(e.target.checked)}
                  />
                  Creare visite
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editCanEdit}
                    onChange={(e) => setEditCanEdit(e.target.checked)}
                  />
                  Modificare report
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setEditingPermission(null)}
                className="btn btn-secondary"
              >
                Annulla
              </button>
              <button
                onClick={handleSavePermission}
                className="btn btn-primary"
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewPermissions;
