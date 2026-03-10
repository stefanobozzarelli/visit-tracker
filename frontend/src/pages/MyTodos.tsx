import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { TodoItem, Client, Company, User } from '../types';
import { SearchBar } from '../components/SearchBar';
import '../styles/MyTodos.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const MyTodos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [displayedTodos, setDisplayedTodos] = useState<TodoItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [status, setStatus] = useState('');
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [next7Days, setNext7Days] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');
  const [searchError, setSearchError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadTodos();
  }, [status, clientId, companyId, overdue, thisWeek, next7Days]);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');

      const [clientsRes, companiesRes, usersRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/clients`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/companies`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_BASE_URL}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (clientsRes.data.success) setClients(clientsRes.data.data);
      if (companiesRes.data.success) setCompanies(companiesRes.data.data);
      if (usersRes.data.success) setUsers(usersRes.data.data);

      loadTodos();
    } catch (err) {
      setError('Errore nel caricamento dei dati');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTodos = async () => {
    try {
      const token = localStorage.getItem('token');
      const params: any = {};

      if (status) params.status = status;
      if (clientId) params.clientId = clientId;
      if (companyId) params.companyId = companyId;
      if (overdue) params.overdue = true;
      if (thisWeek) params.thisWeek = true;
      if (next7Days) params.next7Days = true;

      const response = await axios.get(`${API_BASE_URL}/todos/my`, {
        params,
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setTodos(response.data.data);
        setDisplayedTodos(response.data.data);
        setSearchError('');
      }
    } catch (err) {
      setError('Errore nel caricamento dei TODO');
      console.error(err);
    }
  };

  const handleSearchResults = (results: TodoItem[]) => {
    setDisplayedTodos(results);
    if (results.length === 0) {
      setSearchError('Nessun TODO trovato');
    } else {
      setSearchError('');
    }
  };

  const handleStatusChange = async (todoId: string, newStatus: string) => {
    try {
      const token = localStorage.getItem('token');
      // Optimistic update
      setTodos(todos.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t)));
      // API call
      await axios.put(
        `${API_BASE_URL}/todos/${todoId}`,
        { status: newStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSuccess('TODO aggiornato');
    } catch (err) {
      setError('Errore nell\'aggiornamento del TODO');
      console.error(err);
      loadTodos(); // Reload to rollback optimistic update
    }
  };

  const handleDelete = async (todoId: string) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo TODO?')) return;

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_BASE_URL}/todos/${todoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccess('TODO eliminato');
      loadTodos();
    } catch (err) {
      setError('Errore nell\'eliminazione del TODO');
      console.error(err);
    }
  };

  const handleCreateFromReport = () => {
    navigate('/todos/new');
  };

  if (loading) {
    return (
      <div className="my-todos">
        <p>Caricamento...</p>
      </div>
    );
  }

  const getClientName = (id: string) => clients.find((c) => c.id === id)?.name || id;
  const getCompanyName = (id: string) => companies.find((c) => c.id === id)?.name || id;
  const getUserName = (id: string) => users.find((u) => u.id === id)?.name || id;

  return (
    <div className="my-todos">
      <div className="header">
        <h1>I Miei TODO</h1>
        <button className="btn btn-primary" onClick={handleCreateFromReport}>
          + Nuovo TODO
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}
      {searchError && <div className="alert alert-error">{searchError}</div>}

      {!loading && todos.length > 0 && (
        <SearchBar
          type="todos"
          onResults={handleSearchResults}
          onLoading={setIsSearching}
          onError={setSearchError}
        />
      )}

      <div className="filters-section">
        <div className="filter-group">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tutti</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progresso</option>
            <option value="done">Completato</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Cliente</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Tutti</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Azienda</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">Tutte</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
            Scaduti
          </label>
        </div>

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={thisWeek} onChange={(e) => setThisWeek(e.target.checked)} />
            Questa Settimana
          </label>
        </div>

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={next7Days} onChange={(e) => setNext7Days(e.target.checked)} />
            Prossimi 7 Giorni
          </label>
        </div>
      </div>

      <div className="table-section">
        {displayedTodos.length === 0 ? (
          <p className="no-data">Nessun TODO trovato</p>
        ) : (
          <table className="todos-table">
            <thead>
              <tr>
                <th>Azione</th>
                <th>Cliente</th>
                <th>Azienda</th>
                <th>Creato da</th>
                <th>Assegnato a</th>
                <th>Status</th>
                <th>Scadenza</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {displayedTodos.map((todo) => (
                <tr key={todo.id}>
                  <td className="todo-title">{todo.title}</td>
                  <td>{getClientName(todo.client_id)}</td>
                  <td>{getCompanyName(todo.company_id)}</td>
                  <td>{(todo as any).created_by_user?.name || '-'}</td>
                  <td>{getUserName(todo.assigned_to_user_id)}</td>
                  <td>
                    <select
                      value={todo.status}
                      onChange={(e) => handleStatusChange(todo.id, e.target.value)}
                      className={`status-select status-${todo.status}`}
                    >
                      <option value="todo">Todo</option>
                      <option value="in_progress">In Progresso</option>
                      <option value="done">Completato</option>
                    </select>
                  </td>
                  <td className="due-date">{todo.due_date ? new Date(todo.due_date).toLocaleDateString('it-IT') : '-'}</td>
                  <td>
                    <button className="btn btn-small btn-danger" onClick={() => handleDelete(todo.id)}>
                      Elimina
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

export default MyTodos;
