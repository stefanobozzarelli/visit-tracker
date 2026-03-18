import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { apiService } from '../services/api';
import axios from 'axios';
import { config } from '../config';
import '../styles/Settings.css';

const API_BASE_URL = config.API_BASE_URL;

// ─── Types ────────────────────────────────────────────
interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  company_id?: string;
  created_at: string;
}

interface ClientItem {
  id: string;
  name: string;
}

interface CompanyItem {
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
}

interface FormData {
  name: string;
  email: string;
  password: string;
  role: string;
  company_id?: string;
}

type Tab = 'users' | 'permissions' | 'assign';

// ─── Component ────────────────────────────────────────
export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<Tab>('users');

  // Redirect non-admin
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'manager') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  if (!isOnline) {
    return (
      <div className="settings-page">
        <h1>Settings</h1>
        <p className="settings-offline-msg">
          Settings are not available offline. Please connect to the internet.
        </p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="settings-tabs">
        <button
          className={`settings-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          className={`settings-tab ${activeTab === 'permissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('permissions')}
        >
          Permissions
        </button>
        <button
          className={`settings-tab ${activeTab === 'assign' ? 'active' : ''}`}
          onClick={() => setActiveTab('assign')}
        >
          Assign Permissions
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'permissions' && <PermissionsTab />}
        {activeTab === 'assign' && <AssignTab />}
      </div>
    </div>
  );
};

// ─── Users Tab ────────────────────────────────────────
const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchText, setSearchText] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '', email: '', password: '', role: 'sales_rep', company_id: '',
  });

  useEffect(() => { loadUsers(); }, []);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 5000); return () => clearTimeout(t); }
  }, [success]);
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(''), 5000); return () => clearTimeout(t); }
  }, [error]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await apiService.getUsers();
      if (response.success) setUsers(response.data || []);
      else setError(response.error || 'Failed to load users');
    } catch (err) {
      setError('Error loading users');
    } finally {
      setLoading(false);
    }
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!formData.name || !formData.email || !formData.password) {
      setError('Name, email, and password are required'); return;
    }
    try {
      const response = await apiService.createUser(formData.email, formData.name, formData.password, formData.role, formData.company_id || undefined);
      if (response.success) {
        setSuccess('User created successfully');
        setFormData({ name: '', email: '', password: '', role: 'sales_rep', company_id: '' });
        await loadUsers();
      } else setError(response.error || 'Failed to create user');
    } catch (err) { setError((err as Error).message || 'Error creating user'); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;
    setError(''); setSuccess('');
    if (!formData.name) { setError('Name is required'); return; }
    try {
      const response = await apiService.updateUser(editingUserId, { name: formData.name });
      if (!response.success) { setError(response.error || 'Failed to update user'); return; }
      setSuccess('User updated successfully');
      resetForm();
      await loadUsers();
    } catch (err) { setError((err as Error).message || 'Error updating user'); }
  };

  const handleEdit = (u: UserItem) => {
    setEditingUserId(u.id);
    setFormData({ name: u.name, email: u.email, password: '', role: u.role, company_id: u.company_id || '' });
    setError(''); setSuccess('');
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setError(''); setSuccess('');
    try {
      const response = await apiService.deleteUser(deleteConfirm.userId);
      if (response.success) {
        setSuccess('User deleted successfully');
        setDeleteConfirm(null);
        await loadUsers();
      } else setError(response.error || 'Failed to delete user');
    } catch (err) { setError((err as Error).message || 'Error deleting user'); }
  };

  const resetForm = () => {
    setEditingUserId(null);
    setFormData({ name: '', email: '', password: '', role: 'sales_rep', company_id: '' });
    setError(''); setSuccess('');
  };

  const filteredUsers = users
    .filter(u => u.email.toLowerCase().includes(searchText.toLowerCase()) || u.name.toLowerCase().includes(searchText.toLowerCase()))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="settings-split">
        <div className="settings-form-panel">
          <h3>{editingUserId ? 'Edit User' : 'Create New User'}</h3>
          <form onSubmit={editingUserId ? handleUpdate : handleCreate}>
            {editingUserId ? (
              <>
                <div className="form-group"><label>Email</label><input type="email" value={formData.email} disabled /></div>
                <div className="form-group"><label>Role</label><input type="text" value={formData.role} disabled /></div>
                <div className="form-group"><label>Name</label><input type="text" name="name" value={formData.name} onChange={handleFormChange} placeholder="Full name" /></div>
              </>
            ) : (
              <>
                <div className="form-group"><label>Email</label><input type="email" name="email" value={formData.email} onChange={handleFormChange} placeholder="user@example.com" /></div>
                <div className="form-group"><label>Name</label><input type="text" name="name" value={formData.name} onChange={handleFormChange} placeholder="Full name" /></div>
                <div className="form-group"><label>Password</label><input type="password" name="password" value={formData.password} onChange={handleFormChange} placeholder="Min 8 characters" /></div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" value={formData.role} onChange={handleFormChange}>
                    <option value="sales_rep">Sales Rep</option>
                    <option value="backoffice">Backoffice</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </>
            )}
            <div className="settings-form-actions">
              <button type="submit" className="btn btn-primary">{editingUserId ? 'Save Changes' : 'Create User'}</button>
              {editingUserId && <button type="button" className="btn btn-secondary" onClick={resetForm}>Cancel</button>}
            </div>
          </form>
        </div>

        <div className="settings-table-panel">
          <div className="settings-table-controls">
            <input type="text" placeholder="Search by email or name..." value={searchText} onChange={e => setSearchText(e.target.value)} className="settings-search" />
            {editingUserId && <button className="btn btn-primary btn-small" onClick={resetForm}>+ New User</button>}
          </div>

          {loading ? <p className="settings-loading">Loading users...</p> : filteredUsers.length === 0 ? <p className="settings-empty">No users found</p> : (
            <table className="settings-table">
              <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                    <td className="settings-actions">
                      <button className="btn btn-small btn-warning" onClick={() => handleEdit(u)}>Edit</button>
                      <button className="btn btn-small btn-danger" onClick={() => setDeleteConfirm({ userId: u.id, email: u.email })}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="modal-overlay">
          <div className="modal">
            <h2>Confirm Deletion</h2>
            <p>Are you sure you want to delete <strong>{deleteConfirm.email}</strong>? This will also delete all associated data.</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleDelete}>Delete User</button>
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Permissions Tab ──────────────────────────────────
const PermissionsTab: React.FC = () => {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [searchClient, setSearchClient] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [editingPermission, setEditingPermission] = useState<Permission | null>(null);
  const [editCanView, setEditCanView] = useState(true);
  const [editCanCreate, setEditCanCreate] = useState(false);
  const [editCanEdit, setEditCanEdit] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 5000); return () => clearTimeout(t); }
  }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const [permsRes, usersRes, clientsRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/permissions`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/clients`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setPermissions(permsRes.data.data);
      setUsers(usersRes.data.data);
      setClients(clientsRes.data.data);
      setCompanies(companiesRes.data.data);
    } catch (err) {
      setError('Error loading permissions');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!window.confirm('Are you sure you want to revoke this permission?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/admin/permissions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      setSuccess('Permission revoked');
      loadData();
    } catch (err) { setError('Error revoking permission'); }
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
      await axios.put(`${API_BASE_URL}/admin/permissions/${editingPermission.id}`, {
        can_view: editCanView, can_create: editCanCreate, can_edit: editCanEdit,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSuccess('Permission updated');
      setEditingPermission(null);
      loadData();
    } catch (err) { setError('Error updating permission'); }
  };

  const getUserName = (id: string) => users.find(u => u.id === id)?.name || id;
  const getClientName = (id: string) => clients.find(c => c.id === id)?.name || id;
  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || id;

  const sorted = [...permissions]
    .filter(p => !searchClient || getClientName(p.client_id).toLowerCase().includes(searchClient.toLowerCase()))
    .sort((a, b) => getUserName(a.user_id).localeCompare(getUserName(b.user_id)));

  if (loading) return <p className="settings-loading">Loading permissions...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {permissions.length > 0 && (
        <input type="text" placeholder="Search by client name..." value={searchClient} onChange={e => setSearchClient(e.target.value)} className="settings-search" style={{ marginBottom: '1rem' }} />
      )}

      {permissions.length === 0 ? <p className="settings-empty">No permissions assigned</p> : (
        <table className="settings-table">
          <thead><tr><th>User</th><th>Client</th><th>Company</th><th>View</th><th>Create</th><th>Edit</th><th>Actions</th></tr></thead>
          <tbody>
            {sorted.map(p => (
              <tr key={p.id}>
                <td>{getUserName(p.user_id)}</td>
                <td>{getClientName(p.client_id)}</td>
                <td>{getCompanyName(p.company_id)}</td>
                <td>{p.can_view ? '✓' : '-'}</td>
                <td>{p.can_create ? '✓' : '-'}</td>
                <td>{p.can_edit ? '✓' : '-'}</td>
                <td className="settings-actions">
                  <button className="btn btn-small btn-warning" onClick={() => handleEditPermission(p)}>Edit</button>
                  <button className="btn btn-small btn-danger" onClick={() => handleRevoke(p.id)}>Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editingPermission && (
        <div className="modal-overlay" onClick={() => setEditingPermission(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Edit Permission</h2>
            <p><strong>User:</strong> {getUserName(editingPermission.user_id)}</p>
            <p><strong>Client:</strong> {getClientName(editingPermission.client_id)}</p>
            <p><strong>Company:</strong> {getCompanyName(editingPermission.company_id)}</p>
            <div className="settings-checkboxes">
              <label><input type="checkbox" checked={editCanView} onChange={e => setEditCanView(e.target.checked)} /> View</label>
              <label><input type="checkbox" checked={editCanCreate} onChange={e => setEditCanCreate(e.target.checked)} /> Create visits</label>
              <label><input type="checkbox" checked={editCanEdit} onChange={e => setEditCanEdit(e.target.checked)} /> Modify reports</label>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleSavePermission}>Save Changes</button>
              <button className="btn btn-secondary" onClick={() => setEditingPermission(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Assign Tab ───────────────────────────────────────
const AssignTab: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [canView, setCanView] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 5000); return () => clearTimeout(t); }
  }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const [usersRes, clientsRes, companiesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/clients`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setUsers(usersRes.data.data);
      setClients(clientsRes.data.data);
      setCompanies(companiesRes.data.data);
    } catch (err) { setError('Error loading data'); } finally { setLoading(false); }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!selectedUser || !selectedClient || selectedCompanies.length === 0) {
      setError('Select user, client and at least one company'); return;
    }
    try {
      const token = localStorage.getItem('token');
      const promises = selectedCompanies.map(companyId =>
        axios.post(`${API_BASE_URL}/admin/permissions`, {
          userId: selectedUser, clientId: selectedClient, companyId, can_view: canView, can_create: canCreate, can_edit: canEdit,
        }, { headers: { Authorization: `Bearer ${token}` } })
      );
      await Promise.all(promises);
      setSuccess(`Permissions assigned for ${selectedCompanies.length} company(ies)`);
      resetForm();
    } catch (err) { setError('Error assigning permissions'); }
  };

  const resetForm = () => {
    setSelectedUser(''); setSelectedClient(''); setSelectedCompanies([]);
    setCanView(true); setCanCreate(false); setCanEdit(false);
  };

  if (loading) return <p className="settings-loading">Loading...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleAssign} className="settings-assign-form">
        <div className="form-group">
          <label>User (Sales Rep)</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} required>
            <option value="">Select user...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Client</label>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} required>
            <option value="">Select client...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="form-group">
          <label>Companies</label>
          <div className="settings-companies-list">
            <label className="settings-select-all">
              <input type="checkbox" checked={selectedCompanies.length === companies.length && companies.length > 0}
                onChange={e => setSelectedCompanies(e.target.checked ? companies.map(c => c.id) : [])} />
              <strong>Select all</strong>
            </label>
            {companies.map(c => (
              <label key={c.id}>
                <input type="checkbox" checked={selectedCompanies.includes(c.id)}
                  onChange={e => setSelectedCompanies(e.target.checked ? [...selectedCompanies, c.id] : selectedCompanies.filter(id => id !== c.id))} />
                {c.name}
              </label>
            ))}
          </div>
        </div>

        <div className="settings-checkboxes">
          <label><input type="checkbox" checked={canView} onChange={e => setCanView(e.target.checked)} /> View</label>
          <label><input type="checkbox" checked={canCreate} onChange={e => setCanCreate(e.target.checked)} /> Create visits</label>
          <label><input type="checkbox" checked={canEdit} onChange={e => setCanEdit(e.target.checked)} /> Modify reports</label>
        </div>

        <button type="submit" className="btn btn-primary">Assign Permission</button>
      </form>
    </>
  );
};

export default Settings;
