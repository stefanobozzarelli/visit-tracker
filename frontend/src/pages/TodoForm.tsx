import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Client, Company, User } from '../types';
import '../styles/TodoForm.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

interface TodoFormProps {
  initialData?: {
    visitReportId?: string;
    clientId?: string;
    companyId?: string;
  };
}

export const TodoForm = (props: TodoFormProps) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState(user?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [visitReportId, setVisitReportId] = useState('');

  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Load from URL params if present
    const urlClientId = searchParams.get('clientId');
    const urlCompanyId = searchParams.get('companyId');
    const urlVisitReportId = searchParams.get('visitReportId');

    if (urlClientId) setClientId(urlClientId);
    if (urlCompanyId) setCompanyId(urlCompanyId);
    if (urlVisitReportId) setVisitReportId(urlVisitReportId);

    loadData();
  }, []);

  const loadData = async () => {
    try {
      const token = localStorage.getItem('token');

      const [clientsRes, companiesRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/clients`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (clientsRes.data.success) setClients(clientsRes.data.data);
      if (companiesRes.data.success) setCompanies(companiesRes.data.data);
      if (usersRes.data.success) setUsers(usersRes.data.data);
    } catch (err) {
      setError('Errore nel caricamento dei dati');
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title || !clientId || !companyId || !assignedToUserId) {
      setError('Compilare tutti i campi obbligatori');
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const response = await axios.post(
        `${API_BASE_URL}/todos`,
        {
          title,
          clientId,
          companyId,
          assignedToUserId,
          dueDate: dueDate ? new Date(dueDate).toISOString().split('T')[0] : undefined,
          visitReportId: visitReportId || undefined,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSuccess('TODO creato con successo');
        setTimeout(() => {
          navigate('/my-todos');
        }, 1500);
      }
    } catch (err) {
      setError('Errore nella creazione del TODO');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="todo-form-container">
      <div className="todo-form-card">
        <h2>Crea Nuovo TODO</h2>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Azione *</label>
            <input
              id="title"
              type="text"
              placeholder="Descrivi l'azione..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="clientId">Cliente *</label>
              <select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Seleziona cliente...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="companyId">Azienda *</label>
              <select id="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
                <option value="">Seleziona azienda...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="assignedToUserId">Assegnato a *</label>
              <select id="assignedToUserId" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)} required>
                <option value="">Seleziona utente...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="dueDate">Scadenza</label>
              <input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {visitReportId && (
            <div className="info-note">
              ℹ️ Questo TODO è collegato a un report di visita
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creazione...' : 'Crea TODO'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/my-todos')} disabled={loading}>
              Annulla
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TodoForm;
