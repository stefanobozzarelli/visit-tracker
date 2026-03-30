import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Client, Company, User, TodoAttachment } from '../types';
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
  const [visitId, setVisitId] = useState('');
  const [claimId, setClaimId] = useState('');
  const [companyVisitId, setCompanyVisitId] = useState('');
  const [opportunityId, setOpportunityId] = useState('');
  const [status, setStatus] = useState('todo');
  const [priority, setPriority] = useState(1);
  const [category, setCategory] = useState('work');

  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Attachments - saved (edit mode)
  const [attachments, setAttachments] = useState<TodoAttachment[]>([]);
  // Pending files - not yet uploaded (create mode)
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const urlClientId = searchParams.get('clientId');
    const urlCompanyId = searchParams.get('companyId');
    const urlVisitReportId = searchParams.get('visitReportId');
    const urlVisitId = searchParams.get('visitId');
    const urlClaimId = searchParams.get('claimId');
    const urlCompanyVisitId = searchParams.get('companyVisitId');
    const urlOpportunityId = searchParams.get('opportunityId');

    if (urlClientId) setClientId(urlClientId);
    if (urlCompanyId) setCompanyId(urlCompanyId);
    if (urlVisitReportId) setVisitReportId(urlVisitReportId);
    if (urlVisitId) setVisitId(urlVisitId);
    if (urlClaimId) setClaimId(urlClaimId);
    if (urlCompanyVisitId) setCompanyVisitId(urlCompanyVisitId);
    if (urlOpportunityId) setOpportunityId(urlOpportunityId);

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
            setPriority(todo.priority || 1);
            setCategory(todo.category || 'work');
            setVisitReportId(todo.visit_report_id || '');
            setVisitId(todo.visit_id || '');
            setClaimId(todo.claim_id || '');
            setCompanyVisitId(todo.company_visit_id || '');
            if (todo.due_date) {
              setDueDate(new Date(todo.due_date).toISOString().split('T')[0]);
            }
          }
        }
      } catch {}

      // Load attachments
      try {
        const attRes = await apiService.getTodoAttachments(editId);
        if (attRes.success && attRes.data) {
          setAttachments(attRes.data);
        }
      } catch {}
    }
    setLoadingData(false);
  };

  // Handle file selection - in edit mode upload immediately, in create mode queue
  const handleFileSelect = async (files: FileList | null) => {
    if (!files) return;

    if (isEdit && editId) {
      // Edit mode: upload immediately
      setUploading(true);
      setError('');
      try {
        for (let i = 0; i < files.length; i++) {
          await apiService.uploadTodoAttachment(editId, files[i]);
        }
        const attRes = await apiService.getTodoAttachments(editId);
        if (attRes.success && attRes.data) {
          setAttachments(attRes.data);
        }
        setSuccess('File caricato con successo');
        setTimeout(() => setSuccess(''), 3000);
      } catch {
        setError('Errore durante il caricamento del file');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } else {
      // Create mode: queue files for upload after task creation
      const newFiles = Array.from(files);
      setPendingFiles(prev => [...prev, ...newFiles]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDeleteAttachment = async (attachmentId: string, filename: string) => {
    if (!editId) return;
    if (!window.confirm(`Eliminare "${filename}"?`)) return;
    try {
      await apiService.deleteTodoAttachment(editId, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch {
      setError('Errore durante la cancellazione');
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    if (!editId) return;
    try {
      const res = await apiService.downloadTodoAttachment(editId, attachmentId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      setError('Errore durante il download');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
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
      const returnTo = searchParams.get('returnTo');
      const navigateAfterSave = () => navigate(returnTo || '/tasks');

      if (isEdit) {
        const response = await apiService.updateTodo(editId!, {
          title,
          clientId: clientId,
          companyId: companyId,
          assignedToUserId,
          status,
          dueDate: dueDate || undefined,
          priority,
          category,
        });
        if (response.success) {
          setSuccess('Task updated successfully');
          setTimeout(navigateAfterSave, 1000);
        }
      } else {
        const response = await apiService.createTodo(
          title,
          clientId,
          companyId,
          assignedToUserId,
          dueDate ? new Date(dueDate).toISOString().split('T')[0] : undefined,
          visitReportId || undefined,
          claimId || undefined,
          visitId || undefined,
          companyVisitId || undefined,
          priority,
          opportunityId || undefined,
          category
        );
        if (response.success && response.data?.id) {
          // Upload pending files to the newly created task
          if (pendingFiles.length > 0) {
            setSuccess('Task creato, caricamento allegati...');
            for (const file of pendingFiles) {
              try {
                await apiService.uploadTodoAttachment(response.data.id, file);
              } catch {
                console.error('Failed to upload:', file.name);
              }
            }
          }
          setSuccess('Task created successfully');
          setTimeout(navigateAfterSave, 1000);
        } else if (response.success) {
          setSuccess('Task created successfully');
          setTimeout(navigateAfterSave, 1000);
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

          <div className="form-group">
            <label>Priority</label>
            <div className="priority-star-selector">
              {[1, 2, 3].map(n => (
                <span
                  key={n}
                  className={`priority-star${n <= priority ? ' active' : ''}`}
                  onClick={() => setPriority(n)}
                  title={n === 1 ? 'Low' : n === 2 ? 'Medium' : 'High'}
                >
                  {n <= priority ? '\u2605' : '\u2606'}
                </span>
              ))}
              <span className="priority-label">
                {priority === 3 ? 'High' : priority === 2 ? 'Medium' : 'Low'}
              </span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="category">Category</label>
            <select id="category" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="work">Work</option>
              <option value="personal">Personal</option>
              {(user?.name?.includes('Stefano') || user?.name?.includes('Bozzarelli')) && (
                <option value="architectural_lines">Architectural Lines</option>
              )}
            </select>
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

          {visitId && !visitReportId && (
            <div className="info-note">
              This task is linked to a visit
            </div>
          )}

          {claimId && (
            <div className="info-note">
              This task is linked to a claim
            </div>
          )}

          {companyVisitId && (
            <div className="info-note">
              This task is linked to a company meeting
            </div>
          )}

          {/* Attachments section - available in both create and edit mode */}
          <div className="attachments-section">
            <label>Allegati</label>

            {/* Drop zone */}
            <div
              className={`attachment-dropzone ${dragOver ? 'drag-over' : ''}`}
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
                <span>Caricamento in corso...</span>
              ) : (
                <span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  Trascina file qui o clicca per caricare
                </span>
              )}
            </div>

            {/* Pending files (create mode) */}
            {!isEdit && pendingFiles.length > 0 && (
              <div className="attachment-list">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="attachment-item">
                    <div className="attachment-info">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                      <span className="attachment-name">{file.name}</span>
                      <span className="attachment-size">{formatFileSize(file.size)}</span>
                      <span className="attachment-pending-badge">Da caricare</span>
                    </div>
                    <button
                      type="button"
                      className="attachment-delete"
                      onClick={() => handleRemovePendingFile(idx)}
                      title="Rimuovi"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Saved attachments (edit mode) */}
            {isEdit && attachments.length > 0 && (
              <div className="attachment-list">
                {attachments.map((att) => (
                  <div key={att.id} className="attachment-item">
                    <div className="attachment-info">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                      <span className="attachment-name" onClick={() => handleDownloadAttachment(att.id)} title="Clicca per scaricare">
                        {att.filename}
                      </span>
                      <span className="attachment-size">{formatFileSize(att.file_size)}</span>
                    </div>
                    <button
                      type="button"
                      className="attachment-delete"
                      onClick={() => handleDeleteAttachment(att.id, att.filename)}
                      title="Elimina"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save Changes' : 'Create Task')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(searchParams.get('returnTo') || '/tasks')} disabled={loading}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TodoForm;
