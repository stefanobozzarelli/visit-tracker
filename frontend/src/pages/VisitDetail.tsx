import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import { config } from '../config';
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

// Read-only task status pill
const TaskStatusPill: React.FC<{ task: TodoItem }> = ({ task }) => {
  const status = normalizeStatus(task.status);
  const conf = STATUS_CONFIG[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.3rem 0.75rem', borderRadius: '9999px', background: `rgba(${status === 'completed' ? '74, 118, 83' : status === 'in_progress' ? '74, 96, 120' : status === 'waiting' ? '110, 110, 115' : '176, 152, 64'}, 0.1)`, color: conf.dot, fontSize: '0.813rem', fontWeight: 600 }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: conf.dot }} />
      {STATUS_CONFIG[status].label}
    </span>
  );
};

// Read-only task table
const TaskTable: React.FC<{ tasks: TodoItem[]; onNavigate: (taskId: string) => void }> = ({ tasks, onNavigate }) => {
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
          <tr
            key={t.id}
            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
            onDoubleClick={() => onNavigate(t.id)}
          >
            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--color-info)' }}>
              {t.title}
            </td>
            <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>{t.assigned_to_user?.name || '-'}</td>
            <td style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}>{t.due_date ? new Date(t.due_date).toLocaleDateString('it-IT') : '-'}</td>
            <td style={{ padding: '0.5rem 0.75rem' }}>
              <TaskStatusPill task={t} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

type VisitStatus = 'scheduled' | 'completed' | 'cancelled';
const VISIT_STATUS_CONFIG: Record<VisitStatus, { label: string; color: string }> = {
  scheduled:  { label: 'Scheduled',  color: '#947E35' },
  completed:  { label: 'Completed',  color: '#4A7653' },
  cancelled:  { label: 'Cancelled',  color: '#6e6e73' },
};

