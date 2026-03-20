import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Visit, VisitReport, CustomerOrder, TodoItem, VisitDirectAttachment } from '../types';
import { decodeMetadata, filterDisplayReports } from '../utils/visitMetadata';
import '../styles/CrudPages.css';

type TaskStatus = 'todo' | 'in_progress' | 'waiting' | 'completed';
const STATUS_CONFIG: Record<TaskStatus, { label: string; dot: string }> = {
  todo:        { label: 'To Do',       dot: '#B09840' },
  in_progress: { label: 'In Progress', dot: '#4A6078' },
  waiting:     { label: 'Waiting',     dot: '#6e6e73' },
  completed:   { label: 'Completed',   dot: '#4A7653' },
};

const normalizeStatus = (s: string): TaskStatus => {
  if (s === 'done') return 'completed';
  if (s in STATUS_CONFIG) return s as TaskStatus;
  return 'todo';
};

// Inline task status pill with popup menu
const TaskStatusPill: React.FC<{
  task: TodoItem;
  onStatusChange: (taskId: string, newStatus: string) => void;
}> = ({ task, onStatusChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const status = normalizeStatus(task.status);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`task-status-pill status-${status}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        <span className="status-dot" />
        {STATUS_CONFIG[status].label}
      </button>
      {open && (
        <div className="task-status-dropdown">
          {(Object.keys(STATUS_CONFIG) as TaskStatus[]).map(s => (
            <button
              key={s}
              className={`task-status-option${s === status ? ' selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const apiStatus = s === 'completed' ? 'done' : s;
                onStatusChange(task.id, apiStatus);
                setOpen(false);
              }}
            >
              <span className="status-dot" style={{ color: STATUS_CONFIG[s].dot }} />
              {STATUS_CONFIG[s].label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Task table used inside reports and at bottom
const TaskTable: React.FC<{
  tasks: TodoItem[];
  onStatusChange: (taskId: string, newStatus: string) => void;
  onNavigate: (taskId: string) => void;
}> = ({ tasks, onStatusChange, onNavigate }) => {
  if (tasks.length === 0) return null;
  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr>
          <th style={thStyle}>Task</th>
          <th style={thStyle}>Assigned To</th>
          <th style={thStyle}>Due Date</th>
          <th style={thStyle}>Status</th>
        </tr>
      </thead>
      <tbody>
        {tasks.map(t => (
          <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', color: 'var(--color-info)' }}
              onClick={() => onNavigate(t.id)}
            >
              {t.title}
            </td>
            <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>{t.assigned_to_user?.name || '-'}</td>
            <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString('it-IT') : '-'}</td>
            <td style={{ padding: '0.5rem 0.75rem' }}>
              <TaskStatusPill task={t} onStatusChange={onStatusChange} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// Visit status config
type VisitStatus = 'scheduled' | 'completed' | 'cancelled';
const VISIT_STATUS_CONFIG: Record<VisitStatus, { label: string; color: string; bg: string; border: string }> = {
  scheduled:  { label: 'Scheduled',  color: '#947E35', bg: 'rgba(176, 152, 64, 0.08)',  border: 'rgba(176, 152, 64, 0.2)' },
  completed:  { label: 'Completed',  color: '#4A7653', bg: 'rgba(91, 138, 101, 0.08)',  border: 'rgba(91, 138, 101, 0.2)' },
  cancelled:  { label: 'Cancelled',  color: '#6e6e73', bg: 'rgba(110, 110, 115, 0.08)', border: 'rgba(110, 110, 115, 0.2)' },
};

const VisitStatusPill: React.FC<{
  status: VisitStatus;
  onStatusChange: (newStatus: VisitStatus) => void;
}> = ({ status, onStatusChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const conf = VISIT_STATUS_CONFIG[status];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
          padding: '0.3rem 0.75rem', borderRadius: '9999px', border: `1px solid ${conf.border}`,
          background: conf.bg, color: conf.color, fontSize: '0.813rem', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s ease',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: conf.color }} />
        {conf.label}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
          background: '#fff', border: '1px solid var(--color-border)', borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)', padding: '0.25rem', minWidth: '140px',
        }}>
          {(Object.keys(VISIT_STATUS_CONFIG) as VisitStatus[]).map(s => {
            const c = VISIT_STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => { onStatusChange(s); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.4rem 0.625rem', borderRadius: '4px', border: 'none',
                  background: s === status ? c.bg : 'none', color: c.color, fontSize: '0.75rem',
                  fontWeight: 500, cursor: 'pointer', width: '100%', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { if (s !== status) (e.target as HTMLElement).style.background = 'var(--color-bg-secondary)'; }}
                onMouseLeave={e => { if (s !== status) (e.target as HTMLElement).style.background = 'none'; }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.color }} />
                {c.label}
              </button>
            );
          })}
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

export const VisitDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [allTasks, setAllTasks] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Preparation editing
  const [editingPreparation, setEditingPreparation] = useState(false);
  const [preparationDraft, setPreparationDraft] = useState('');

  // Direct attachments
  const [directAttachments, setDirectAttachments] = useState<VisitDirectAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadVisit(); }, [id]);

  const loadVisit = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await apiService.getVisit(id);
      if (response.success && response.data) {
        setVisit(response.data);

        // Load direct attachments
        if (response.data.direct_attachments) {
          setDirectAttachments(response.data.direct_attachments);
        } else {
          try {
            const attRes = await apiService.getVisitDirectAttachments(id);
            if (attRes.success && attRes.data) setDirectAttachments(attRes.data);
          } catch {}
        }

        try {
          const ordersResponse = await apiService.getOrdersByVisit(id);
          if (ordersResponse.success && ordersResponse.data) {
            setOrders(Array.isArray(ordersResponse.data) ? ordersResponse.data : []);
          }
        } catch {}

        // Load ALL tasks for this client
        try {
          const visitData = response.data;
          const todosRes = await apiService.getTodos({ clientId: visitData.client_id });
          if (todosRes.success && todosRes.data) {
            const all = Array.isArray(todosRes.data) ? todosRes.data : [];
            const reportIds = (visitData.reports || []).map((r: any) => r.id);
            // Tasks linked to reports of this visit
            const reportTasks = all.filter((t: any) => t.visit_report_id && reportIds.includes(t.visit_report_id));
            // General tasks: linked via visit_id OR orphan tasks (no visit_report_id, no claim_id, no visit_id)
            const generalTasks = all.filter((t: any) =>
              !t.visit_report_id && (
                t.visit_id === id ||
                (!t.visit_id && !t.claim_id)
              )
            );
            setAllTasks([...reportTasks, ...generalTasks]);
          }
        } catch {}
      }
    } catch {
      setError('Error loading visit');
    } finally {
      setIsLoading(false);
    }
  };

  const getTasksForReport = (reportId: string) => allTasks.filter(t => t.visit_report_id === reportId);
  const visitLevelTasks = allTasks.filter(t => !t.visit_report_id);

  const handleTaskStatusChange = async (taskId: string, newStatus: string) => {
    try {
      await apiService.updateTodo(taskId, { status: newStatus });
      setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
    } catch {
      setError('Error updating task status');
    }
  };

  const handleTaskNavigate = (taskId: string) => {
    navigate(`/tasks?highlight=${taskId}`);
  };

  const handleEditReport = (report: VisitReport) => {
    setEditingReportId(report.id);
    setEditContent(report.content);
  };

  const handleSaveReport = async (reportId: string) => {
    if (!id) return;
    try {
      await apiService.updateVisitReport(id, reportId, { content: editContent });
      setEditingReportId(null);
      loadVisit();
    } catch (err) { setError((err as Error).message); }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!id || !confirm('Are you sure?')) return;
    try {
      await apiService.deleteVisitReport(id, reportId);
      loadVisit();
    } catch (err) { setError((err as Error).message); }
  };

  const handleDeleteVisit = async () => {
    if (!id) return;
    try {
      setIsDeleting(true);
      setError('');
      const checkResponse = await apiService.canDeleteVisit(id);
      if (!checkResponse.success || !checkResponse.data) {
        setError('Error checking visit');
        setIsDeleting(false);
        return;
      }
      const { canDelete, reportCount } = checkResponse.data;
      if (!canDelete && reportCount > 0) {
        if (!window.confirm(`There are still ${reportCount} associated reports. Do you want to delete them and cancel the visit?`)) {
          setIsDeleting(false);
          return;
        }
      }
      const deleteResponse = await apiService.deleteVisit(id);
      if (deleteResponse.success) {
        navigate('/visits', { state: { message: 'Visit cancelled successfully' } });
      } else {
        setError(deleteResponse.error || 'Error deleting visit');
        setIsDeleting(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setIsDeleting(false);
    }
  };

  // ---- Visit Status ----
  const handleUpdateStatus = async (newStatus: VisitStatus) => {
    if (!id) return;
    try {
      await apiService.updateVisit(id, { status: newStatus });
      setVisit(prev => prev ? { ...prev, status: newStatus } : prev);
    } catch { setError('Error updating status'); }
  };

  // ---- Preparation ----
  const handleEditPreparation = () => {
    setPreparationDraft(visit?.preparation || '');
    setEditingPreparation(true);
  };

  const handleSavePreparation = async () => {
    if (!id) return;
    try {
      await apiService.updateVisit(id, { preparation: preparationDraft || null });
      setVisit(prev => prev ? { ...prev, preparation: preparationDraft || null } : prev);
      setEditingPreparation(false);
    } catch { setError('Error updating preparation'); }
  };

  // ---- Direct Attachments ----
  const handleFileUpload = async (files: FileList | File[]) => {
    if (!id || files.length === 0) return;
    setUploadingFiles(true);
    try {
      for (const file of Array.from(files)) {
        await apiService.uploadVisitDirectAttachment(id, file);
      }
      const attRes = await apiService.getVisitDirectAttachments(id);
      if (attRes.success && attRes.data) setDirectAttachments(attRes.data);
    } catch { setError('Error uploading file'); }
    finally { setUploadingFiles(false); }
  };

  const handleDownloadAttachment = async (attachment: VisitDirectAttachment) => {
    if (!id) return;
    try {
      const res = await apiService.downloadVisitDirectAttachment(id, attachment.id);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch { setError('Error downloading file'); }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!id || !window.confirm('Delete this attachment?')) return;
    try {
      await apiService.deleteVisitDirectAttachment(id, attachmentId);
      setDirectAttachments(prev => prev.filter(a => a.id !== attachmentId));
    } catch { setError('Error deleting attachment'); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFileUpload(e.dataTransfer.files);
  };

  const visitMetadata = useMemo(() => visit ? decodeMetadata(visit.reports || []) : null, [visit]);
  const displayReports = useMemo(() => visit ? filterDisplayReports(visit.reports || []) : [], [visit]);

  if (isLoading) return <p>Loading...</p>;
  if (!visit) return <p>Visit not found</p>;

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Visit - {visit.client?.name}</h1>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button onClick={() => navigate(`/todos/new?clientId=${visit.client_id}&visitId=${id}`)} className="btn-primary" title="Create a follow-up task for this visit">
            + Create Task
          </button>
          <button onClick={() => navigate(`/orders/new/${id}`)} className="btn-secondary" title="Create a new customer order">
            + Create Order
          </button>
          <button onClick={handleDeleteVisit} disabled={isDeleting} className="btn-danger">
            {isDeleting ? 'Cancelling...' : '🗑️ Cancel Visit'}
          </button>
          <button onClick={() => navigate('/visits')} className="btn-secondary">← Back to Visits</button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0 }}>Visit Information</h3>
          <VisitStatusPill
            status={(visit.status as VisitStatus) || 'scheduled'}
            onStatusChange={handleUpdateStatus}
          />
        </div>
        <div className="info-group">
          <div><label>Client</label><p>{visit.client?.name}</p></div>
          <div><label>Date</label><p>{new Date(visit.visit_date).toLocaleDateString('it-IT')}</p></div>
          <div><label>Visited By</label><p>{visit.visited_by_user?.name}</p></div>
        </div>
        {visitMetadata && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e5e5' }}>
            <div className="info-group">
              {visitMetadata.location && <div><label>Location</label><p>{visitMetadata.location}</p></div>}
              {visitMetadata.purpose && <div><label>Purpose</label><p>{visitMetadata.purpose}</p></div>}
              {visitMetadata.outcome && <div><label>Outcome</label><p>{visitMetadata.outcome}</p></div>}
              {visitMetadata.nextAction && <div><label>Next Action</label><p>{visitMetadata.nextAction}</p></div>}
              {visitMetadata.followUpRequired && <div><label>Follow-up</label><p style={{ color: 'var(--color-warning)', fontWeight: 500 }}>Required</p></div>}
            </div>
          </div>
        )}
      </div>

      {/* Preparation */}
      <div className="form-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ margin: 0 }}>Preparation / Pre-meeting Notes</h3>
          {!editingPreparation && (
            <button onClick={handleEditPreparation} className="btn-warning" style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}>
              {visit.preparation ? 'Edit' : '+ Add'}
            </button>
          )}
        </div>
        {editingPreparation ? (
          <div>
            <textarea
              value={preparationDraft}
              onChange={e => setPreparationDraft(e.target.value)}
              rows={5}
              placeholder="Add preparation notes for this meeting..."
              style={{ width: '100%', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button onClick={handleSavePreparation} className="btn-primary">Save</button>
              <button onClick={() => setEditingPreparation(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        ) : (
          visit.preparation ? (
            <p style={{ whiteSpace: 'pre-wrap', color: '#555', margin: 0, fontSize: '0.875rem', lineHeight: 1.6 }}>{visit.preparation}</p>
          ) : (
            <p style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic', margin: 0, fontSize: '0.813rem' }}>No preparation notes yet</p>
          )
        )}
      </div>

      {/* Direct Attachments */}
      <div className="form-card">
        <h3 style={{ marginBottom: '0.75rem' }}>Visit Attachments</h3>
        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--color-info)' : 'var(--color-border)'}`,
            borderRadius: '8px', padding: '1.25rem', textAlign: 'center', cursor: 'pointer',
            background: dragOver ? 'rgba(74, 96, 120, 0.04)' : 'var(--color-bg-primary)',
            transition: 'all 0.15s ease', marginBottom: directAttachments.length > 0 ? '1rem' : 0,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => { if (e.target.files) { handleFileUpload(e.target.files); e.target.value = ''; } }}
          />
          {uploadingFiles ? (
            <p style={{ margin: 0, color: 'var(--color-info)', fontSize: '0.813rem' }}>Uploading...</p>
          ) : (
            <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: '0.813rem' }}>
              Drop files here or click to upload
            </p>
          )}
        </div>

        {/* Attachment list */}
        {directAttachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {directAttachments.map(att => (
              <div key={att.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.5rem 0.75rem', background: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)', borderRadius: '6px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <span style={{ fontSize: '1rem' }}>📄</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.813rem', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.filename}</div>
                    <div style={{ fontSize: '0.688rem', color: 'var(--color-text-tertiary)' }}>
                      {formatFileSize(att.file_size)} · {new Date(att.created_at).toLocaleDateString('it-IT')}
                      {att.uploaded_by_user && ` · ${att.uploaded_by_user.name}`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                  <button onClick={() => handleDownloadAttachment(att)} className="btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                    ↓ Download
                  </button>
                  <button onClick={() => handleDeleteAttachment(att.id)} className="btn-danger" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2>Company Reports</h2>
      {displayReports.length > 0 ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {displayReports.map((report) => {
            const reportTasks = getTasksForReport(report.id);
            return (
              <div key={report.id} className="form-card">
                <div style={{ marginBottom: '1rem' }}>
                  <h3>{report.company?.name} - {report.section}</h3>
                  <span style={{
                    padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '0.9rem',
                    backgroundColor: report.status === 'draft' ? '#fff3cd' : report.status === 'submitted' ? '#d1ecf1' : '#d4edda',
                    color: report.status === 'draft' ? '#856404' : report.status === 'submitted' ? '#0c5460' : '#155724',
                  }}>{report.status}</span>
                </div>

                {editingReportId === report.id ? (
                  <div className="form-group">
                    <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={5} />
                    <div className="form-actions" style={{ marginTop: '1rem' }}>
                      <button onClick={() => handleSaveReport(report.id)} className="btn-primary">Save</button>
                      <button onClick={() => setEditingReportId(null)} className="btn-secondary">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p style={{ whiteSpace: 'pre-wrap', color: '#555' }}>{report.content}</p>
                    <div className="form-actions">
                      <button onClick={() => handleEditReport(report)} className="btn-warning">Edit</button>
                      <button onClick={() => handleDeleteReport(report.id)} className="btn-danger">Delete</button>
                      <button onClick={() => navigate(`/visits/${id}/reports/${report.id}`)} className="btn-info">Attachments</button>
                      <button onClick={() => navigate(`/todos/new?visitReportId=${report.id}&clientId=${visit.client_id}&companyId=${report.company_id}&visitId=${id}`)} className="btn-primary">+ Create Task</button>
                    </div>
                  </div>
                )}

                {report.attachments && report.attachments.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                    <h4>Attachments ({report.attachments.length})</h4>
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                      {report.attachments.map((att) => (
                        <li key={att.id} style={{ marginBottom: '0.5rem' }}>📄 {att.filename}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tasks linked to THIS report */}
                {reportTasks.length > 0 && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>Tasks ({reportTasks.length})</h4>
                    <TaskTable tasks={reportTasks} onStatusChange={handleTaskStatusChange} onNavigate={handleTaskNavigate} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p>No reports registered</p>
      )}

      {/* Visit-level tasks */}
      {visitLevelTasks.length > 0 && (
        <>
          <h2 style={{ marginTop: '2rem' }}>Visit Tasks</h2>
          <div className="form-card" style={{ marginBottom: '1rem' }}>
            <TaskTable tasks={visitLevelTasks} onStatusChange={handleTaskStatusChange} onNavigate={handleTaskNavigate} />
          </div>
        </>
      )}

      <h2 style={{ marginTop: '2rem' }}>📦 Customer Orders</h2>
      {orders && orders.length > 0 ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {orders.map((order) => (
            <div key={order.id} className="form-card">
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>Order #{order.id.substring(0, 8)}</h3>
                  <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                    Date: {new Date(order.order_date).toLocaleDateString('it-IT')} | Payment: {order.payment_method}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '0.9rem',
                    backgroundColor: order.status === 'draft' ? '#fff3cd' : order.status === 'confirmed' ? '#d1ecf1' : '#d4edda',
                    color: order.status === 'draft' ? '#856404' : order.status === 'confirmed' ? '#0c5460' : '#155724',
                  }}>{order.status}</span>
                  <button onClick={() => navigate(`/orders/${order.id}/edit`)} className="btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>✎ Edit</button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div><label>Lines</label><p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2rem' }}>{order.items?.length || 0}</p></div>
                <div><label>Total Amount</label><p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2rem', color: '#007aff' }}>€ {typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : parseFloat(String(order.total_amount)).toFixed(2)}</p></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No orders registered</p>
      )}
    </div>
  );
};
