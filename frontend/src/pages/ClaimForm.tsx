import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Claim, ClaimMovement, Client, Company, User, TodoItem } from '../types';
import '../styles/Claims.css';

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

export const ClaimForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [movements, setMovements] = useState<ClaimMovement[]>([]);

  // Form state
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [date, setDate] = useState('');
  const [comments, setComments] = useState('');
  const [status, setStatus] = useState<string>('open');

  // New movement form
  const [newMovDate, setNewMovDate] = useState('');
  const [newMovAction, setNewMovAction] = useState('');
  const [newMovFiles, setNewMovFiles] = useState<File[]>([]);

  // Inline tasks (new)
  const [tasks, setTasks] = useState<{ title: string; assignedToUserId: string; dueDate: string; files: File[] }[]>([]);
  // Existing tasks linked to this claim
  const [existingTasks, setExistingTasks] = useState<TodoItem[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [addingMovement, setAddingMovement] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ---- Load data ----
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load clients
      try {
        const r = await apiService.getClients();
        if (r.success && r.data) {
          setClients(r.data.sort((a: Client, b: Client) => a.name.localeCompare(b.name)));
        }
      } catch {}

      // Load companies
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) {
          setCompanies(r.data.sort((a: Company, b: Company) => a.name.localeCompare(b.name)));
        }
      } catch {}

      // Load users
      try {
        const r = await apiService.getUsers();
        if (r.success && r.data) {
          setUsers(r.data.sort((a: User, b: User) => a.name.localeCompare(b.name)));
        }
      } catch {}

      // Load claim in edit mode
      if (isEdit && id) {
        try {
          const r = await apiService.getClaimById(id);
          if (r.success && r.data) {
            const claim: Claim = r.data;
            setClientId(claim.client_id);
            setCompanyId(claim.company_id);
            setDate(claim.date ? claim.date.substring(0, 10) : '');
            setComments(claim.comments || '');
            setStatus(claim.status);
            setMovements(claim.movements || []);
          }
        } catch {
          setError('Error loading claim');
        }

        // Load tasks linked to this claim
        try {
          const taskRes = await apiService.getTodosByClaimId(id);
          if (taskRes.success && taskRes.data) {
            setExistingTasks(taskRes.data);
          }
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  // ---- Submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      if (isEdit && id) {
        // Update
        const res = await apiService.updateClaim(id, {
          client_id: clientId,
          company_id: companyId,
          date,
          comments,
          status,
        });
        if (res.success) {
          // Create inline tasks
          await createInlineTasks(clientId, companyId, id);
          setSuccess('Claim updated');
          navigate('/claims');
        } else {
          setError(res.error || 'Error updating claim');
        }
      } else {
        // Create
        const res = await apiService.createClaim({
          client_id: clientId,
          company_id: companyId,
          date,
          comments,
        });
        if (res.success && res.data) {
          // Create inline tasks using the new claim's client/company
          await createInlineTasks(clientId, companyId, res.data.id);
          setSuccess('Claim created');
          navigate('/claims');
        } else {
          setError(res.error || 'Error creating claim');
        }
      }
    } catch (err) {
      setError((err as Error).message || 'Error saving claim');
    } finally {
      setSubmitting(false);
    }
  };

  const createInlineTasks = async (claimClientId: string, claimCompanyId: string, claimId?: string) => {
    for (const task of tasks) {
      if (task.title.trim()) {
        try {
          const todoRes = await apiService.createTodo(
            task.title,
            claimClientId,
            claimCompanyId,
            task.assignedToUserId || user?.id || '',
            task.dueDate || undefined,
            undefined, // visitReportId
            claimId,   // claimId
          );
          // Upload task attachments
          if (todoRes.success && todoRes.data?.id && task.files?.length > 0) {
            for (const file of task.files) {
              try {
                await apiService.uploadTodoAttachment(todoRes.data.id, file);
              } catch { /* non-blocking */ }
            }
          }
        } catch { /* non-blocking */ }
      }
    }
  };

  // ---- Movements ----
  const handleAddMovement = async () => {
    if (!id || !newMovDate || !newMovAction.trim()) return;
    setAddingMovement(true);
    try {
      const res = await apiService.addClaimMovement(id, {
        date: newMovDate,
        action: newMovAction,
      });
      if (res.success && res.data) {
        const newMovement = res.data;
        // Upload files for this movement
        if (newMovFiles.length > 0) {
          for (const file of newMovFiles) {
            try {
              await apiService.uploadClaimMovementAttachment(id, newMovement.id, file);
            } catch { /* non-blocking */ }
          }
        }
        // Reload claim to get updated movements with attachments
        try {
          const claimRes = await apiService.getClaimById(id);
          if (claimRes.success && claimRes.data) {
            setMovements(claimRes.data.movements || []);
          }
        } catch {}
        setNewMovDate('');
        setNewMovAction('');
        setNewMovFiles([]);
        setSuccess('Movement added');
      } else {
        setError(res.error || 'Error adding movement');
      }
    } catch {
      setError('Error adding movement');
    } finally {
      setAddingMovement(false);
    }
  };

  const handleDeleteMovement = async (movementId: string) => {
    if (!id || !window.confirm('Delete this movement?')) return;
    try {
      await apiService.deleteClaimMovement(id, movementId);
      setMovements(prev => prev.filter(m => m.id !== movementId));
      setSuccess('Movement deleted');
    } catch {
      setError('Error deleting movement');
    }
  };

  const handleDownloadAttachment = async (movementId: string, attachmentId: string, filename: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadClaimMovementAttachment(id, movementId, attachmentId);
      if (res.success && res.data?.url) {
        const a = document.createElement('a');
        a.href = res.data.url;
        a.download = filename;
        a.target = '_blank';
        a.click();
      }
    } catch {
      setError('Error downloading attachment');
    }
  };

  const handleDeleteAttachment = async (movementId: string, attachmentId: string) => {
    if (!id || !window.confirm('Delete this attachment?')) return;
    try {
      await apiService.deleteClaimMovementAttachment(id, movementId, attachmentId);
      // Update local state
      setMovements(prev => prev.map(m => {
        if (m.id === movementId) {
          return {
            ...m,
            attachments: (m.attachments || []).filter(a => a.id !== attachmentId),
          };
        }
        return m;
      }));
      setSuccess('Attachment deleted');
    } catch {
      setError('Error deleting attachment');
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="claim-form-page"><div className="claims-loading">Loading...</div></div>;
  }

  return (
    <div className="claim-form-page">
      {/* Header */}
      <div className="claim-form-header">
        <h1>{isEdit ? 'Edit Claim' : 'New Claim'}</h1>
        <button className="claim-form-back" onClick={() => navigate('/claims')}>
          &larr; Back to Claims
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="claims-alert claims-alert-error">{error}</div>}
      {success && <div className="claims-alert claims-alert-success">{success}</div>}

      {/* Form */}
      <div className="claim-form-card">
        <form onSubmit={handleSubmit}>
          <div className="claim-form-row">
            <div className="form-group">
              <label>Client *</label>
              <select value={clientId} onChange={e => setClientId(e.target.value)} required>
                <option value="">Select a client</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Company (Supplier) *</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} required>
                <option value="">Select a company</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="claim-form-row">
            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>
            {isEdit && (
              <div className="form-group">
                <label>Status</label>
                <select value={status} onChange={e => setStatus(e.target.value)}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Comments</label>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              rows={4}
              placeholder="Describe the claim details..."
            />
          </div>

          {/* ---- Movements Section (edit mode only) ---- */}
          {isEdit && id && (
            <div className="claim-movements-section">
              <h3>Movements</h3>

              {movements.length === 0 && (
                <p style={{ fontSize: '0.813rem', color: 'var(--color-text-tertiary)' }}>
                  No movements yet.
                </p>
              )}

              {movements.map(mov => (
                <div key={mov.id} className="claim-movement-item">
                  <div className="claim-movement-header">
                    <div>
                      <span className="claim-movement-date">{formatDate(mov.date)}</span>
                      {mov.created_by_user && (
                        <span className="claim-movement-by">by {mov.created_by_user.name}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="claim-movement-delete"
                      onClick={() => handleDeleteMovement(mov.id)}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="claim-movement-action">{mov.action}</div>

                  {(mov.attachments?.length ?? 0) > 0 && (
                    <div className="claim-movement-attachments">
                      {mov.attachments!.map(att => (
                        <span key={att.id} className="claim-attachment-chip">
                          {att.filename}
                          <button
                            type="button"
                            className="download-btn"
                            title="Download"
                            onClick={() => handleDownloadAttachment(mov.id, att.id, att.filename)}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </button>
                          <button
                            type="button"
                            className="delete-btn"
                            title="Delete"
                            onClick={() => handleDeleteAttachment(mov.id, att.id)}
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {/* Add new movement */}
              <div className="claim-add-movement">
                <h4>Add Movement</h4>
                <div className="claim-add-movement-row">
                  <input
                    type="date"
                    value={newMovDate}
                    onChange={e => setNewMovDate(e.target.value)}
                    placeholder="Date"
                  />
                  <textarea
                    value={newMovAction}
                    onChange={e => setNewMovAction(e.target.value)}
                    placeholder="Describe the action taken..."
                    rows={1}
                  />
                  <button
                    type="button"
                    className="claim-movement-add-btn"
                    onClick={handleAddMovement}
                    disabled={addingMovement || !newMovDate || !newMovAction.trim()}
                  >
                    {addingMovement ? 'Adding...' : 'Add'}
                  </button>
                </div>
                <div className="claim-add-movement-files">
                  <label className="claim-add-movement-file-label">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    Attach file
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
                      onChange={e => {
                        if (e.target.files) {
                          setNewMovFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {newMovFiles.map((file, idx) => (
                    <span key={idx} className="claim-add-movement-file-chip">
                      {file.name}
                      <button
                        type="button"
                        onClick={() => setNewMovFiles(prev => prev.filter((_, i) => i !== idx))}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ---- Tasks Section ---- */}
          <div className="claim-tasks-section">
            <h3>Tasks</h3>

            {/* Existing tasks linked to this claim */}
            {isEdit && existingTasks.length > 0 && (
              <div className="claim-existing-tasks">
                <table className="claim-existing-tasks-table">
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>Assigned To</th>
                      <th>Due Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {existingTasks.map(t => (
                      <tr key={t.id}>
                        <td>{t.title}</td>
                        <td>{t.assigned_to_user?.name || '-'}</td>
                        <td>{t.due_date ? formatDate(t.due_date) : '-'}</td>
                        <td>
                          <span className={`claim-task-status status-${t.status === 'done' ? 'resolved' : t.status}`}>
                            {t.status === 'todo' ? 'To Do' : t.status === 'in_progress' ? 'In Progress' : t.status === 'done' ? 'Done' : t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="claim-tasks-hint">
              Add follow-up tasks for this claim. They will be created when you save.
            </p>

            {tasks.map((task, idx) => (
              <div key={idx} className="claim-task-row">
                <div className="claim-task-fields">
                  <div className="form-group">
                    <label>Task *</label>
                    <input
                      type="text"
                      placeholder="e.g. Follow up with supplier..."
                      value={task.title}
                      onChange={e => {
                        const t = [...tasks];
                        t[idx].title = e.target.value;
                        setTasks(t);
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label>Assigned To</label>
                    <select
                      value={task.assignedToUserId}
                      onChange={e => {
                        const t = [...tasks];
                        t[idx].assignedToUserId = e.target.value;
                        setTasks(t);
                      }}
                    >
                      <option value="">Select user...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Due Date</label>
                    <input
                      type="date"
                      value={task.dueDate}
                      onChange={e => {
                        const t = [...tasks];
                        t[idx].dueDate = e.target.value;
                        setTasks(t);
                      }}
                    />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'end' }}>
                    <label className="claim-task-file-label">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                      Allega file
                      <input
                        type="file"
                        multiple
                        style={{ display: 'none' }}
                        onChange={e => {
                          if (e.target.files) {
                            const t = [...tasks];
                            t[idx].files = [...(t[idx].files || []), ...Array.from(e.target.files!)];
                            setTasks(t);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="claim-task-remove-btn"
                    onClick={() => setTasks(tasks.filter((_, i) => i !== idx))}
                  >
                    &times;
                  </button>
                </div>
                {/* Show attached files */}
                {(task.files || []).length > 0 && (
                  <div className="claim-task-file-row">
                    {task.files.map((file, fIdx) => (
                      <span key={fIdx} className="claim-task-file-chip">
                        {file.name}
                        <button
                          type="button"
                          onClick={() => {
                            const t = [...tasks];
                            t[idx].files = t[idx].files.filter((_, i) => i !== fIdx);
                            setTasks(t);
                          }}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <button
              type="button"
              className="claim-add-task-btn"
              onClick={() => setTasks([...tasks, { title: '', assignedToUserId: '', dueDate: '', files: [] }])}
            >
              + Add Task
            </button>
          </div>

          {/* Form actions */}
          <div className="claim-form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update Claim' : 'Create Claim'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/claims')}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClaimForm;
