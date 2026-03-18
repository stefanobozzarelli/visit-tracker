import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { apiService } from '../services/api';
import '../styles/Settings.css';

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
}

type Tab = 'users' | 'companies' | 'clients';

// ─── Component ────────────────────────────────────────
export const Settings: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isOnline } = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<Tab>('users');

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
          className={`settings-tab ${activeTab === 'companies' ? 'active' : ''}`}
          onClick={() => setActiveTab('companies')}
        >
          Company Access
        </button>
        <button
          className={`settings-tab ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          Client Permissions
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'companies' && <CompanyAccessTab />}
        {activeTab === 'clients' && <ClientPermissionsTab />}
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
  const [resetPasswordId, setResetPasswordId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [formData, setFormData] = useState<FormData>({
    name: '', email: '', password: '', role: 'sales_rep',
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
    } catch { setError('Error loading users'); } finally { setLoading(false); }
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
      const response = await apiService.createUser(formData.email, formData.name, formData.password, formData.role);
      if (response.success) {
        setSuccess('User created successfully');
        setFormData({ name: '', email: '', password: '', role: 'sales_rep' });
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
    setFormData({ name: u.name, email: u.email, password: '', role: u.role });
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

  const handleResetPassword = async () => {
    if (!resetPasswordId || !newPassword) return;
    setError(''); setSuccess('');
    try {
      const response = await apiService.changeUserPassword(resetPasswordId, newPassword);
      if (response.success) {
        setSuccess('Password reset successfully');
        setResetPasswordId(null);
        setNewPassword('');
      } else setError(response.error || 'Failed to reset password');
    } catch (err) { setError((err as Error).message || 'Error resetting password'); }
  };

  const resetForm = () => {
    setEditingUserId(null);
    setFormData({ name: '', email: '', password: '', role: 'sales_rep' });
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
                <div className="form-group">
                  <label>Temporary Password</label>
                  <input type="password" name="password" value={formData.password} onChange={handleFormChange} placeholder="Min 8 characters" />
                  <span className="form-hint">The user can change this after first login</span>
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" value={formData.role} onChange={handleFormChange}>
                    <option value="sales_rep">Sales Rep</option>
                    <option value="manager">Manager</option>
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

          {editingUserId && (
            <div className="reset-password-section">
              <h4>Reset Password</h4>
              <div className="form-group">
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New temporary password"
                />
              </div>
              <button
                className="btn btn-warning btn-small"
                onClick={() => { setResetPasswordId(editingUserId); handleResetPassword(); }}
                disabled={!newPassword}
              >
                Reset Password
              </button>
            </div>
          )}
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
                    <td><span className={`role-badge role-${u.role}`}>{u.role}</span></td>
                    <td className="settings-actions">
                      <button className="btn btn-small btn-info-outline" onClick={() => handleEdit(u)}>Edit</button>
                      <button className="btn btn-small btn-danger-outline" onClick={() => setDeleteConfirm({ userId: u.id, email: u.email })}>Delete</button>
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

// ─── Company Access Tab ──────────────────────────────
const CompanyAccessTab: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, companiesRes, clientsRes, permsRes] = await Promise.all([
        apiService.getUsers(),
        apiService.getCompanies(),
        apiService.getClients(),
        apiService.getPermissions(),
      ]);
      if (usersRes.success) setUsers((usersRes.data || []).filter((u: UserItem) => u.role === 'sales_rep'));
      if (companiesRes.success) setCompanies(companiesRes.data || []);
      if (clientsRes.success) setClients(clientsRes.data || []);
      if (permsRes.success) setPermissions(permsRes.data || []);
    } catch { setError('Error loading data'); } finally { setLoading(false); }
  };

  // Derive which companies the selected user has access to
  const userCompanyAccess = useMemo(() => {
    if (!selectedUserId) return new Set<string>();
    const userPerms = permissions.filter(p => p.user_id === selectedUserId);
    return new Set(userPerms.map(p => p.company_id));
  }, [selectedUserId, permissions]);

  // Count clients per company for selected user
  const companyClientCount = useMemo(() => {
    if (!selectedUserId) return new Map<string, number>();
    const counts = new Map<string, number>();
    const userPerms = permissions.filter(p => p.user_id === selectedUserId);
    for (const p of userPerms) {
      counts.set(p.company_id, (counts.get(p.company_id) || 0) + 1);
    }
    return counts;
  }, [selectedUserId, permissions]);

  const handleToggleCompany = async (companyId: string, currentlyOn: boolean) => {
    if (!selectedUserId) return;
    setSaving(true);
    setError('');

    try {
      if (currentlyOn) {
        // Remove: delete all permissions for user × company
        if (!window.confirm(`Remove access to this company? This will revoke all client permissions for this company.`)) {
          setSaving(false);
          return;
        }
        const toDelete = permissions.filter(p => p.user_id === selectedUserId && p.company_id === companyId);
        await Promise.all(toDelete.map(p => apiService.revokePermission(p.id)));
        setSuccess('Company access removed');
      } else {
        // Add: create permissions for all clients × this company
        await Promise.all(
          clients.map(client =>
            apiService.assignPermission(selectedUserId, client.id, companyId, {
              can_view: true, can_create: true, can_edit: true,
            })
          )
        );
        setSuccess(`Company access granted for ${clients.length} clients`);
      }
      // Reload permissions
      const permsRes = await apiService.getPermissions();
      if (permsRes.success) setPermissions(permsRes.data || []);
    } catch {
      setError('Error updating company access');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="settings-loading">Loading...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="ca-header">
        <div className="form-group">
          <label>Select User</label>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="ca-user-select"
          >
            <option value="">Choose a user...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedUserId ? (
        <p className="settings-empty">Select a user to manage their company access</p>
      ) : (
        <>
          <p className="ca-hint">
            Toggle which companies this user can represent. Enabling a company grants access across all existing clients.
          </p>
          <div className="ca-grid">
            {companies.map(company => {
              const hasAccess = userCompanyAccess.has(company.id);
              const clientCount = companyClientCount.get(company.id) || 0;
              return (
                <div key={company.id} className={`ca-card${hasAccess ? ' active' : ''}`}>
                  <div className="ca-card-info">
                    <div className="ca-card-name">{company.name}</div>
                    {hasAccess && (
                      <div className="ca-card-count">{clientCount} client{clientCount !== 1 ? 's' : ''}</div>
                    )}
                  </div>
                  <button
                    className={`ca-toggle${hasAccess ? ' on' : ''}`}
                    onClick={() => handleToggleCompany(company.id, hasAccess)}
                    disabled={saving}
                  >
                    <span className="ca-toggle-track">
                      <span className="ca-toggle-thumb" />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
};

// ─── Client Permissions Tab ──────────────────────────
const ClientPermissionsTab: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchClient, setSearchClient] = useState('');

  useEffect(() => { loadData(); }, []);
  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersRes, companiesRes, clientsRes, permsRes] = await Promise.all([
        apiService.getUsers(),
        apiService.getCompanies(),
        apiService.getClients(),
        apiService.getPermissions(),
      ]);
      if (usersRes.success) setUsers((usersRes.data || []).filter((u: UserItem) => u.role === 'sales_rep'));
      if (companiesRes.success) setCompanies(companiesRes.data || []);
      if (clientsRes.success) setClients(clientsRes.data || []);
      if (permsRes.success) setPermissions(permsRes.data || []);
    } catch { setError('Error loading data'); } finally { setLoading(false); }
  };

  // User's companies (derived from permissions)
  const userCompanies = useMemo(() => {
    if (!selectedUserId) return [];
    const companyIds = new Set(
      permissions.filter(p => p.user_id === selectedUserId).map(p => p.company_id)
    );
    return companies.filter(c => companyIds.has(c.id));
  }, [selectedUserId, permissions, companies]);

  // Permission lookup: `${clientId}-${companyId}` → Permission
  const permLookup = useMemo(() => {
    const map = new Map<string, Permission>();
    if (!selectedUserId) return map;
    for (const p of permissions) {
      if (p.user_id === selectedUserId) {
        map.set(`${p.client_id}-${p.company_id}`, p);
      }
    }
    return map;
  }, [selectedUserId, permissions]);

  // Filtered clients
  const filteredClients = useMemo(() => {
    let list = clients;
    if (searchClient.trim()) {
      const q = searchClient.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, searchClient]);

  const handleTogglePermission = async (clientId: string, companyId: string) => {
    if (!selectedUserId) return;
    setSaving(true);
    setError('');

    const key = `${clientId}-${companyId}`;
    const existing = permLookup.get(key);

    try {
      if (existing) {
        await apiService.revokePermission(existing.id);
      } else {
        await apiService.assignPermission(selectedUserId, clientId, companyId, {
          can_view: true, can_create: true, can_edit: true,
        });
      }
      const permsRes = await apiService.getPermissions();
      if (permsRes.success) setPermissions(permsRes.data || []);
    } catch {
      setError('Error updating permission');
    } finally {
      setSaving(false);
    }
  };

  const handleGrantAllForClient = async (clientId: string) => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const toCreate = userCompanies.filter(c => !permLookup.has(`${clientId}-${c.id}`));
      await Promise.all(
        toCreate.map(c =>
          apiService.assignPermission(selectedUserId, clientId, c.id, {
            can_view: true, can_create: true, can_edit: true,
          })
        )
      );
      const permsRes = await apiService.getPermissions();
      if (permsRes.success) setPermissions(permsRes.data || []);
      setSuccess(`Granted all companies for this client`);
    } catch { setError('Error'); } finally { setSaving(false); }
  };

  const handleRevokeAllForClient = async (clientId: string) => {
    if (!selectedUserId) return;
    if (!window.confirm('Revoke all company access for this client?')) return;
    setSaving(true);
    try {
      const toDelete = userCompanies
        .map(c => permLookup.get(`${clientId}-${c.id}`))
        .filter(Boolean) as Permission[];
      await Promise.all(toDelete.map(p => apiService.revokePermission(p.id)));
      const permsRes = await apiService.getPermissions();
      if (permsRes.success) setPermissions(permsRes.data || []);
      setSuccess('Revoked all companies for this client');
    } catch { setError('Error'); } finally { setSaving(false); }
  };

  if (loading) return <p className="settings-loading">Loading...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="cp-header">
        <div className="form-group">
          <label>Select User</label>
          <select
            value={selectedUserId}
            onChange={e => setSelectedUserId(e.target.value)}
            className="cp-user-select"
          >
            <option value="">Choose a user...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </div>
        {selectedUserId && (
          <input
            type="text"
            placeholder="Search clients..."
            value={searchClient}
            onChange={e => setSearchClient(e.target.value)}
            className="settings-search cp-search"
          />
        )}
      </div>

      {!selectedUserId ? (
        <p className="settings-empty">Select a user to manage their client permissions</p>
      ) : userCompanies.length === 0 ? (
        <p className="settings-empty">This user has no company access. Assign companies first in the "Company Access" tab.</p>
      ) : (
        <div className="cp-matrix-wrap">
          <table className="cp-matrix">
            <thead>
              <tr>
                <th className="cp-client-col">Client</th>
                {userCompanies.map(c => (
                  <th key={c.id} className="cp-company-col">{c.name}</th>
                ))}
                <th className="cp-actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
                const hasAll = userCompanies.every(c => permLookup.has(`${client.id}-${c.id}`));
                const hasNone = userCompanies.every(c => !permLookup.has(`${client.id}-${c.id}`));
                const hasSome = !hasAll && !hasNone;

                return (
                  <tr key={client.id} className={hasNone ? 'cp-row-none' : ''}>
                    <td className="cp-client-name">{client.name}</td>
                    {userCompanies.map(company => {
                      const hasPerm = permLookup.has(`${client.id}-${company.id}`);
                      return (
                        <td key={company.id} className="cp-check-cell">
                          <button
                            className={`cp-check${hasPerm ? ' on' : ''}`}
                            onClick={() => handleTogglePermission(client.id, company.id)}
                            disabled={saving}
                          >
                            {hasPerm ? '\u2713' : ''}
                          </button>
                        </td>
                      );
                    })}
                    <td className="cp-row-actions">
                      {!hasAll && (
                        <button
                          className="btn btn-small btn-info-outline"
                          onClick={() => handleGrantAllForClient(client.id)}
                          disabled={saving}
                        >
                          All
                        </button>
                      )}
                      {!hasNone && (
                        <button
                          className="btn btn-small btn-danger-outline"
                          onClick={() => handleRevokeAllForClient(client.id)}
                          disabled={saving}
                        >
                          None
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default Settings;
