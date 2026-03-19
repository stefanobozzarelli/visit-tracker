import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, Company, User } from '../types';
import '../styles/TodoForm.css';

export const TodoForm = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: editId } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isEdit = !!editId;

  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState(user?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [visitReportId, setVisitReportId] = useState('');
  const [status, setStatus] = useState('todo');

  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const urlClientId = searchParams.get('clientId');
    const urlCompanyId = searchParams.get('companyId');
    const urlVisitReportId = searchParams.get('visitReportId');

    if (urlClientId) setClientId(urlClientId);
    if (urlCompanyId) setCompanyId(urlCompanyId);
    if (urlVisitReportId) setVisitReportId(urlVisitReportId);

    loadData();
  }, []);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const clientsRes = await apiService.getClients();
      if (clientsRes.success && clientsRes.data) setClients(clientsRes.data);
    } catch {}

    try {
      const companiesRes = await apiService.getCompanies();
      if (companiesRes.success && companiesRes.data) setCompanies(companiesRes.data);
    } catch {}

    try {
      const usersRes = await apiService.getUsers();
      if (usersRes.success && usersRes.data) setUsers(usersRes.data);
    } catch {}

    // Load existing todo for edit mode
    if (editId) {
      try {
        const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';
        const res = isAdmin
          ? await apiService.getTodos()
          : await apiService.getMyTodos();
        if (res.success) {
          const all = Array.isArray(res.data) ? res.data : [];
          const todo = all.find((t: any) => t.id === editId);
          if (todo) {
            setTitle(todo.title || '');
            setClientId(todo.client_id || '');
            setCompanyId(todo.company_id || '');
            setAssignedToUserId(todo.assigned_to_user_id || '');
            setStatus(todo.status || 'todo');
            setVisitReportId(todo.visit_report_id || '');
            if (todo.due_date) {
              setDueDate(new Date(todo.due_date).toISOString().split('T')[0]);
            }
          }
        }
      } catch {}
    }
    setLoadingData(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!title || !clientId || !companyId || !assignedToUserId) {
      setError('Fill in all required fields');
      return;
    }

    try {
      setLoading(true);

      if (isEdit) {
        const response = await apiService.updateTodo(editId!, {
          title,
          clientId: clientId,
          companyId: companyId,
          assignedToUserId,
          status,
          dueDate: dueDate || undefined,
        });
        if (response.success) {
          setSuccess('Task updated successfully');
          setTimeout(() => navigate('/tasks'), 1000);
        }
      } else {
        const response = await apiService.createTodo(
          title,
          clientId,
          companyId,
          assignedToUserId,
          dueDate ? new Date(dueDate).toISOString().split('T')[0] : undefined,
          visitReportId || undefined
        );
        if (response.success) {
          setSuccess('Task created successfully');
          setTimeout(() => navigate('/tasks'), 1000);
        }
      }
    } catch {
      setError(isEdit ? 'Error updating task' : 'Error creating task');
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="todo-form-container">
        <div className="todo-form-card">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="todo-form-container">
      <div className="todo-form-card">
        <h2>{isEdit ? 'Edit Task' : 'Create New Task'}</h2>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="title">Action *</label>
            <input
              id="title"
              type="text"
              placeholder="Describe the action..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="clientId">Client *</label>
              <select id="clientId" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Select client...</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="companyId">Company *</label>
              <select id="companyId" value={companyId} onChange={(e) => setCompanyId(e.target.value)} required>
                <option value="">Select company...</option>
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
              <label htmlFor="assignedToUserId">Assigned To *</label>
              <select id="assignedToUserId" value={assignedToUserId} onChange={(e) => setAssignedToUserId(e.target.value)} required>
                <option value="">Select user...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="dueDate">Due Date</label>
              <input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          {isEdit && (
            <div className="form-group">
              <label htmlFor="status">Status</label>
              <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todo">To Do</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option>
                <option value="done">Completed</option>
              </select>
            </div>
          )}

          {visitReportId && (
            <div className="info-note">
              This task is linked to a visit report
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Task')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/tasks')} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TodoForm;
