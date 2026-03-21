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
  can_view_revenue?: boolean;
}

interface ClientItem {
  id: string;
  name: string;
  country?: string;
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

  const isMasterAdmin = user?.role === 'master_admin';

  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'manager' && user.role !== 'master_admin') {
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
          Suppliers
        </button>
        <button
          className={`settings-tab ${activeTab === 'clients' ? 'active' : ''}`}
          onClick={() => setActiveTab('clients')}
        >
          Countries & Access
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'users' && <UsersTab isMasterAdmin={!!isMasterAdmin} />}
        {activeTab === 'companies' && <CompanyAccessTab />}
        {activeTab === 'clients' && <ClientPermissionsTab />}
      </div>
    </div>
  );
};

// ─── Users Tab ────────────────────────────────────────
const UsersTab: React.FC<{ isMasterAdmin: boolean }> = ({ isMasterAdmin }) => {
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
      const response = await apiService.updateUser(editingUserId, { name: formData.name, role: formData.role });
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
    if (!editingUserId || !newPassword) return;
    setError(''); setSuccess('');
    try {
      const response = await apiService.changeUserPassword(editingUserId, newPassword);
      if (response.success) {
        setSuccess('Password reset successfully');
        setNewPassword('');
      } else setError(response.error || 'Failed to reset password');
    } catch (err) { setError((err as Error).message || 'Error resetting password'); }
  };

  const handleToggleRevenue = async (userId: string, currentValue: boolean) => {
    const newValue = !currentValue;
    // Optimistic update
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_view_revenue: newValue } : u));
    try {
      const res = await apiService.toggleRevenueAccess(userId, newValue);
      if (!res.success) {
        // Rollback
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_view_revenue: currentValue } : u));
        setError('Errore nel cambio accesso fatturato');
      }
    } catch (err) {
      console.error('Toggle revenue error:', err);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, can_view_revenue: currentValue } : u));
      setError('Errore nel cambio accesso fatturato');
    }
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
                <div className="form-group"><label>Name</label><input type="text" name="name" value={formData.name} onChange={handleFormChange} placeholder="Full name" /></div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" value={formData.role} onChange={handleFormChange}>
                    <option value="sales_rep">Sales Rep</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
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
                onClick={handleResetPassword}
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
              <thead><tr><th>Email</th><th>Name</th><th>Role</th>{isMasterAdmin && <th>Fatturato</th>}<th>Actions</th></tr></thead>
              <tbody>
                {filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.name}</td>
                    <td><span className={`role-badge role-${u.role}`}>{u.role === 'master_admin' ? 'Master Admin' : u.role}</span></td>
                    {isMasterAdmin && (
                      <td>
                        {u.role === 'master_admin' ? (
                          <span className="revenue-access-badge active">Sempre</span>
                        ) : u.role === 'admin' ? (
                          <button
                            type="button"
                            className={`toggle-btn ${u.can_view_revenue ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); handleToggleRevenue(u.id, !!u.can_view_revenue); }}
                          >
                            <span className="toggle-btn-knob" />
                          </button>
                        ) : (
                          <span className="revenue-access-badge">–</span>
                        )}
                      </td>
                    )}
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

// ─── Company Access Tab (NEW: uses area-based system) ──────
const CompanyAccessTab: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userCompanyIds, setUserCompanyIds] = useState<string[]>([]);
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
      const [usersRes, companiesRes] = await Promise.all([
        apiService.getUsers(),
        apiService.getCompanies(),
      ]);
      if (usersRes.success) setUsers((usersRes.data || []).filter((u: UserItem) => u.role === 'sales_rep' || u.role === 'manager'));
      if (companiesRes.success) setCompanies(companiesRes.data || []);
    } catch { setError('Error loading data'); } finally { setLoading(false); }
  };

  const loadUserAreas = async (userId: string) => {
    if (!userId) { setUserCompanyIds([]); return; }
    try {
      const res = await apiService.getUserAreas(userId);
      if (res.success && res.data) {
        setUserCompanyIds(res.data.companies?.map((c: any) => c.id) || []);
      }
    } catch { setError('Error loading user areas'); }
  };

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    loadUserAreas(userId);
  };

  const handleToggleCompany = (companyId: string) => {
    setUserCompanyIds(prev =>
      prev.includes(companyId) ? prev.filter(id => id !== companyId) : [...prev, companyId]
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      // Get current countries (preserve them)
      const areasRes = await apiService.getUserAreas(selectedUserId);
      const currentCountries = areasRes.data?.countries || [];
      await apiService.setUserAreas(selectedUserId, { companyIds: userCompanyIds, countries: currentCountries });
      setSuccess('Company access saved');
    } catch { setError('Error saving'); } finally { setSaving(false); }
  };

  if (loading) return <p className="settings-loading">Loading...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="ca-header">
        <div className="form-group">
          <label>Select User</label>
          <select value={selectedUserId} onChange={e => handleUserChange(e.target.value)} className="ca-user-select">
            <option value="">Choose a user...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
      </div>

      {!selectedUserId ? (
        <p className="settings-empty">Select a user to manage their company access</p>
      ) : (
        <>
          <p className="ca-hint">
            Select which companies/suppliers this user represents. Access to clients is computed automatically based on companies + countries.
          </p>
          <div className="ca-grid">
            {companies.map(company => {
              const hasAccess = userCompanyIds.includes(company.id);
              return (
                <div key={company.id} className={`ca-card${hasAccess ? ' active' : ''}`}>
                  <div className="ca-card-info">
                    <div className="ca-card-name">{company.name}</div>
                  </div>
                  <button
                    className={`ca-toggle${hasAccess ? ' on' : ''}`}
                    onClick={() => handleToggleCompany(company.id)}
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
          <div style={{ marginTop: '1rem' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Company Access'}
            </button>
            <span style={{ marginLeft: '0.75rem', fontSize: '0.813rem', color: 'var(--color-text-tertiary)' }}>
              {userCompanyIds.length} company{userCompanyIds.length !== 1 ? 'ies' : 'y'} selected
            </span>
          </div>
        </>
      )}
    </>
  );
};

// ─── Country Access Tab (NEW: uses area-based system) ──────
const ClientPermissionsTab: React.FC = () => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [allCountries, setAllCountries] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userCountries, setUserCountries] = useState<string[]>([]);
  const [visibleClients, setVisibleClients] = useState<any[]>([]);
  const [deniedClients, setDeniedClients] = useState<any[]>([]);
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
      const [usersRes, countriesRes] = await Promise.all([
        apiService.getUsers(),
        apiService.getAdminCountries(),
      ]);
      if (usersRes.success) setUsers((usersRes.data || []).filter((u: UserItem) => u.role === 'sales_rep' || u.role === 'manager'));
      if (countriesRes.success) setAllCountries(countriesRes.data || []);
    } catch { setError('Error loading data'); } finally { setLoading(false); }
  };

  const loadUserData = async (userId: string) => {
    if (!userId) { setUserCountries([]); setVisibleClients([]); setDeniedClients([]); return; }
    try {
      const [areasRes, clientsRes, overridesRes] = await Promise.all([
        apiService.getUserAreas(userId),
        apiService.getUserVisibleClients(userId),
        apiService.getUserOverrides(userId),
      ]);
      if (areasRes.success && areasRes.data) {
        setUserCountries(areasRes.data.countries || []);
      }
      if (clientsRes.success) {
        setVisibleClients(clientsRes.data || []);
      }
      if (overridesRes.success) {
        setDeniedClients((overridesRes.data || []).filter((o: any) => o.override_type === 'deny'));
      }
    } catch { setError('Error loading user data'); }
  };

  const handleUserChange = (userId: string) => {
    setSelectedUserId(userId);
    loadUserData(userId);
  };

  const handleToggleCountry = (country: string) => {
    setUserCountries(prev =>
      prev.includes(country) ? prev.filter(c => c !== country) : [...prev, country]
    );
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      // Get current companies (preserve them)
      const areasRes = await apiService.getUserAreas(selectedUserId);
      const currentCompanyIds = areasRes.data?.companies?.map((c: any) => c.id) || [];
      await apiService.setUserAreas(selectedUserId, { companyIds: currentCompanyIds, countries: userCountries });
      // Reload visible clients and overrides
      const [clientsRes, overridesRes] = await Promise.all([
        apiService.getUserVisibleClients(selectedUserId),
        apiService.getUserOverrides(selectedUserId),
      ]);
      if (clientsRes.success) setVisibleClients(clientsRes.data || []);
      if (overridesRes.success) setDeniedClients((overridesRes.data || []).filter((o: any) => o.override_type === 'deny'));
      setSuccess('Country access saved');
    } catch { setError('Error saving'); } finally { setSaving(false); }
  };

  if (loading) return <p className="settings-loading">Loading...</p>;

  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="cp-header">
        <div className="form-group">
          <label>Select User</label>
          <select value={selectedUserId} onChange={e => handleUserChange(e.target.value)} className="cp-user-select">
            <option value="">Choose a user...</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
          </select>
        </div>
      </div>

      {!selectedUserId ? (
        <p className="settings-empty">Select a user to manage their country access</p>
      ) : (
        <>
          <p className="cp-hint">Select which countries this user covers. Combined with companies, this determines which clients they can see.</p>

          <div className="ca-grid">
            {allCountries.map(country => {
              const isActive = userCountries.includes(country);
              return (
                <div key={country} className={`ca-card${isActive ? ' active' : ''}`}>
                  <div className="ca-card-info">
                    <div className="ca-card-name">{country}</div>
                  </div>
                  <button
                    className={`ca-toggle${isActive ? ' on' : ''}`}
                    onClick={() => handleToggleCountry(country)}
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

          <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Country Access'}
            </button>
            <span style={{ fontSize: '0.813rem', color: 'var(--color-text-tertiary)' }}>
              {userCountries.length} countr{userCountries.length !== 1 ? 'ies' : 'y'} selected
            </span>
          </div>

          {visibleClients.length > 0 && (
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
                Computed Access: {visibleClients.length} client{visibleClients.length !== 1 ? 's' : ''} visible
                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: '0.5rem' }}>
                  (click ✕ to deny access)
                </span>
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {visibleClients.map((c: any) => (
                  <span key={c.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.25rem 0.375rem 0.25rem 0.625rem', borderRadius: '9999px', fontSize: '0.75rem',
                    background: 'rgba(74, 96, 120, 0.08)', color: '#4A6078', border: '1px solid rgba(74, 96, 120, 0.15)',
                  }}>
                    {c.name} ({c.country})
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Remove ${c.name} from this user's access?`)) return;
                        try {
                          await apiService.addUserOverride(selectedUserId, c.id, 'deny');
                          const [vRes, oRes] = await Promise.all([
                            apiService.getUserVisibleClients(selectedUserId),
                            apiService.getUserOverrides(selectedUserId),
                          ]);
                          if (vRes.success) setVisibleClients(vRes.data || []);
                          if (oRes.success) setDeniedClients((oRes.data || []).filter((o: any) => o.override_type === 'deny'));
                          setSuccess(`${c.name} removed from access`);
                        } catch { setError('Error removing client'); }
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '16px', height: '16px', borderRadius: '50%', border: 'none',
                        background: 'rgba(158, 90, 82, 0.12)', color: '#9E5A52', fontSize: '0.625rem',
                        cursor: 'pointer', padding: 0, lineHeight: 1, fontWeight: 700,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(158, 90, 82, 0.25)'; }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(158, 90, 82, 0.12)'; }}
                      title={`Deny access to ${c.name}`}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {deniedClients.length > 0 && (
            <div style={{ marginTop: '1.25rem' }}>
              <h4 style={{ fontSize: '0.875rem', marginBottom: '0.5rem', color: '#9E5A52' }}>
                Denied Clients: {deniedClients.length}
                <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: '0.5rem' }}>
                  (click + to restore access)
                </span>
              </h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {deniedClients.map((o: any) => (
                  <span key={o.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                    padding: '0.25rem 0.375rem 0.25rem 0.625rem', borderRadius: '9999px', fontSize: '0.75rem',
                    background: 'rgba(158, 90, 82, 0.08)', color: '#9E5A52', border: '1px solid rgba(158, 90, 82, 0.15)',
                    textDecoration: 'line-through',
                  }}>
                    {o.client?.name || o.client_id?.substring(0, 8)}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await apiService.removeUserOverride(selectedUserId, o.client_id);
                          const [vRes, oRes] = await Promise.all([
                            apiService.getUserVisibleClients(selectedUserId),
                            apiService.getUserOverrides(selectedUserId),
                          ]);
                          if (vRes.success) setVisibleClients(vRes.data || []);
                          if (oRes.success) setDeniedClients((oRes.data || []).filter((x: any) => x.override_type === 'deny'));
                          setSuccess(`${o.client?.name || 'Client'} restored`);
                        } catch { setError('Error restoring client'); }
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: '16px', height: '16px', borderRadius: '50%', border: 'none',
                        background: 'rgba(91, 138, 101, 0.15)', color: '#4A7653', fontSize: '0.75rem',
                        cursor: 'pointer', padding: 0, lineHeight: 1, fontWeight: 700,
                      }}
                      onMouseEnter={e => { (e.target as HTMLElement).style.background = 'rgba(91, 138, 101, 0.3)'; }}
                      onMouseLeave={e => { (e.target as HTMLElement).style.background = 'rgba(91, 138, 101, 0.15)'; }}
                      title="Restore access"
                    >
                      +
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
};

export default Settings;
