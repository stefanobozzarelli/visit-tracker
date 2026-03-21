import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/AdminPermissions.css';
import '../styles/CrudPages.css';

import { config } from '../config';
import { apiService } from '../services/api';
import { Company, Client, AdminOverride } from '../types';

const API_BASE_URL = config.API_BASE_URL;

interface User {
  id: string;
  email: string;
  name: string;
  role?: string;
}

interface VisibleClient {
  id: string;
  name: string;
  country: string;
  companies: Company[];
}

export const AdminPermissions = () => {
  const navigate = useNavigate();

  // Global data
  const [users, setUsers] = useState<User[]>([]);
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [allCountries, setAllCountries] = useState<string[]>([]);

  // Selected user
  const [selectedUserId, setSelectedUserId] = useState('');

  // Section A: User Areas
  const [areaCompanyIds, setAreaCompanyIds] = useState<string[]>([]);
  const [areaCountries, setAreaCountries] = useState<string[]>([]);
  const [savingAreas, setSavingAreas] = useState(false);

  // Section B: Access Preview
  const [visibleClients, setVisibleClients] = useState<VisibleClient[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Section C: Admin Overrides
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [newOverrideClientId, setNewOverrideClientId] = useState('');
  const [newOverrideType, setNewOverrideType] = useState<'grant' | 'deny'>('grant');
  const [addingOverride, setAddingOverride] = useState(false);

  // General UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [usersRes, companiesRes, clientsRes, countriesRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/admin/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        apiService.getCompanies(),
        apiService.getClients(),
        apiService.getAdminCountries(),
      ]);

      setUsers(usersRes.data.data);
      setAllCompanies(companiesRes.data || []);
      setAllClients(clientsRes.data || []);
      setAllCountries(countriesRes.data || []);
    } catch (err) {
      setError('Error loading data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = useCallback(async (userId: string) => {
    if (!userId) return;
    try {
      setLoadingPreview(true);
      setError('');

      const [areasRes, visibleRes, overridesRes] = await Promise.all([
        apiService.getUserAreas(userId),
        apiService.getUserVisibleClients(userId),
        apiService.getUserOverrides(userId),
      ]);

      // Areas
      const areas = areasRes.data;
      setAreaCompanyIds(areas?.companies?.map((c: Company) => c.id) || []);
      setAreaCountries(areas?.countries || []);

      // Visible clients
      setVisibleClients(visibleRes.data || []);

      // Overrides
      setOverrides(overridesRes.data || []);
    } catch (err) {
      console.error(err);
      setError('Error loading user data');
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);
    setAreaCompanyIds([]);
    setAreaCountries([]);
    setVisibleClients([]);
    setOverrides([]);
    setNewOverrideClientId('');
    setSuccess('');
    setError('');
    if (userId) {
      loadUserData(userId);
    }
  };

  // --- Section A: Save Areas ---
  const handleSaveAreas = async () => {
    if (!selectedUserId) return;
    try {
      setSavingAreas(true);
      setError('');
      setSuccess('');
      await apiService.setUserAreas(selectedUserId, {
        companyIds: areaCompanyIds,
        countries: areaCountries,
      });
      setSuccess('Areas saved successfully');
      // Refresh visible clients after saving areas
      loadUserData(selectedUserId);
    } catch (err) {
      setError('Error saving areas');
      console.error(err);
    } finally {
      setSavingAreas(false);
    }
  };

  const toggleCompany = (companyId: string) => {
    setAreaCompanyIds((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId]
    );
  };

  const toggleCountry = (country: string) => {
    setAreaCountries((prev) =>
      prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]
    );
  };

  // --- Section C: Overrides ---
  const handleAddOverride = async () => {
    if (!selectedUserId || !newOverrideClientId) return;
    try {
      setAddingOverride(true);
      setError('');
      setSuccess('');
      await apiService.addUserOverride(selectedUserId, newOverrideClientId, newOverrideType);
      setSuccess('Override added');
      setNewOverrideClientId('');
      loadUserData(selectedUserId);
    } catch (err) {
      setError('Error adding override');
      console.error(err);
    } finally {
      setAddingOverride(false);
    }
  };

  const handleRemoveOverride = async (clientId: string) => {
    if (!selectedUserId) return;
    try {
      setError('');
      setSuccess('');
      await apiService.removeUserOverride(selectedUserId, clientId);
      setSuccess('Override removed');
      loadUserData(selectedUserId);
    } catch (err) {
      setError('Error removing override');
      console.error(err);
    }
  };

  // --- User Management ---
  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? All associated visits will also be deleted.`)) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess('User deleted successfully');
      if (selectedUserId === userId) {
        setSelectedUserId('');
        setAreaCompanyIds([]);
        setAreaCountries([]);
        setVisibleClients([]);
        setOverrides([]);
      }
      loadInitialData();
    } catch (err) {
      setError('Error deleting user');
      console.error(err);
    }
  };

  if (loading) {
    return <div className="admin-permissions"><p>Loading...</p></div>;
  }

  const selectedUserName = users.find((u) => u.id === selectedUserId)?.name || '';

  return (
    <div className="admin-permissions">
      <div className="header">
        <h1>Permissions &amp; Users</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/visits')}>
          &larr; Back
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* User Selector */}
      <div className="form-card" style={{ marginBottom: 24 }}>
        <div className="form-group">
          <label>Select User</label>
          <select
            value={selectedUserId}
            onChange={(e) => handleSelectUser(e.target.value)}
          >
            <option value="">-- Select a user --</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedUserId && (
        <>
          {/* Section A: User Areas */}
          <div className="form-card" style={{ marginBottom: 24 }}>
            <h2>User Areas &mdash; {selectedUserName}</h2>

            <div className="areas-panels">
              {/* Companies Panel */}
              <div className="area-panel">
                <h3>Companies</h3>
                <div className="area-checkbox-grid">
                  <label className="area-checkbox-item">
                    <input
                      type="checkbox"
                      checked={areaCompanyIds.length === allCompanies.length && allCompanies.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAreaCompanyIds(allCompanies.map((c) => c.id));
                        } else {
                          setAreaCompanyIds([]);
                        }
                      }}
                    />
                    <strong>Select all</strong>
                  </label>
                  {allCompanies.map((company) => (
                    <label key={company.id} className="area-checkbox-item">
                      <input
                        type="checkbox"
                        checked={areaCompanyIds.includes(company.id)}
                        onChange={() => toggleCompany(company.id)}
                      />
                      {company.name}
                    </label>
                  ))}
                </div>
              </div>

              {/* Countries Panel */}
              <div className="area-panel">
                <h3>Countries</h3>
                <div className="area-checkbox-grid">
                  <label className="area-checkbox-item">
                    <input
                      type="checkbox"
                      checked={areaCountries.length === allCountries.length && allCountries.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAreaCountries([...allCountries]);
                        } else {
                          setAreaCountries([]);
                        }
                      }}
                    />
                    <strong>Select all</strong>
                  </label>
                  {allCountries.map((country) => (
                    <label key={country} className="area-checkbox-item">
                      <input
                        type="checkbox"
                        checked={areaCountries.includes(country)}
                        onChange={() => toggleCountry(country)}
                      />
                      {country}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary"
              onClick={handleSaveAreas}
              disabled={savingAreas}
              style={{ marginTop: 16, maxWidth: 200 }}
            >
              {savingAreas ? 'Saving...' : 'Save Areas'}
            </button>
          </div>

          {/* Section B: Access Preview */}
          <div className="form-card" style={{ marginBottom: 24 }}>
            <h2>Access Preview &mdash; {selectedUserName}</h2>
            {loadingPreview ? (
              <p>Loading preview...</p>
            ) : visibleClients.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)' }}>No visible clients for this user.</p>
            ) : (
              <div className="table-section" style={{ border: 'none', padding: 0, background: 'transparent' }}>
                <table className="permissions-table" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th>Client Name</th>
                      <th>Country</th>
                      <th>Companies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleClients.map((vc) => (
                      <tr key={vc.id}>
                        <td>{vc.name}</td>
                        <td>{vc.country}</td>
                        <td>
                          <div className="pill-container">
                            {(vc.companies || []).map((comp) => (
                              <span key={comp.id} className="pill-badge">
                                {comp.name}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section C: Admin Overrides */}
          <div className="form-card" style={{ marginBottom: 24 }}>
            <h2>Admin Overrides &mdash; {selectedUserName}</h2>

            {/* Current overrides */}
            {overrides.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>No overrides for this user.</p>
            ) : (
              <div className="table-section" style={{ border: 'none', padding: 0, background: 'transparent', marginBottom: 20 }}>
                <table className="permissions-table" style={{ minWidth: 500 }}>
                  <thead>
                    <tr>
                      <th>Client</th>
                      <th>Override Type</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overrides.map((ov) => (
                      <tr key={ov.id}>
                        <td>{ov.client?.name || ov.client_id}</td>
                        <td>
                          <span
                            className={`pill-badge ${ov.override_type === 'grant' ? 'pill-grant' : 'pill-deny'}`}
                          >
                            {ov.override_type}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-small btn-danger"
                            onClick={() => handleRemoveOverride(ov.client_id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add override form */}
            <div className="override-add-form">
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>Client</label>
                <select
                  value={newOverrideClientId}
                  onChange={(e) => setNewOverrideClientId(e.target.value)}
                >
                  <option value="">Select client...</option>
                  {allClients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ width: 160, marginBottom: 0 }}>
                <label>Type</label>
                <select
                  value={newOverrideType}
                  onChange={(e) => setNewOverrideType(e.target.value as 'grant' | 'deny')}
                >
                  <option value="grant">Grant</option>
                  <option value="deny">Deny</option>
                </select>
              </div>
              <button
                className="btn btn-primary"
                onClick={handleAddOverride}
                disabled={addingOverride || !newOverrideClientId}
                style={{ alignSelf: 'flex-end', maxWidth: 140 }}
              >
                {addingOverride ? 'Adding...' : 'Add Override'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* User Management Section */}
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
    </div>
  );
};

export default AdminPermissions;