export const VisitDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [offers, setOffers] = useState<any[]>([]);
  const [allTasks, setAllTasks] = useState<TodoItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { loadVisit(); }, [id, location.key]);

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

        try {
          const offersResponse = await apiService.getOffers({ visit_id: id });
          if (offersResponse.success && offersResponse.data) {
            setOffers(Array.isArray(offersResponse.data) ? offersResponse.data : []);
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

  const visitMetadata = useMemo(() => visit ? decodeMetadata(visit.reports || []) : null, [visit]);
  const displayReports = useMemo(() => visit ? filterDisplayReports(visit.reports || []) : [], [visit]);

  const getTasksForReport = (reportId: string) => allTasks.filter(t => t.visit_report_id === reportId);
  const visitLevelTasks = allTasks.filter(t => !t.visit_report_id);
  const getOrdersForReport = (companyId: string) => orders.filter(o => o.supplier_id === companyId);
  const unmatchedOrders = orders.filter(o => !displayReports.some(r => r.company_id === o.supplier_id));

  const handleTaskNavigate = (taskId: string) => {
    navigate(`/tasks?highlight=${taskId}`);
  };

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!visit) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Visit not found</div>;

  const statusConf = VISIT_STATUS_CONFIG[visit.status as VisitStatus] || VISIT_STATUS_CONFIG.scheduled;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button onClick={() => navigate('/visits')} style={{ padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
            ← Back
          </button>
          <h1 style={{ margin: 0 }}>Client Meeting - {visit.client?.name}</h1>
        </div>
        <button
          onClick={() => navigate(`/todos/new?visitId=${id}&clientId=${visit.client_id}&returnTo=/visits/${id}`)}
          style={{ padding: '0.6rem 1.2rem', background: 'var(--color-success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
        >
          + Add Task
        </button>
      </div>

      {error && <div style={{ padding: '0.75rem', marginBottom: '1rem', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>{error}</div>}

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0 }}>Meeting Information</h3>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.3rem 0.75rem', borderRadius: '9999px', background: `rgba(${statusConf.color === '#947E35' ? '148, 126, 53' : statusConf.color === '#4A7653' ? '74, 118, 83' : '110, 110, 115'}, 0.1)`, color: statusConf.color, fontSize: '0.813rem', fontWeight: 600 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusConf.color }} />
            {statusConf.label}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Client</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{visit.client?.name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Date</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{new Date(visit.visit_date).toLocaleDateString('it-IT')}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Visited By</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{visit.visited_by_user?.name || '-'}</p>
          </div>
        </div>
        {visitMetadata && (
          <div style={{ paddingTop: '1.5rem', borderTop: '1px solid #e0e0e0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {visitMetadata.location && <div><label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Location</label><p style={{ margin: 0, fontSize: '1rem' }}>{visitMetadata.location}</p></div>}
              {visitMetadata.purpose && <div><label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Purpose</label><p style={{ margin: 0, fontSize: '1rem' }}>{visitMetadata.purpose}</p></div>}
              {visitMetadata.outcome && <div><label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Outcome</label><p style={{ margin: 0, fontSize: '1rem' }}>{visitMetadata.outcome}</p></div>}
              {visitMetadata.nextAction && <div><label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Next Action</label><p style={{ margin: 0, fontSize: '1rem' }}>{visitMetadata.nextAction}</p></div>}
            </div>
            {visitMetadata.followUpRequired && <div style={{ marginTop: '1rem' }}><label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Follow-up</label><p style={{ margin: 0, fontSize: '1rem', color: 'var(--color-warning)', fontWeight: 500 }}>Required</p></div>}
          </div>
        )}
      </div>

      {visit.preparation && (
        <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
          <h3 style={{ marginBottom: '1rem', marginTop: 0 }}>Preparation / Pre-meeting Notes</h3>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: '0.875rem', lineHeight: 1.6, color: '#555' }}>{visit.preparation}</p>
        </div>
      )}

      {displayReports.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Supplier Reports</h2>
          <div style={{ display: 'grid', gap: '1.5rem' }}>
            {displayReports.map((report) => {
              const reportTasks = getTasksForReport(report.id);
              return (
                <div key={report.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <div>
                        <h3 style={{ margin: '0 0 0.5rem 0' }}>{report.company?.name} - {report.section}</h3>
                        <span style={{ padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '0.875rem', backgroundColor: report.status === 'draft' ? '#fff3cd' : report.status === 'submitted' ? '#d1ecf1' : '#d4edda', color: report.status === 'draft' ? '#856404' : report.status === 'submitted' ? '#0c5460' : '#155724' }}>{report.status}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => navigate(`/todos/new?visitReportId=${report.id}&clientId=${visit.client_id}&companyId=${report.company_id}&returnTo=/visits/${id}`)}
                          style={{ padding: '0.4rem 0.8rem', background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                        >
                          + Task
                        </button>
                        <button
                          onClick={() => navigate(`/orders/new/${id}?supplierId=${report.company_id}`)}
                          style={{ padding: '0.4rem 0.8rem', background: 'var(--color-warning)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                        >
                          + Order
                        </button>
                      </div>
                    </div>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', color: '#555', margin: '1rem 0 0 0' }}>{report.content}</p>
                  {/* Attachments section - always show for upload capability */}
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>Attachments ({report.attachments?.length || 0})</h4>
                      <label
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-info)', padding: '4px 10px', border: '1px dashed var(--color-border)', borderRadius: '4px' }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        + Add File
                        <input type="file" multiple style={{ display: 'none' }} onChange={async (e) => {
                          const files = e.target.files;
                          if (!files || !visit) return;
                          const baseUrl = config.API_BASE_URL;
                          const token = localStorage.getItem('token');
                          for (const file of Array.from(files)) {
                            try {
                              const fd = new FormData();
                              fd.append('file', file);
                              await fetch(`${baseUrl}/visits/${visit.id}/reports/${report.id}/upload`, {
                                method: 'POST',
                                body: fd,
                                headers: { Authorization: `Bearer ${token}` },
                              });
                            } catch (err) {
                              console.error('Upload failed:', err);
                            }
                          }
                          // Reload visit to show new attachments
                          const updated = await apiService.getVisit(visit.id);
                          if (updated.success && updated.data) setVisit(updated.data);
                        }} />
                      </label>
                    </div>
                    {report.attachments && report.attachments.length > 0 && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {report.attachments.map((att: any) => (
                          <li key={att.id} style={{ marginBottom: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            <a
                              href={`${config.API_BASE_URL}/visits/${visit?.id}/reports/${report.id}/attachments/${att.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: 'var(--color-info)', textDecoration: 'underline', cursor: 'pointer' }}
                            >
                              {att.filename}
                            </a>
                            {att.file_size && <span style={{ fontSize: '0.75rem', color: '#999' }}>({(att.file_size / 1024 / 1024).toFixed(1)} MB)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {reportTasks.length > 0 && (
                    <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                      <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Tasks ({reportTasks.length})</h4>
                      <TaskTable tasks={reportTasks} onNavigate={handleTaskNavigate} />
                    </div>
                  )}
                  {/* Orders for this supplier */}
                  {(() => {
                    const reportOrders = getOrdersForReport(report.company_id);
                    return reportOrders.length > 0 ? (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                        <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem' }}>Orders ({reportOrders.length})</h4>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                          {reportOrders.map((order) => (
                            <div
                              key={order.id}
                              style={{ background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: '6px', padding: '1rem', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                              onClick={() => navigate(`/orders/${order.id}/edit`)}
                              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>Order #{order.id.substring(0, 8)}</p>
                                  <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#666' }}>
                                    Date: {new Date(order.order_date).toLocaleDateString('it-IT')} | Payment: {order.payment_method} | Status: {order.status || 'draft'}
                                  </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <span style={{ fontWeight: 'bold', color: '#007aff' }}>€ {typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : parseFloat(String(order.total_amount || 0)).toFixed(2)}</span>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--color-info)', fontWeight: '600' }}>View →</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {visitLevelTasks.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Visit Tasks</h2>
          <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem' }}>
            <TaskTable tasks={visitLevelTasks} onNavigate={handleTaskNavigate} />
          </div>
        </div>
      )}

      {unmatchedOrders.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Other Orders</h2>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {unmatchedOrders.map((order) => (
              <div
                key={order.id}
                style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onClick={() => navigate(`/orders/${order.id}/edit`)}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '600' }}>{order.supplier_name || 'Supplier'} - Order #{order.id.substring(0, 8)}</p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#666' }}>Date: {new Date(order.order_date).toLocaleDateString('it-IT')} | Payment: {order.payment_method}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 'bold', color: '#007aff' }}>€ {typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : parseFloat(String(order.total_amount || 0)).toFixed(2)}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-info)', fontWeight: '600' }}>View →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Offers section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Offers ({offers.length})</h2>
          <button
            onClick={() => navigate(`/offers/new?visitId=${id}&clientId=${visit.client_id}`)}
            style={{ padding: '0.4rem 0.8rem', background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            + New Offer
          </button>
        </div>
        {offers.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {offers.map((offer: any) => (
              <div
                key={offer.id}
                style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', cursor: 'pointer', transition: 'box-shadow 0.2s' }}
                onClick={() => navigate(`/offers/${offer.id}`)}
                onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)')}
                onMouseLeave={(e) => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '600', fontSize: '0.9rem' }}>
                      {offer.company?.name || 'Supplier'} - {new Date(offer.offer_date).toLocaleDateString('it-IT')}
                    </p>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#666' }}>
                      Status: {offer.status || 'draft'} | Items: {offer.items?.length || 0}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 'bold', color: '#007aff' }}>
                      {offer.total_amount != null ? `${offer.currency || '\u20AC'} ${Number(offer.total_amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '-'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-info)', fontWeight: '600' }}>View →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No offers linked to this visit.</p>
        )}
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
        <button
          onClick={() => navigate(`/visits/${id}/edit`)}
          style={{ padding: '0.6rem 1.2rem', background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
        >
          Edit
        </button>
      </div>
    </div>
  );
};
