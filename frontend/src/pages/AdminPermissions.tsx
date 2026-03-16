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

export const AdminPermissions = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const [selectedUser, setSelectedUser] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [canView, setCanView] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

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

      // Load users
      const usersRes = await axios.get(`${API_BASE_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(usersRes.data.data);

      // Load clients
      const clientsRes = await axios.get(`${API_BASE_URL}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(clientsRes.data.data);

      // Load companies
      const companiesRes = await axios.get(`${API_BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanies(companiesRes.data.data);

      // Load permissions
      const permsRes = await axios.get(`${API_BASE_URL}/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPermissions(permsRes.data.data);
    } catch (err) {
      setError('Error loading data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedUser || !selectedClient || selectedCompanies.length === 0) {
      setError('Select user, client and at least one company');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Create a permission for each selected company
      const promises = selectedCompanies.map((companyId) =>
        axios.post(
          `${API_BASE_URL}/admin/permissions`,
          {
            userId: selectedUser,
            clientId: selectedClient,
            companyId: companyId,
            can_view: canView,
            can_create: canCreate,
            can_edit: canEdit,
          },
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        )
      );

      await Promise.all(promises);

      setSuccess(`Permissions assigned successfully for ${selectedCompanies.length} company(ies)`);
      resetForm();
      loadData();
    } catch (err) {
      setError('Error assigning permissions');
      console.error(err);
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

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? All associated visits will also be deleted.`)) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess('User deleted successfully');
      loadData();
    } catch (err) {
      setError('Error deleting user');
      console.error(err);
    }
  };

  const resetForm = () => {
    setSelectedUser('');
    setSelectedClient('');
    setSelectedCompanies([]);
    setCanView(true);
    setCanCreate(false);
    setCanEdit(false);
  };

  if (loading) {
    return <div className="admin-permissions"><p>Loading...</p></div>;
  }

  return (
    <div className="admin-permissions">
      <div className="header">
        <h1>User Permissions Management</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/visits')}>
          ← Back
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="permissions-container">
        <div className="form-section">
          <h2>Assign Permission</h2>
          <form onSubmit={handleAssignPermission}>
            <div className="form-group">
              <label>Utente (Sales Rep)</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                required
              >
                <option value="">Select user...</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Cliente</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                required
              >
                <option value="">Select client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Aziende</label>
              <div className="companies-checkboxes">
                <label>
                  <input
                    type="checkbox"
                    checked={selectedCompanies.length === companies.length && companies.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedCompanies(companies.map((c) => c.id));
                      } else {
                        setSelectedCompanies([]);
                      }
                    }}
                  />
                  <strong>Seleziona tutte</strong>
                </label>
                <div style={{ marginTop: '0.5rem' }}>
                  {companies.map((company) => (
                    <label key={company.id}>
                      <input
                        type="checkbox"
                        checked={selectedCompanies.includes(company.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedCompanies([...selectedCompanies, company.id]);
                          } else {
                            setSelectedCompanies(selectedCompanies.filter((id) => id !== company.id));
                          }
                        }}
                      />
                      {company.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="permissions-checkboxes">
              <label>
                <input
                  type="checkbox"
                  checked={canView}
                  onChange={(e) => setCanView(e.target.checked)}
                />
                Visualizzare
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={canCreate}
                  onChange={(e) => setCanCreate(e.target.checked)}
                />
                Creare visite
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={canEdit}
                  onChange={(e) => setCanEdit(e.target.checked)}
                />
                Modificare report
              </label>
            </div>

            <button type="submit" className="btn btn-primary">
              Assign Permission
            </button>
          </form>
        </div>

        <div className="table-section">
          <h2>Assigned Permissions</h2>
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
      </div>

      <div className="users-section">
        <h2>User Management</h2>
        {users.length === 0 ? (
          <p>No users registered</p>
        ) : (
          <table className="permissions-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role || 'sales_rep'}</td>
                  <td>
                    <button
                      className="btn btn-small btn-danger"
                      onClick={() => handleDeleteUser(user.id, user.name)}
                    >
                      Delete
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
                <strong>User:</strong> {editingPermission.user?.name || editingPermission.user_id}
              </p>
              <p>
                <strong>Client:</strong> {editingPermission.client?.name || editingPermission.client_id}
              </p>
              <p>
                <strong>Company:</strong> {editingPermission.company?.name || editingPermission.company_id}
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

export default AdminPermissions;
