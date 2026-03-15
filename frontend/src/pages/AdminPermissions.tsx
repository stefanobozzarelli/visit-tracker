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

      // Carica utenti
      const usersRes = await axios.get(`${API_BASE_URL}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUsers(usersRes.data.data);

      // Carica clienti
      const clientsRes = await axios.get(`${API_BASE_URL}/clients`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setClients(clientsRes.data.data);

      // Carica aziende
      const companiesRes = await axios.get(`${API_BASE_URL}/companies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCompanies(companiesRes.data.data);

      // Carica permessi
      const permsRes = await axios.get(`${API_BASE_URL}/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setPermissions(permsRes.data.data);
    } catch (err) {
      setError('Errore nel caricamento dei dati');
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
      setError('Seleziona utente, cliente e almeno una azienda');
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Crea un permesso per ogni azienda selezionata
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

      setSuccess(`Permessi assegnati con successo per ${selectedCompanies.length} azienda(e)`);
      resetForm();
      loadData();
    } catch (err) {
      setError('Errore nell\'assegnazione dei permessi');
      console.error(err);
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

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Sei sicuro di voler cancellare l'utente "${userName}"? Verranno cancellate anche tutte le sue visite.`)) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setSuccess('Utente cancellato con successo');
      loadData();
    } catch (err) {
      setError('Errore nella cancellazione dell\'utente');
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
    return <div className="admin-permissions"><p>Caricamento...</p></div>;
  }

  return (
    <div className="admin-permissions">
      <div className="header">
        <h1>Gestione Permessi Utenti</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/visits')}>
          ← Indietro
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="permissions-container">
        <div className="form-section">
          <h2>Assegna Permesso</h2>
          <form onSubmit={handleAssignPermission}>
            <div className="form-group">
              <label>Utente (Sales Rep)</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                required
              >
                <option value="">Seleziona utente...</option>
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
                <option value="">Seleziona cliente...</option>
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
              Assegna Permesso
            </button>
          </form>
        </div>

        <div className="table-section">
          <h2>Permessi Assegnati</h2>
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
      </div>

      <div className="users-section">
        <h2>Gestione Utenti</h2>
        {users.length === 0 ? (
          <p>Nessun utente registrato</p>
        ) : (
          <table className="permissions-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Ruolo</th>
                <th>Azioni</th>
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
                      Cancella
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
