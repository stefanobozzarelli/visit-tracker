import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Visit, VisitReport, CustomerOrder, TodoItem } from '../types';
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

  useEffect(() => { loadVisit(); }, [id]);

  const loadVisit = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await apiService.getVisit(id);
      if (response.success && response.data) {
        setVisit(response.data);

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
        <h3>Visit Information</h3>
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
                      <button onClick={() => navigate(`/todos/new?visitReportId=${report.id}&clientId=${visit.client_id}&companyId=${report.company_id}`)} className="btn-primary">+ Create Task</button>
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
