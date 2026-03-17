import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { TodoItem, Client, Company, User } from '../types';
import '../styles/MyTodos.css';

export const AdminTodos = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [status, setStatus] = useState('');
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [next7Days, setNext7Days] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Check if user is admin
  useEffect(() => {
    if (user && user.role !== 'admin' && user.role !== 'manager') {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadTodos();
  }, [status, clientId, companyId, assignedToUserId, overdue, thisWeek, next7Days]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load each independently so one failure doesn't block the others
      try {
        const clientsRes = await apiService.getClients();
        if (clientsRes.success && clientsRes.data) setClients(clientsRes.data);
      } catch (err) { console.warn('[AdminTodos] Failed to load clients:', err); }

      try {
        const companiesRes = await apiService.getCompanies();
        if (companiesRes.success && companiesRes.data) setCompanies(companiesRes.data);
      } catch (err) { console.warn('[AdminTodos] Failed to load companies:', err); }

      try {
        const usersRes = await apiService.getUsers();
        if (usersRes.success && usersRes.data) setUsers(usersRes.data);
      } catch (err) { console.warn('[AdminTodos] Failed to load users:', err); }

      loadTodos();
    } catch (err) {
      setError('Error loading data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTodos = async () => {
    try {
      const filters: any = {};
      if (status) filters.status = status;
      if (clientId) filters.clientId = clientId;
      if (companyId) filters.companyId = companyId;
      if (assignedToUserId) filters.assignedToUserId = assignedToUserId;
      if (overdue) filters.overdue = true;
      if (thisWeek) filters.thisWeek = true;
      if (next7Days) filters.next7Days = true;

      const response = await apiService.getTodos(filters);
      if (response.success) {
        setTodos(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      setError('Error loading TODOs');
      console.error(err);
    }
  };

  const handleStatusChange = async (todoId: string, newStatus: string) => {
    try {
      // Optimistic update
      setTodos(todos.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t)));
      await apiService.updateTodo(todoId, { status: newStatus });
      setSuccess('TODO updated');
    } catch (err) {
      setError('Error updating TODO');
      console.error(err);
      loadTodos();
    }
  };

  const handleDelete = async (todoId: string) => {
    if (!window.confirm('Are you sure you want to delete this TODO?')) return;

    try {
      await apiService.deleteTodo(todoId);
      setSuccess('TODO deleted');
      loadTodos();
    } catch (err) {
      setError('Error deleting TODO');
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="my-todos">
        <p>Loading...</p>
      </div>
    );
  }

  const getClientName = (id: string) => clients.find((c) => c.id === id)?.name || id;
  const getCompanyName = (id: string) => companies.find((c) => c.id === id)?.name || id;
  const getUserName = (id: string) => users.find((u) => u.id === id)?.name || id;

  return (
    <div className="my-todos">
      <div className="header">
        <h1>All TODOs</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="filters-section">
        <div className="filter-group">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="done">Completed</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Client</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Company</label>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            <option value="">All</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Assigned To</label>
          <select value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)}>
            <option value="">All</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={overdue} onChange={(e) => setOverdue(e.target.checked)} />
            Overdue
          </label>
        </div>

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={thisWeek} onChange={(e) => setThisWeek(e.target.checked)} />
            This Week
          </label>
        </div>

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={next7Days} onChange={(e) => setNext7Days(e.target.checked)} />
            Next 7 Days
          </label>
        </div>
      </div>

      <div className="table-section">
        {todos.length === 0 ? (
          <p className="no-data">No TODOs found</p>
        ) : (
          <table className="todos-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Client</th>
                <th>Company</th>
                <th>Created By</th>
                <th>Assigned To</th>
                <th>Status</th>
                <th>Due Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {todos.map((todo) => (
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
                      <option value="in_progress">In Progress</option>
                      <option value="done">Completed</option>
                    </select>
                  </td>
                  <td className="due-date">{todo.due_date ? new Date(todo.due_date).toLocaleDateString('it-IT') : '-'}</td>
                  <td>
                    <button className="btn btn-small btn-danger" onClick={() => handleDelete(todo.id)}>
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

export default AdminTodos;
