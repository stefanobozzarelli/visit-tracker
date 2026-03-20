import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { TodoItem, Client, Company, User } from '../types';
import axios from 'axios';
import { config } from '../config';
import '../styles/Tasks.css';

const API_BASE_URL = config.API_BASE_URL;

// ---- Status helpers ----
type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'completed';

const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string }> = {
  todo:        { label: 'To Do',       dot: '#ff9500' },
  in_progress: { label: 'In Progress', dot: '#007aff' },
  waiting:     { label: 'Waiting',     dot: '#8e8e93' },
  completed:   { label: 'Completed',   dot: '#34c759' },
};

const normalizeStatus = (s: string): TaskStatus => {
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'waiting') return 'waiting';
  return 'todo';
};

// Map display status back to API value
const statusToApi = (s: TaskStatus): string => {
  if (s === 'completed') return 'done';
  return s;
};

// ---- Date helpers ----
const isOverdue = (dueDate?: string, status?: string): boolean => {
  if (!dueDate || status === 'completed' || status === 'done') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
};

const isDueSoon = (dueDate?: string, status?: string): boolean => {
  if (!dueDate || status === 'completed' || status === 'done') return false;
  const d = new Date(dueDate);
  const today = new Date(new Date().toDateString());
  const in3Days = new Date(today);
  in3Days.setDate(in3Days.getDate() + 3);
  return d >= today && d <= in3Days;
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

// ---- Component ----
export const Tasks: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Data
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Filters
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [assignedToUserId, setAssignedToUserId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [thisWeek, setThisWeek] = useState(false);
  const [next7Days, setNext7Days] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [localSearch, setLocalSearch] = useState('');

  // NLP search
  const [nlpQuery, setNlpQuery] = useState('');
  const [nlpResults, setNlpResults] = useState<TodoItem[] | null>(null);
  const [nlpSearching, setNlpSearching] = useState(false);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openStatusId, setOpenStatusId] = useState<string | null>(null);
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);

  // Refs for click-outside
  const statusRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openStatusId && statusRef.current && !statusRef.current.contains(e.target as Node)) {
        setOpenStatusId(null);
      }
      if (openMoreId && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setOpenMoreId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openStatusId, openMoreId]);

  // Clear alerts
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // Highlight task from URL param
  useEffect(() => {
    const hId = searchParams.get('highlight');
    if (hId) {
      setHighlightId(hId);
      // Clear filters to make sure the task is visible
      setClientId('');
      setCompanyId('');
      setAssignedToUserId('');
      setStatusFilter('');
      // Auto-clear highlight after 5 seconds
      const t = setTimeout(() => setHighlightId(null), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  // Scroll to highlighted task after data loads
  useEffect(() => {
    if (highlightId && todos.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`task-row-${highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
    }
  }, [highlightId, todos]);

  // ---- Data loading ----
  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadTodos(); }, [clientId, companyId, assignedToUserId, overdue, thisWeek, next7Days]);

  const loadData = async () => {
    try {
      setLoading(true);
      try {
        const r = await apiService.getClients();
        if (r.success && r.data) setClients(r.data);
      } catch {}
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) setCompanies(r.data);
      } catch {}
      try {
        const r = await apiService.getUsers();
        if (r.success && r.data) setUsers(r.data);
      } catch {}
      await loadTodos();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const sortTodos = (items: TodoItem[]): TodoItem[] => {
    return [...items].sort((a, b) => {
      const so = (s: string) => (s === 'completed' || s === 'done') ? 1 : 0;
      const d = so(a.status) - so(b.status);
      if (d !== 0) return d;
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      return da - db;
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

      const response = isAdmin
        ? await apiService.getTodos(filters)
        : await apiService.getMyTodos(filters);

      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        const normalized = data.map((t: any) => ({
          ...t,
          status: normalizeStatus(t.status),
        }));
        setTodos(sortTodos(normalized));
        setNlpResults(null);
      }
    } catch {
      setError('Error loading tasks');
    }
  };

  // ---- Actions ----
  const handleStatusChange = async (todoId: string, newStatus: TaskStatus) => {
    setOpenStatusId(null);
    try {
      setTodos(prev => prev.map(t => t.id === todoId ? { ...t, status: newStatus as any } : t));
      await apiService.updateTodo(todoId, { status: statusToApi(newStatus) });
      setSuccess('Status updated');
    } catch {
      setError('Error updating status');
      loadTodos();
    }
  };

  const handleDelete = async (todoId: string) => {
    setOpenMoreId(null);
    if (!window.confirm('Delete this task?')) return;
    try {
      await apiService.deleteTodo(todoId);
      setSuccess('Task deleted');
      loadTodos();
    } catch {
      setError('Error deleting task');
    }
  };

  // NLP search
  const handleNlpSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpQuery.trim()) return;
    try {
      setNlpSearching(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/search/todos`,
        { query: nlpQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        const normalized = (res.data.data || []).map((t: any) => ({
          ...t,
          status: normalizeStatus(t.status),
        }));
        setNlpResults(normalized);
      }
    } catch {
      setError('Search failed');
    } finally {
      setNlpSearching(false);
    }
  };

  const clearNlpSearch = () => {
    setNlpQuery('');
    setNlpResults(null);
  };

  // ---- Computed data ----
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '-', [clients]);
  const getCompanyName = useCallback((id: string) => companies.find(c => c.id === id)?.name || '-', [companies]);
  const getUserName = useCallback((id: string) => users.find(u => u.id === id)?.name || '-', [users]);

  // KPIs computed from full todo list (before filtering)
  const kpis = useMemo(() => {
    const now = new Date(new Date().toDateString());
    const endOfWeek = new Date(now);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

    let open = 0, overdueCount = 0, dueThisWeek = 0, completed = 0;
    for (const t of todos) {
      const s = normalizeStatus(t.status);
      if (s === 'completed') { completed++; continue; }
      open++;
      if (t.due_date) {
        const d = new Date(t.due_date);
        if (d < now) overdueCount++;
        else if (d <= endOfWeek) dueThisWeek++;
      }
    }
    return { open, overdue: overdueCount, dueThisWeek, completed };
  }, [todos]);

  // Visible rows: apply status filter, search, show completed, NLP results
  const visibleTodos = useMemo(() => {
    let list = nlpResults !== null ? nlpResults : todos;

    // Status filter
    if (statusFilter) {
      list = list.filter(t => normalizeStatus(t.status) === statusFilter);
    }

    // Show completed toggle
    if (!showCompleted) {
      list = list.filter(t => normalizeStatus(t.status) !== 'completed');
    }

    // Local text search
    if (localSearch.trim()) {
      const q = localSearch.toLowerCase();
      list = list.filter(t => {
        const title = t.title?.toLowerCase() || '';
        const client = getClientName(t.client_id).toLowerCase();
        const company = getCompanyName(t.company_id).toLowerCase();
        const assignee = getUserName(t.assigned_to_user_id).toLowerCase();
        return title.includes(q) || client.includes(q) || company.includes(q) || assignee.includes(q);
      });
    }

    return list;
  }, [todos, nlpResults, statusFilter, showCompleted, localSearch, getClientName, getCompanyName, getUserName]);

  // ---- Render ----
  if (loading) {
    return <div className="tasks-page"><div className="tasks-loading">Loading tasks...</div></div>;
  }

  return (
    <div className="tasks-page">
      {/* Header */}
      <div className="tasks-header">
        <div className="tasks-header-left">
          <h1>{isAdmin ? 'Tasks' : 'My Tasks'}</h1>
          <p className="tasks-header-subtitle">Track follow-ups, reminders and team actions</p>
        </div>
        <button className="tasks-btn-new" onClick={() => navigate('/todos/new')}>
          + New Task
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="tasks-alert tasks-alert-error">{error}</div>}
      {success && <div className="tasks-alert tasks-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="tasks-kpi-row">
        <div className="tasks-kpi">
          <div className="tasks-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          </div>
          <div className="tasks-kpi-body">
            <div className="tasks-kpi-value">{kpis.open}</div>
            <div className="tasks-kpi-label">Open Tasks</div>
          </div>
        </div>
        <div className="tasks-kpi">
          <div className="tasks-kpi-icon red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div className="tasks-kpi-body">
            <div className={`tasks-kpi-value${kpis.overdue > 0 ? ' alert' : ''}`}>{kpis.overdue}</div>
            <div className="tasks-kpi-label">Overdue</div>
          </div>
        </div>
        <div className="tasks-kpi">
          <div className="tasks-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div className="tasks-kpi-body">
            <div className="tasks-kpi-value">{kpis.dueThisWeek}</div>
            <div className="tasks-kpi-label">Due This Week</div>
          </div>
        </div>
        <div className="tasks-kpi">
          <div className="tasks-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="tasks-kpi-body">
            <div className="tasks-kpi-value">{kpis.completed}</div>
            <div className="tasks-kpi-label">Completed</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="tasks-toolbar">
        <div className="tasks-filters-row">
          <input
            type="text"
            className="tasks-search-input"
            placeholder="Search tasks..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />

          <select
            className={`tasks-filter-select${clientId ? ' active' : ''}`}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`tasks-filter-select${companyId ? ' active' : ''}`}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`tasks-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting">Waiting</option>
            <option value="completed">Completed</option>
          </select>

          {isAdmin && (
            <select
              className={`tasks-filter-select${assignedToUserId ? ' active' : ''}`}
              value={assignedToUserId}
              onChange={e => setAssignedToUserId(e.target.value)}
            >
              <option value="">All Assignees</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}

          <div className="tasks-filter-divider" />

          {/* Show warning if filters are active */}
          {(clientId || companyId || assignedToUserId || statusFilter || overdue || thisWeek || next7Days) && (
            <button
              type="button"
              className="tasks-chip"
              onClick={() => {
                setClientId('');
                setCompanyId('');
                setAssignedToUserId('');
                setStatusFilter('');
                setOverdue(false);
                setThisWeek(false);
                setNext7Days(false);
                setLocalSearch('');
              }}
              style={{ background: '#fff3cd', color: '#856404', borderColor: '#ffc107' }}
            >
              ✕ Reset Filters
            </button>
          )}

          {/* Quick filter chips */}
          <div className="tasks-chips">
            <button
              className={`tasks-chip${overdue ? ' active chip-red' : ''}`}
              onClick={() => setOverdue(!overdue)}
            >
              <span className="tasks-chip-dot" />
              Overdue
            </button>
            <button
              className={`tasks-chip${thisWeek ? ' active chip-orange' : ''}`}
              onClick={() => setThisWeek(!thisWeek)}
            >
              <span className="tasks-chip-dot" />
              This Week
            </button>
            <button
              className={`tasks-chip${next7Days ? ' active' : ''}`}
              onClick={() => setNext7Days(!next7Days)}
            >
              <span className="tasks-chip-dot" />
              Next 7 Days
            </button>
            <button
              className={`tasks-chip${showCompleted ? ' active' : ''}`}
              onClick={() => setShowCompleted(!showCompleted)}
            >
              <span className="tasks-chip-dot" />
              Completed
            </button>
          </div>
        </div>

        {/* NLP search — subtle, secondary row */}
        <form className="tasks-nlp-row" onSubmit={handleNlpSearch}>
          <input
            type="text"
            className="tasks-nlp-input"
            placeholder="Natural language search... e.g. &quot;overdue tasks for client X&quot;"
            value={nlpQuery}
            onChange={e => setNlpQuery(e.target.value)}
            disabled={nlpSearching}
          />
          <button type="submit" className="tasks-nlp-btn" disabled={nlpSearching || !nlpQuery.trim()}>
            {nlpSearching ? 'Searching...' : 'AI Search'}
          </button>
          {nlpResults !== null && (
            <button type="button" className="tasks-nlp-clear" onClick={clearNlpSearch}>
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="tasks-table-wrap">
        {visibleTodos.length > 0 && (
          <div className="tasks-result-count">
            {visibleTodos.length} task{visibleTodos.length !== 1 ? 's' : ''}
            {nlpResults !== null && ' (AI search results)'}
          </div>
        )}

        {visibleTodos.length === 0 ? (
          <div className="tasks-empty">
            <div className="tasks-empty-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></div>
            <div className="tasks-empty-text">No tasks found</div>
            <div className="tasks-empty-hint">Try adjusting your filters or create a new task</div>
          </div>
        ) : (
          <div className="tasks-table-scroll">
            <table className="tasks-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Client / Company</th>
                  <th>Assigned To</th>
                  <th>Status</th>
                  <th>Due Date</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleTodos.map(todo => {
                  const status = normalizeStatus(todo.status);
                  const overdueRow = isOverdue(todo.due_date, todo.status);
                  const soonRow = isDueSoon(todo.due_date, todo.status);
                  const assigneeName = getUserName(todo.assigned_to_user_id);
                  const createdByName = (todo as any).created_by_user?.name;

                  const sourceLabel = ((todo as any).visit_report_id || (todo as any).visit_id) ? 'Visit' : (todo as any).claim_id ? 'Claim' : null;

                  return (
                    <tr
                      key={todo.id}
                      id={`task-row-${todo.id}`}
                      className={`${overdueRow ? 'row-overdue' : ''}${status === 'completed' ? ' row-completed' : ''}${highlightId === todo.id ? ' row-highlighted' : ''}`}
                      onDoubleClick={() => navigate(`/todos/edit/${todo.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Task title */}
                      <td className="task-title-cell">
                        <div className="task-title">
                          {todo.title}
                          {(todo.attachments?.length ?? 0) > 0 && (
                            <span className="task-attachment-badge" title={`${todo.attachments!.length} allegat${todo.attachments!.length === 1 ? 'o' : 'i'}`}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle' }}>
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                              </svg>
                              {todo.attachments!.length}
                            </span>
                          )}
                        </div>
                        {createdByName && (
                          <div className="task-created-by">by {createdByName}</div>
                        )}
                        {sourceLabel && (
                          <span
                            className="task-source-label task-source-link"
                            onClick={(e) => {
                              e.stopPropagation();
                              if ((todo as any).visit_report_id || (todo as any).visit_id) {
                                const vId = (todo as any).visit_id || (todo as any).visit_report?.visit_id || '';
                                if (vId) {
                                  navigate(`/visits/${vId}`);
                                }
                              } else if ((todo as any).claim_id) {
                                navigate(`/claims/${(todo as any).claim_id}/edit`);
                              }
                            }}
                          >
                            {sourceLabel}
                          </span>
                        )}
                      </td>

                      {/* Client / Company */}
                      <td className="task-context">
                        <div className="task-client-name">{getClientName(todo.client_id)}</div>
                        <div className="task-company-name">{getCompanyName(todo.company_id)}</div>
                      </td>

                      {/* Assigned To */}
                      <td>
                        <div className="task-assignee">
                          <span className="task-avatar">{getInitials(assigneeName)}</span>
                          <span className="task-assignee-name">{assigneeName}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td>
                        <div
                          className="task-status-wrap"
                          ref={openStatusId === todo.id ? statusRef : undefined}
                        >
                          <button
                            className={`task-status-pill status-${status}`}
                            onClick={() => setOpenStatusId(openStatusId === todo.id ? null : todo.id)}
                          >
                            <span className="status-dot" />
                            {STATUS_CONFIG[status].label}
                          </button>
                          {openStatusId === todo.id && (
                            <div className="task-status-dropdown">
                              {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
                                <button
                                  key={s}
                                  className={`task-status-option${s === status ? ' selected' : ''}`}
                                  onClick={() => handleStatusChange(todo.id, s)}
                                >
                                  <span className="status-dot" style={{ color: STATUS_CONFIG[s].dot }} />
                                  {STATUS_CONFIG[s].label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Due date */}
                      <td>
                        {todo.due_date ? (
                          <span className={`task-due${overdueRow ? ' overdue' : soonRow ? ' soon' : ''}`}>
                            {formatDate(todo.due_date)}
                          </span>
                        ) : (
                          <span className="task-due">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="task-actions">
                          <button
                            className="task-action-btn primary"
                            onClick={() => navigate(`/todos/edit/${todo.id}`)}
                          >
                            Edit
                          </button>
                          <div
                            className="task-more-wrap"
                            ref={openMoreId === todo.id ? moreRef : undefined}
                          >
                            <button
                              className="task-more-btn"
                              onClick={() => setOpenMoreId(openMoreId === todo.id ? null : todo.id)}
                            >
                              &#x22EE;
                            </button>
                            {openMoreId === todo.id && (
                              <div className="task-more-menu">
                                <button
                                  className="task-more-item danger"
                                  onClick={() => handleDelete(todo.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Tasks;
