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

  const [searchClient, setSearchClient] = useState('');

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
      setError('Error loading data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokePermission = async (permissionId: string) => {
    if (!window.confirm('Are you sure you want to revoke this permission?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/admin/permissions/${permissionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess('Permission revoked');
      loadData();
    } catch (err) {
      setError('Error revoking permission');
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

      setSuccess('Permission updated successfully');
      setEditingPermission(null);
      loadData();
    } catch (err) {
      setError('Error updating permission');
      console.error(err);
    }
  };

  const getUserName = (userId: string) => users.find((u) => u.id === userId)?.name || userId;
  const getClientName = (clientId: string) => clients.find((c) => c.id === clientId)?.name || clientId;
  const getCompanyName = (companyId: string) => companies.find((c) => c.id === companyId)?.name || companyId;

  const getSortedPermissions = () => {
    let filtered = [...permissions];

    if (searchClient) {
      filtered = filtered.filter((perm) =>
        getClientName(perm.client_id).toLowerCase().includes(searchClient.toLowerCase())
      );
    }

    return filtered.sort((a, b) => {
      const userNameA = getUserName(a.user_id).toLowerCase();
      const userNameB = getUserName(b.user_id).toLowerCase();
      if (userNameA !== userNameB) return userNameA.localeCompare(userNameB);

      const clientNameA = getClientName(a.client_id).toLowerCase();
      const clientNameB = getClientName(b.client_id).toLowerCase();
      if (clientNameA !== clientNameB) return clientNameA.localeCompare(clientNameB);

      const companyNameA = getCompanyName(a.company_id).toLowerCase();
      const companyNameB = getCompanyName(b.company_id).toLowerCase();
      return companyNameA.localeCompare(companyNameB);
    });
  };

  if (loading) {
    return <div className="admin-permissions"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-permissions">
      <div className="header">
        <h1>Assigned Permissions</h1>
        <div>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/permissions/assign')}>
            ← Assign Permissions
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/visits')} style={{ marginLeft: '10px' }}>
            ← Back
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {permissions.length > 0 && (
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <label>Search Client</label>
          <input
            type="text"
            placeholder="Type client name..."
            value={searchClient}
            onChange={(e) => setSearchClient(e.target.value)}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              fontSize: '14px',
            }}
          />
        </div>
      )}

      <div className="table-section">
        {permissions.length === 0 ? (
          <p>No permissions assigned</p>
        ) : (
          <table className="permissions-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Client</th>
                <th>Company</th>
                <th>View</th>
                <th>Create</th>
                <th>Edit</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {getSortedPermissions().map((perm) => (
                <tr key={perm.id}>
                  <td>{getUserName(perm.user_id)}</td>
                  <td>{getClientName(perm.client_id)}</td>
                  <td>{getCompanyName(perm.company_id)}</td>
                  <td>{perm.can_view ? '✓' : '-'}</td>
                  <td>{perm.can_create ? '✓' : '-'}</td>
                  <td>{perm.can_edit ? '✓' : '-'}</td>
                  <td>
                    <button
                      className="btn btn-small btn-warning"
                      onClick={() => handleEditPermission(perm)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleRevokePermission(perm.id)}
                    >
                      Revoke
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
            <h2>Edit Permission</h2>
            <div className="modal-body">
              <p>
                <strong>User:</strong> {getUserName(editingPermission.user_id)}
              </p>
              <p>
                <strong>Client:</strong> {getClientName(editingPermission.client_id)}
              </p>
              <p>
                <strong>Company:</strong> {getCompanyName(editingPermission.company_id)}
              </p>

              <div className="permissions-checkboxes">
                <label>
                  <input
                    type="checkbox"
                    checked={editCanView}
                    onChange={(e) => setEditCanView(e.target.checked)}
                  />
                  View
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editCanCreate}
                    onChange={(e) => setEditCanCreate(e.target.checked)}
                  />
                  Create visits
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editCanEdit}
                    onChange={(e) => setEditCanEdit(e.target.checked)}
                  />
                  Modify reports
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button
                onClick={() => setEditingPermission(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePermission}
                className="btn btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ViewPermissions;
