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

export const AssignPermissions = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [selectedUser, setSelectedUser] = useState('');
  const [selectedClient, setSelectedClient] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  const [canView, setCanView] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

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

      const [usersRes, clientsRes, companiesRes] = await Promise.all([
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
    } catch (err) {
      setError('Error assigning permissions');
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
        <h1>Assign Permissions</h1>
        <div>
          <button className="btn btn-secondary" onClick={() => navigate('/admin/permissions/view')}>
            View Permissions →
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/visits')} style={{ marginLeft: '10px' }}>
            ← Back
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="form-section" style={{ maxWidth: '100%' }}>
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
            <label>Companies</label>
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
                <strong>Select all</strong>
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
              View
            </label>
            <label>
              <input
                type="checkbox"
                checked={canCreate}
                onChange={(e) => setCanCreate(e.target.checked)}
              />
              Create visits
            </label>
            <label>
              <input
                type="checkbox"
                checked={canEdit}
                onChange={(e) => setCanEdit(e.target.checked)}
              />
              Modify reports
            </label>
          </div>

          <button type="submit" className="btn btn-primary">
            Assign Permission
          </button>
        </form>
      </div>
    </div>
  );
};

export default AssignPermissions;
