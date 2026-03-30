import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company, User, CompanyVisitAttachment, TodoItem } from '../types';
import '../styles/CompanyVisits.css';

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'completed';
const TASK_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  todo: { label: 'To Do', color: '#947E35' },
  in_progress: { label: 'In Progress', color: '#4A6078' },
  waiting: { label: 'Waiting', color: '#6e6e73' },
  done: { label: 'Completed', color: '#4A7653' },
};

const CVTaskStatusPill: React.FC<{
  task: TodoItem;
  onStatusChange: (taskId: string, newStatus: string) => void;
}> = ({ task, onStatusChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const status = task.status === 'done' ? 'done' : (task.status in TASK_STATUS_CONFIG ? task.status : 'todo');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const cfg = TASK_STATUS_CONFIG[status] || TASK_STATUS_CONFIG.todo;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`task-status-pill status-${status === 'done' ? 'completed' : status}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <span className="status-dot" style={{ backgroundColor: cfg.color }} />
        {cfg.label}
      </button>
      {open && (
        <div className="task-status-dropdown">
          {Object.entries(TASK_STATUS_CONFIG).map(([key, val]) => (
            <button
              key={key}
              type="button"
              className={`task-status-option${key === status ? ' selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(task.id, key);
                setOpen(false);
              }}
            >
              <span className="status-dot" style={{ backgroundColor: val.color }} />
              {val.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const CompanyVisitForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const { user } = useAuth();

  // Data
  const [companies, setCompanies] = useState<Company[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Form state
  const [companyId, setCompanyId] = useState('');
  const [date, setDate] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState<string>('scheduled');
  const [participantsUserIds, setParticipantsUserIds] = useState<string[]>([]);
  const [participantsExternal, setParticipantsExternal] = useState('');
  const [report, setReport] = useState('');
  const [preparation, setPreparation] = useState('');

  // Attachments
  const [attachments, setAttachments] = useState<CompanyVisitAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tasks
  const [existingTasks, setExistingTasks] = useState<TodoItem[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

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
          setAllUsers(r.data.sort((a: User, b: User) => a.name.localeCompare(b.name)));
        }
      } catch {}

      // Load company visit in edit mode
      if (isEdit && id) {
        try {
          const r = await apiService.getCompanyVisitById(id);
          if (r.success && r.data) {
            const visit = r.data;
            setCompanyId(visit.company_id);
            setDate(visit.date ? visit.date.substring(0, 10) : '');
            setSubject(visit.subject || '');
            setStatus(visit.status || 'scheduled');
            setReport(visit.report || '');
            setPreparation(visit.preparation || '');
            setParticipantsExternal(visit.participants_external || '');

            // Parse participants_user_ids from JSON string
            if (visit.participants_user_ids) {
              try {
                const parsed = JSON.parse(visit.participants_user_ids);
                if (Array.isArray(parsed)) {
                  setParticipantsUserIds(parsed);
                }
              } catch {
                setParticipantsUserIds([]);
              }
            }
          }
        } catch {
          setError('Error loading company meeting');
        }

        // Load attachments
        try {
          const attRes = await apiService.getCompanyVisitAttachments(id);
          if (attRes.success && attRes.data) {
            setAttachments(attRes.data);
          }
        } catch {}

        // Load tasks linked to this company visit
        try {
          const taskRes = await apiService.getTodosByCompanyVisitId(id);
          if (taskRes.success && taskRes.data) {
            setExistingTasks(taskRes.data);
          }
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  };

  // ---- Participants toggle ----
  const toggleParticipant = (userId: string) => {
    setParticipantsUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(uid => uid !== userId)
        : [...prev, userId]
    );
  };

  // ---- Attachments ----
  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    if (isEdit && id) {
      // Edit mode: upload immediately
      setUploading(true);
      setError('');
      try {
        for (let i = 0; i < files.length; i++) {
          await apiService.uploadCompanyVisitAttachment(id, files[i]);
        }
        const attRes = await apiService.getCompanyVisitAttachments(id);
        if (attRes.success && attRes.data) {
          setAttachments(attRes.data);
        }
        setSuccess('File uploaded successfully');
      } catch {
        setError('Error uploading file');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
      // Create mode: queue files for upload after creation
      const newFiles = Array.from(files);
      setPendingFiles(prev => [...prev, ...newFiles]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteAttachment = async (attachmentId: string, filename: string) => {
    if (!id) return;
    if (!window.confirm(`Delete "${filename}"?`)) return;
    try {
      await apiService.deleteCompanyVisitAttachment(id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      setSuccess('Attachment deleted');
    } catch {
      setError('Error deleting attachment');
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadCompanyVisitAttachment(id, attachmentId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      setError('Error downloading attachment');
    }
  };

  // ---- Submit ----
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = {
        companyId,
        date,
        subject,
        report: report || undefined,
        preparation: preparation || undefined,
        participantsUserIds: participantsUserIds.length > 0 ? participantsUserIds : undefined,
        participantsExternal: participantsExternal || undefined,
        status,
      };

      if (isEdit && id) {
        const res = await apiService.updateCompanyVisit(id, payload);
        if (res.success) {
          setSuccess('Company meeting updated');
          navigate('/company-visits');
        } else {
          setError(res.error || 'Error updating company meeting');
        }
      } else {
        const res = await apiService.createCompanyVisit(payload);
        if (res.success && res.data) {
          // Upload pending files to the newly created visit
          if (pendingFiles.length > 0) {
            const newId = res.data.id;
            for (const file of pendingFiles) {
              try {
                await apiService.uploadCompanyVisitAttachment(newId, file);
              } catch {
                console.error('Failed to upload:', file.name);
              }
            }
          }
          setSuccess('Company meeting created');
          navigate('/company-visits');
        } else {
          setError(res.error || 'Error creating company meeting');
        }
      }
    } catch (err: any) {
      // Extract actual server error message from axios error
      const serverError = err?.response?.data?.error;
      const message = serverError || err?.message || 'Error saving company meeting';
      setError(message);
      console.error('CompanyVisitForm submit error:', err?.response?.data || err);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="cv-form-page"><div className="claims-loading">Loading...</div></div>;
  }

  return (
    <div className="cv-form-page">
      {/* Header */}
      <div className="cv-form-header">
        <h1>{isEdit ? 'Edit Supplier Meeting' : 'New Supplier Meeting'}</h1>
        <button className="cv-form-back" onClick={() => navigate(-1)}>
          &larr; Back
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="claims-alert claims-alert-error">{error}</div>}
      {success && <div className="claims-alert claims-alert-success">{success}</div>}

      {/* Form */}
      <div className="cv-form-card">
        <form onSubmit={handleSubmit}>
          <div className="cv-form-row">
            <div className="form-group">
              <label>Company *</label>
              <select value={companyId} onChange={e => setCompanyId(e.target.value)} required>
                <option value="">Select a company</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Date *</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="cv-form-row">
            <div className="form-group">
              <label>Subject *</label>
              <input
                type="text"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Visit subject..."
                required
              />
            </div>
            <div className="form-group">
              <label>Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="scheduled">Scheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Internal Participants */}
          <div className="form-group">
            <label>Participants - Internal</label>
            <div className="cv-participants-checkboxes">
              {allUsers.map(u => (
                <label key={u.id} className="cv-participant-checkbox">
                  <input
                    type="checkbox"
                    checked={participantsUserIds.includes(u.id)}
                    onChange={() => toggleParticipant(u.id)}
                  />
                  <span>{u.name}</span>
                </label>
              ))}
              {allUsers.length === 0 && (
                <span style={{ fontSize: '0.813rem', color: 'var(--color-text-tertiary)' }}>
                  No users available
                </span>
              )}
            </div>
          </div>

          {/* External Participants */}
          <div className="form-group">
            <label>Participants - External</label>
            <textarea
              value={participantsExternal}
              onChange={e => setParticipantsExternal(e.target.value)}
              rows={3}
              placeholder="External participant names (one per line or comma-separated)..."
            />
          </div>

          {/* Preparation / Pre-meeting Notes */}
          <div className="form-group">
            <label>Preparation / Pre-meeting Notes</label>
            <textarea
              className="cv-report-textarea"
              value={preparation}
              onChange={e => setPreparation(e.target.value)}
              rows={5}
              placeholder="Topics to discuss, questions to ask, materials to bring..."
            />
          </div>

          {/* Report */}
          <div className="form-group">
            <label>Report</label>
            <textarea
              className="cv-report-textarea"
              value={report}
              onChange={e => setReport(e.target.value)}
              rows={8}
              placeholder="Detailed meeting report..."
            />
          </div>

          {/* ---- Attachments Section ---- */}
          <div className="cv-attachments-section">
            <label>Attachments</label>

            {/* Drop zone */}
            <div
              className={`cv-attachment-dropzone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileSelect(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleFileSelect(e.target.files)}
              />
              {uploading ? (
                <span>Uploading...</span>
              ) : (
                <span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Drag files here or click to upload
                </span>
              )}
            </div>

            {/* Pending files (create mode) */}
            {!isEdit && pendingFiles.length > 0 && (
              <div className="cv-attachment-list">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="cv-attachment-item">
                    <div className="attachment-info">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">{formatFileSize(file.size)}</span>
                      <span className="attachment-pending-badge">Pending upload</span>
                    </div>
                    <button
                      type="button"
                      className="attachment-delete"
                      onClick={() => handleRemovePendingFile(idx)}
                      title="Remove"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Saved attachments (edit mode) */}
            {isEdit && attachments.length > 0 && (
              <div className="cv-attachment-list">
                {attachments.map((att) => (
                  <div key={att.id} className="cv-attachment-item">
                    <div className="attachment-info">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span className="attachment-name" onClick={() => handleDownloadAttachment(att.id)} title="Click to download">
                        {att.filename}
                      </span>
                      <span className="attachment-size">{formatFileSize(att.file_size)}</span>
                    </div>
                    <button
                      type="button"
                      className="attachment-delete"
                      onClick={() => handleDeleteAttachment(att.id, att.filename)}
                      title="Delete"
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Tasks Section ---- */}
          <div className="cv-tasks-section">
            <h3>Tasks</h3>

            {/* Existing tasks linked to this company visit */}
            {isEdit && existingTasks.length > 0 && (
              <div className="cv-existing-tasks">
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
                    {existingTasks.map(t => {
                      const cfg = TASK_STATUS_CONFIG[t.status] || TASK_STATUS_CONFIG.todo;
                      return (
                        <tr key={t.id}>
                          <td
                            style={{ cursor: 'pointer', color: 'var(--color-info)' }}
                            onClick={() => navigate(`/tasks?highlight=${t.id}`)}
                          >
                            {t.title}
                          </td>
                          <td>{t.assigned_to_user?.name || '-'}</td>
                          <td>{t.due_date ? formatDate(t.due_date) : '-'}</td>
                          <td>
                            <CVTaskStatusPill
                              task={t}
                              onStatusChange={async (taskId, newStatus) => {
                                try {
                                  await apiService.updateTodo(taskId, { status: newStatus });
                                  setExistingTasks(prev => prev.map(task =>
                                    task.id === taskId ? { ...task, status: newStatus as any } : task
                                  ));
                                } catch {}
                              }}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Button to create task */}
            {isEdit && id && (
              <button
                type="button"
                className="cv-add-task-btn"
                onClick={() => navigate(`/todos/new?companyId=${companyId}&companyVisitId=${id}`)}
              >
                + Add Task
              </button>
            )}
            {!isEdit && (
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>
                Save the company meeting first, then you can create tasks.
              </p>
            )}
          </div>

          {/* Form actions */}
          <div className="claim-form-actions">
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Saving...' : isEdit ? 'Update Visit' : 'Create Visit'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanyVisitForm;
