import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { TodoItem, Client, Company, User } from '../types';
import { MobileTaskForm } from './MobileTaskForm';
import '../styles/MobileTasks.css';

// ---- Status helpers ----
type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'completed';

const STATUS_CONFIG: Record<TaskStatus, { label: string }> = {
  todo:        { label: 'To Do' },
  in_progress: { label: 'In Progress' },
  waiting:     { label: 'Waiting' },
  completed:   { label: 'Done' },
};

const normalizeStatus = (s: string): TaskStatus => {
  if (s === 'done' || s === 'completed') return 'completed';
  if (s === 'in_progress') return 'in_progress';
  if (s === 'waiting') return 'waiting';
  return 'todo';
};

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

const formatDate = (d: string) => {
  const date = new Date(d);
  const today = new Date(new Date().toDateString());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateOnly = new Date(date.toDateString());

  if (dateOnly.getTime() === today.getTime()) return 'Today';
  if (dateOnly.getTime() === tomorrow.getTime()) return 'Tomorrow';

  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

// ---- Filter types ----
type StatusFilterType = '' | 'todo' | 'in_progress' | 'completed' | 'overdue';
type CategoryFilterType = '' | 'work' | 'personal' | 'architectural_lines';

// ---- Component ----
export const MobileTasks: React.FC = () => {
  const { user, login } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';
  const isStefano = !!(user?.name?.includes('Stefano') || user?.name?.includes('Bozzarelli'));

  // Login state (inline login when not authenticated)
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      await login(loginEmail, loginPassword);
    } catch {
      setLoginError('Invalid email or password');
    } finally {
      setLoginLoading(false);
    }
  };

  // Data
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterType>('');

  // UI
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Pull-to-refresh
  const listRef = useRef<HTMLDivElement>(null);
  const [pullY, setPullY] = useState(0);
  const [pulling, setPulling] = useState(false);
  const touchStartY = useRef(0);

  // Clear alerts
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 3000);
      return () => clearTimeout(t);
    }
  }, [success]);
  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 4000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ---- Data loading ----
  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [clientsRes, companiesRes, usersRes] = await Promise.allSettled([
        apiService.getClients(),
        apiService.getCompanies(),
        apiService.getUsers(),
      ]);
      if (clientsRes.status === 'fulfilled' && clientsRes.value.success && clientsRes.value.data) {
        setClients(clientsRes.value.data);
      }
      if (companiesRes.status === 'fulfilled' && companiesRes.value.success && companiesRes.value.data) {
        setCompanies(companiesRes.value.data);
      }
      if (usersRes.status === 'fulfilled' && usersRes.value.success && usersRes.value.data) {
        setUsers(usersRes.value.data);
      }
      await loadTodos();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadTodos = async () => {
    try {
      setSyncing(true);
      const response = isAdmin
        ? await apiService.getTodos({ sortBy: 'due_date' })
        : await apiService.getMyTodos({ sortBy: 'due_date' });

      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        const normalized = data.map((t: any) => ({
          ...t,
          status: normalizeStatus(t.status),
        }));
        // Sort: open first, then by due date
        normalized.sort((a: any, b: any) => {
          const so = (s: string) => (s === 'completed') ? 1 : 0;
          const d = so(a.status) - so(b.status);
          if (d !== 0) return d;
          const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
          const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
          return da - db;
        });
        setTodos(normalized);
      }
    } catch {
      setError('Error loading tasks');
    } finally {
      setSyncing(false);
    }
  };

  // ---- Pull-to-refresh ----
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const el = listRef.current;
    if (el && el.scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0 && dy < 120) {
      setPullY(dy);
    }
  }, [pulling]);

  const handleTouchEnd = useCallback(() => {
    if (pullY > 60) {
      loadTodos();
    }
    setPullY(0);
    setPulling(false);
  }, [pullY]);

  // ---- Actions ----
  const handleStatusChange = async (todoId: string, newStatus: TaskStatus) => {
    try {
      setTodos((prev) =>
        prev.map((t) => (t.id === todoId ? { ...t, status: newStatus as any } : t))
      );
      await apiService.updateTodo(todoId, { status: statusToApi(newStatus) });
      setSuccess('Status updated');
    } catch {
      setError('Error updating status');
      loadTodos();
    }
  };

  const handleCreateTask = async (data: {
    title: string;
    category: string;
    priority: number;
    dueDate: string;
    clientId: string;
    companyId: string;
    assignedToUserId: string;
  }) => {
    try {
      await apiService.createTodo(
        data.title,
        data.clientId,
        data.companyId,
        data.assignedToUserId,
        data.dueDate || undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        data.priority,
        undefined,
        data.category
      );
      setSuccess('Task created');
      setShowForm(false);
      loadTodos();
    } catch {
      setError('Error creating task');
    }
  };

  // ---- Computed ----
  const getClientName = useCallback(
    (id: string) => clients.find((c) => c.id === id)?.name || '',
    [clients]
  );
  const getCompanyName = useCallback(
    (id: string) => companies.find((c) => c.id === id)?.name || '',
    [companies]
  );
  const getUserName = useCallback(
    (id: string) => users.find((u) => u.id === id)?.name || '',
    [users]
  );

  const overdueCount = useMemo(
    () => todos.filter((t) => isOverdue(t.due_date, t.status)).length,
    [todos]
  );

  const visibleTodos = useMemo(() => {
    let list = todos;

    // Status filter
    if (statusFilter === 'overdue') {
      list = list.filter((t) => isOverdue(t.due_date, t.status));
    } else if (statusFilter) {
      list = list.filter((t) => normalizeStatus(t.status) === statusFilter);
    } else {
      // By default hide completed
      list = list.filter((t) => normalizeStatus(t.status) !== 'completed');
    }

    // Category filter
    if (categoryFilter) {
      list = list.filter((t) => t.category === categoryFilter);
    }

    return list;
  }, [todos, statusFilter, categoryFilter]);

  // ---- Render ----
  if (loading) {
    return <div className="mt-loading">Loading tasks...</div>;
  }

  // If not logged in, show inline login
  if (!user) {
    return (
      <div className="mt-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: '320px', padding: '2rem' }}>
          <h1 style={{ fontSize: '1.5rem', textAlign: 'center', marginBottom: '1.5rem', color: '#333' }}>TradeFlow Tasks</h1>
          {loginError && <p style={{ color: '#c00', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>{loginError}</p>}
          <input type="email" placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required
            style={{ width: '100%', padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box' }} />
          <input type="password" placeholder="Password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required
            style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem', border: '1px solid #ddd', borderRadius: '8px', fontSize: '1rem', boxSizing: 'border-box' }} />
          <button type="submit" disabled={loginLoading}
            style={{ width: '100%', padding: '0.75rem', background: '#4A6078', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
            {loginLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-page">
      {/* Top bar */}
      <div className="mt-topbar">
        <div className="mt-topbar-left">
          <span className="mt-topbar-title">{isAdmin ? 'Tasks' : 'My Tasks'}</span>
        </div>
        <div className="mt-topbar-right">
          <span
            className={`mt-sync-dot${syncing ? ' syncing' : ''}`}
            title={syncing ? 'Syncing...' : 'Synced'}
          />
          <div className="mt-avatar" title={user?.name || ''}>
            {user?.name ? getInitials(user.name) : '?'}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="mt-alert error">{error}</div>}
      {success && <div className="mt-alert success">{success}</div>}

      {/* Filters */}
      <div className="mt-filters">
        {/* Status chips */}
        <div className="mt-filter-row">
          {([
            { value: '' as StatusFilterType, label: 'All' },
            { value: 'todo' as StatusFilterType, label: 'To Do' },
            { value: 'in_progress' as StatusFilterType, label: 'In Progress' },
            { value: 'completed' as StatusFilterType, label: 'Done' },
            { value: 'overdue' as StatusFilterType, label: 'Overdue' },
          ] as const).map((f) => (
            <button
              key={f.value}
              className={`mt-chip${
                statusFilter === f.value
                  ? f.value === 'overdue'
                    ? ' active-red'
                    : ' active'
                  : ''
              }`}
              onClick={() => setStatusFilter(f.value)}
            >
              {f.label}
              {f.value === 'overdue' && overdueCount > 0 && statusFilter !== 'overdue' && (
                <span className="mt-chip-badge">{overdueCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Category chips */}
        <div className="mt-filter-row">
          {([
            { value: '' as CategoryFilterType, label: 'All' },
            { value: 'work' as CategoryFilterType, label: 'Work' },
            { value: 'personal' as CategoryFilterType, label: 'Personal' },
            ...(isStefano
              ? [{ value: 'architectural_lines' as CategoryFilterType, label: 'Arch Lines' }]
              : []),
          ] as const).map((f) => (
            <button
              key={f.value}
              className={`mt-chip${categoryFilter === f.value ? ' active' : ''}`}
              onClick={() => setCategoryFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div
        className="mt-list-wrap"
        ref={listRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull indicator */}
        {pullY > 10 && (
          <div className="mt-pull-indicator" style={{ opacity: Math.min(pullY / 60, 1) }}>
            {pullY > 60 ? 'Release to refresh' : 'Pull to refresh'}
          </div>
        )}

        <div className="mt-task-count">
          {visibleTodos.length} task{visibleTodos.length !== 1 ? 's' : ''}
        </div>

        {visibleTodos.length === 0 ? (
          <div className="mt-empty">
            <div className="mt-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <div className="mt-empty-text">No tasks found</div>
            <div className="mt-empty-hint">Try adjusting your filters or tap + to create one</div>
          </div>
        ) : (
          visibleTodos.map((todo) => {
            const status = normalizeStatus(todo.status);
            const overdueRow = isOverdue(todo.due_date, todo.status);
            const soonRow = isDueSoon(todo.due_date, todo.status);
            const isExpanded = expandedId === todo.id;
            const clientName = getClientName(todo.client_id);
            const companyName = getCompanyName(todo.company_id);
            const assigneeName = getUserName(todo.assigned_to_user_id);

            return (
              <div
                key={todo.id}
                className={`mt-card${isExpanded ? ' expanded' : ''}${overdueRow ? ' overdue' : ''}`}
                onClick={() => setExpandedId(isExpanded ? null : todo.id)}
              >
                <div className="mt-card-header">
                  <div className="mt-card-main">
                    <div className="mt-card-title">{todo.title}</div>
                    <div className="mt-card-meta">
                      {clientName && <span className="mt-card-client">{clientName}</span>}
                      {todo.due_date && (
                        <span
                          className={`mt-card-due${overdueRow ? ' overdue' : soonRow ? ' soon' : ''}`}
                        >
                          {formatDate(todo.due_date)}
                        </span>
                      )}
                      <span className={`mt-status-pill ${status}`}>
                        <span className="mt-status-dot" />
                        {STATUS_CONFIG[status].label}
                      </span>
                      {todo.category && todo.category !== 'work' && (
                        <span
                          className={`mt-cat-badge ${
                            todo.category === 'personal' ? 'personal' : 'arch'
                          }`}
                        >
                          {todo.category === 'personal' ? 'Personal' : 'Arch Lines'}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-stars">
                    {[1, 2, 3].map((n) => (
                      <span
                        key={n}
                        className={`mt-star${n <= (todo.priority || 1) ? ' filled' : ''}`}
                      >
                        {n <= (todo.priority || 1) ? '\u2605' : '\u2606'}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Expanded detail */}
                <div className="mt-card-detail">
                  {(todo as any).description && (
                    <div className="mt-detail-desc">{(todo as any).description}</div>
                  )}
                  {assigneeName && (
                    <div className="mt-detail-row">
                      <span className="mt-detail-label">Assigned to</span>
                      <span className="mt-detail-value">{assigneeName}</span>
                    </div>
                  )}
                  {companyName && (
                    <div className="mt-detail-row">
                      <span className="mt-detail-label">Company</span>
                      <span className="mt-detail-value">{companyName}</span>
                    </div>
                  )}
                  {clientName && (
                    <div className="mt-detail-row">
                      <span className="mt-detail-label">Client</span>
                      <span className="mt-detail-value">{clientName}</span>
                    </div>
                  )}
                  {todo.due_date && (
                    <div className="mt-detail-row">
                      <span className="mt-detail-label">Due date</span>
                      <span className="mt-detail-value">
                        {new Date(todo.due_date).toLocaleDateString('en-GB', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  )}
                  <div className="mt-detail-row">
                    <span className="mt-detail-label">Priority</span>
                    <span className="mt-detail-value">
                      {[1, 2, 3].map((n) => (
                        <span
                          key={n}
                          style={{ color: n <= (todo.priority || 1) ? '#ffcc00' : '#d1d1d6' }}
                        >
                          {n <= (todo.priority || 1) ? '\u2605' : '\u2606'}
                        </span>
                      ))}
                    </span>
                  </div>

                  {/* Status change buttons */}
                  <div className="mt-status-actions">
                    {(['todo', 'in_progress', 'completed'] as TaskStatus[]).map((s) => (
                      <button
                        key={s}
                        className={`mt-status-btn ${s}${status === s ? ' current' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (s !== status) handleStatusChange(todo.id, s);
                        }}
                      >
                        {STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FAB */}
      <button className="mt-fab" onClick={() => setShowForm(true)} aria-label="New task">
        +
      </button>

      {/* Bottom nav */}
      <div className="mt-bottom-nav">
        <button className="mt-nav-item active">
          <svg
            className="mt-nav-icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
          <span className="mt-nav-label">Tasks</span>
        </button>
        <button
          className={`mt-nav-item${statusFilter === 'overdue' ? ' active' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'overdue' ? '' : 'overdue')}
        >
          <svg
            className="mt-nav-icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="mt-nav-label">Overdue</span>
          {overdueCount > 0 && <span className="mt-nav-badge">{overdueCount}</span>}
        </button>
      </div>

      {/* Task creation form */}
      {showForm && (
        <MobileTaskForm
          clients={clients}
          companies={companies}
          users={users}
          currentUserId={user?.id || ''}
          isStefano={isStefano}
          onSave={handleCreateTask}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

export default MobileTasks;
