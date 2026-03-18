import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { TodoItem, Client, Company, User } from '../types';
import { SearchBar } from '../components/SearchBar';
import '../styles/MyTodos.css';

export const Tasks: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [displayedTodos, setDisplayedTodos] = useState<TodoItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [next7Days, setNext7Days] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

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
  }, [clientId, companyId, assignedToUserId, overdue, thisWeek, next7Days]);

  // Clear alerts after 5s
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);

      try {
        const clientsRes = await apiService.getClients();
        if (clientsRes.success && clientsRes.data) setClients(clientsRes.data);
      } catch (err) { console.warn('[Tasks] Failed to load clients:', err); }

      try {
        const companiesRes = await apiService.getCompanies();
        if (companiesRes.success && companiesRes.data) setCompanies(companiesRes.data);
      } catch (err) { console.warn('[Tasks] Failed to load companies:', err); }

      try {
        const usersRes = await apiService.getUsers();
        if (usersRes.success && usersRes.data) setUsers(usersRes.data);
      } catch (err) { console.warn('[Tasks] Failed to load users:', err); }

      loadTodos();
    } catch (err) {
      setError('Error loading data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sortTodos = (items: TodoItem[]): TodoItem[] => {
    return [...items].sort((a, b) => {
      const statusOrder = (s: string) => s === 'completed' || s === 'done' ? 1 : 0;
      const diff = statusOrder(a.status) - statusOrder(b.status);
      if (diff !== 0) return diff;
      const dateA = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const dateB = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return dateA - dateB;
    });
  };

  const loadTodos = async () => {
    try {
      const filters: any = {};
      if (clientId) filters.clientId = clientId;
      if (companyId) filters.companyId = companyId;
      if (assignedToUserId) filters.assignedToUserId = assignedToUserId;
      if (overdue) filters.overdue = true;
      if (thisWeek) filters.thisWeek = true;
      if (next7Days) filters.next7Days = true;

      // Admin sees all todos, regular users see only their own
      const response = isAdmin
        ? await apiService.getTodos(filters)
        : await apiService.getMyTodos(filters);

      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        const normalized = data.map(t => ({
          ...t,
          status: t.status === 'done' || t.status === 'completed' ? 'completed' : 'todo'
        }));
        const sorted = sortTodos(normalized as TodoItem[]);
        setTodos(sorted);
        setDisplayedTodos(sorted);
        setSearchError('');
      }
    } catch (err) {
      setError('Error loading tasks');
      console.error(err);
    }
  };

  const handleSearchResults = (results: TodoItem[]) => {
    setDisplayedTodos(results);
    if (results.length === 0) {
      setSearchError('No tasks found');
    } else {
      setSearchError('');
    }
  };

  const handleStatusChange = async (todoId: string, newStatus: string) => {
    try {
      setTodos(todos.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t)));
      setDisplayedTodos(displayedTodos.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t)));
      await apiService.updateTodo(todoId, { status: newStatus });
      setSuccess('Task updated');
    } catch (err) {
      setError('Error updating task');
      console.error(err);
      loadTodos();
    }
  };

  const handleDelete = async (todoId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      await apiService.deleteTodo(todoId);
      setSuccess('Task deleted');
      loadTodos();
    } catch (err) {
      setError('Error deleting task');
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
        <h1>{isAdmin ? 'All Tasks' : 'My Tasks'}</h1>
        <button className="btn btn-primary" onClick={() => navigate('/todos/new')}>
          + New Task
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

        {isAdmin && (
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
        )}

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

        <div className="filter-group checkbox">
          <label>
            <input type="checkbox" checked={showCompleted} onChange={(e) => setShowCompleted(e.target.checked)} />
            Show completed
          </label>
        </div>
      </div>

      <div className="table-section">
        {(() => {
          const visibleTodos = showCompleted
            ? displayedTodos
            : displayedTodos.filter(t => t.status !== 'completed' && t.status !== 'done');
          return visibleTodos.length === 0 ? (
            <p className="no-data">No tasks found</p>
          ) : (
            <table className="todos-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Client</th>
                  <th>Company</th>
                  <th>Created By</th>
                  {isAdmin && <th>Assigned To</th>}
                  <th>Status</th>
                  <th>Due Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTodos.map((todo) => (
                  <tr key={todo.id}>
                    <td className="todo-title">{todo.title}</td>
                    <td>{getClientName(todo.client_id)}</td>
                    <td>{getCompanyName(todo.company_id)}</td>
                    <td>{(todo as any).created_by_user?.name || '-'}</td>
                    {isAdmin && <td>{getUserName(todo.assigned_to_user_id)}</td>}
                    <td>
                      <select
                        value={todo.status === 'done' || todo.status === 'completed' ? 'completed' : 'todo'}
                        onChange={(e) => handleStatusChange(todo.id, e.target.value === 'completed' ? 'done' : 'todo')}
                        className={`status-select status-${todo.status === 'done' || todo.status === 'completed' ? 'done' : 'todo'}`}
                      >
                        <option value="todo">Todo</option>
                        <option value="completed">Completed</option>
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
          );
        })()}
      </div>
    </div>
  );
};

export default Tasks;
