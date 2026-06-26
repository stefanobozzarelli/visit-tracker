import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { apiService } from '../services/api';
import { config } from '../config';
import { Visit, VisitReport, CustomerOrder, TodoItem } from '../types';
import { decodeMetadata, filterDisplayReports } from '../utils/visitMetadata';
import { compressImages } from '../utils/compressImage';
import { openEmailWithPdf } from '../utils/openEmailWithPdf';
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
  const [reportOpportunities, setReportOpportunities] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [pasteTargetReportId, setPasteTargetReportId] = useState<string | null>(null);
  const [uploadingReportId, setUploadingReportId] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState<string | null>(null); // 'all' | reportId | null
  const [deliveryLoading, setDeliveryLoading] = useState<string | null>(null); // reportId being toggled

  /** Toggle dello stato di consegna di un singolo report al cliente */
  const handleToggleDelivery = async (reportId: string, currentlyDelivered: boolean) => {
    if (!visit) return;
    setDeliveryLoading(reportId);
    try {
      await apiService.setReportDelivery(visit.id, reportId, !currentlyDelivered);
      // Ricarica la visita per ottenere il nuovo delivered_at
      const updated = await apiService.getVisit(visit.id);
      if (updated.success && updated.data) setVisit(updated.data);
    } catch (e: any) {
      setError(`Errore aggiornamento stato consegna: ${e?.message || 'Errore sconosciuto'}`);
    } finally {
      setDeliveryLoading(null);
    }
  };

  /** Download the email PDF as a plain .pdf file */
  const handleDownloadPdf = async (reportId?: string) => {
    if (!visit) return;
    const key = `pdf-${reportId || 'all'}`;
    setEmailLoading(key);
    try {
      const blob = await apiService.exportVisitEmailPdf(visit.id, reportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const clientSlug = (visit.client?.name || 'visita').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      a.download = `report-${clientSlug}${reportId ? '-sezione' : ''}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Errore generazione PDF: ${e?.message || 'Errore sconosciuto'}`);
    } finally {
      setEmailLoading(null);
    }
  };

  /** Share PDF via system share sheet → Mail. Subject copied to clipboard for ⌘V paste. */
  const handleGenerateEmail = async (reportId?: string, _reportSection?: string) => {
    if (!visit) return;
    const key = `eml-${reportId || 'all'}`;

    // 1. Calcola subject + copia clipboard SUBITO, prima del fetch PDF.
    //    Se aspettiamo dopo l'await, Safari perde il gesto utente e rifiuta writeText.
    const clientName = visit.client?.name || 'Cliente';
    const visitDateISO = new Date(visit.visit_date).toISOString().slice(0, 10);
    const subject = `${visitDateISO} Report "${clientName}"`;
    try { await navigator.clipboard.writeText(subject); }
    catch (e) { console.warn('[handleGenerateEmail] clipboard.writeText failed:', e); }

    setEmailLoading(key);
    try {
      const blob = await apiService.exportVisitEmailPdf(visit.id, reportId);
      const pdfFilename = `${subject.replace(/[/\\:*?<>|]/g, '')}.pdf`;
      await openEmailWithPdf(blob, pdfFilename, subject);
    } catch (e: any) {
      setError(`Errore condivisione: ${e?.message || 'Errore sconosciuto'}`);
    } finally {
      setEmailLoading(null);
    }
  };

  /** Crea una bozza in Outlook con il PDF del report allegato, poi apre la bozza. */
  const handleOutlookDraft = async (reportId?: string) => {
    if (!visit) return;
    const key = `outlook-${reportId || 'all'}`;
    setError('');
    setSuccessMsg('');
    setEmailLoading(key);
    try {
      const res = await apiService.createOutlookDraft(visit.id, reportId ? { reportId } : {});
      if (res.success) {
        setSuccessMsg('✓ Bozza creata in Outlook con il PDF allegato. La trovi nella cartella "Bozze" (anche nell’app desktop).');
      } else {
        setError(res.error || 'Errore creazione bozza Outlook');
      }
    } catch (e: any) {
      const errCode = e?.response?.data?.error;
      if (errCode === 'OUTLOOK_NOT_CONNECTED' || e?.response?.status === 409) {
        if (window.confirm('Outlook non è collegato. Vuoi collegarlo ora nelle impostazioni?')) {
          navigate('/settings');
        }
      } else {
        setError(`Errore bozza Outlook: ${errCode || e?.message || 'Errore sconosciuto'}`);
      }
    } finally {
      setEmailLoading(null);
    }
  };

  // Upload files to a specific report (images are compressed client-side first)
  const uploadFilesToReport = async (reportId: string, files: File[]) => {
    if (!visit || files.length === 0) return;
    setUploadingReportId(reportId);
    const token = localStorage.getItem('token');
    const compressed = await compressImages(files);
    for (const file of compressed) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        await fetch(`${config.API_BASE_URL}/visits/${visit.id}/reports/${reportId}/upload`, {
          method: 'POST', body: fd,
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) { console.error('Upload failed:', err); }
    }
    setUploadingReportId(null);
    const updated = await apiService.getVisit(visit.id);
    if (updated.success && updated.data) setVisit(updated.data);
  };

  // Global paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!pasteTargetReportId || !e.clipboardData) return;
      const files: File[] = [];
      for (let i = 0; i < e.clipboardData.items.length; i++) {
        const item = e.clipboardData.items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            // Give pasted images a meaningful name
            const ext = file.type.split('/')[1] || 'png';
            const namedFile = new File([file], `pasted-${Date.now()}.${ext}`, { type: file.type });
            files.push(namedFile);
          }
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        uploadFilesToReport(pasteTargetReportId, files);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [pasteTargetReportId, visit]);

  useEffect(() => { loadVisit(); }, [id, location.key]);

  useEffect(() => {
    if (successMsg) { const t = setTimeout(() => setSuccessMsg(''), 6000); return () => clearTimeout(t); }
  }, [successMsg]);

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

        // Load opportunities for this visit
        try {
          const oppRes = await apiService.getOpportunities({ visit_id: id });
          if (oppRes.success && oppRes.data) {
            const opps = Array.isArray(oppRes.data) ? oppRes.data : [];
            const byReport: Record<string, any[]> = {};
            opps.forEach((o: any) => { if (o.report_id) { if (!byReport[o.report_id]) byReport[o.report_id] = []; byReport[o.report_id].push(o); } });
            setReportOpportunities(byReport);
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
            // General tasks: only those explicitly linked to THIS visit
            const generalTasks = all.filter((t: any) =>
              !t.visit_report_id && t.visit_id === id
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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleDownloadPdf()}
            disabled={emailLoading !== null}
            style={{ padding: '0.6rem 1.2rem', background: emailLoading === 'pdf-all' ? '#999' : '#4A6078', color: 'white', border: 'none', borderRadius: '4px', cursor: emailLoading !== null ? 'wait' : 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
            title="Scarica PDF con il report dell'intera visita"
          >
            {emailLoading === 'pdf-all' ? '⏳…' : '📄 PDF'}
          </button>
          <button
            onClick={() => handleGenerateEmail()}
            disabled={emailLoading !== null}
            style={{ padding: '0.6rem 1.2rem', background: emailLoading === 'eml-all' ? '#999' : '#2E7D32', color: 'white', border: 'none', borderRadius: '4px', cursor: emailLoading !== null ? 'wait' : 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
            title="Condividi PDF (apre il share sheet di sistema)"
          >
            {emailLoading === 'eml-all' ? '⏳…' : '✉️ Condividi'}
          </button>
          <button
            onClick={() => handleOutlookDraft()}
            disabled={emailLoading !== null}
            style={{ padding: '0.6rem 1.2rem', background: emailLoading === 'outlook-all' ? '#999' : '#0F6CBD', color: 'white', border: 'none', borderRadius: '4px', cursor: emailLoading !== null ? 'wait' : 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
            title="Crea una bozza in Outlook con il PDF allegato"
          >
            {emailLoading === 'outlook-all' ? '⏳…' : '📧 Bozza Outlook'}
          </button>
          <button
            onClick={() => navigate(`/todos/new?visitId=${id}&clientId=${visit.client_id}&returnTo=/visits/${id}`)}
            style={{ padding: '0.6rem 1.2rem', background: 'var(--color-success)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap' }}
          >
            + Add Task
          </button>
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem', marginBottom: '1rem', background: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>{error}</div>}
      {successMsg && <div style={{ padding: '0.75rem', marginBottom: '1rem', background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: '4px', color: '#2E7D32' }}>{successMsg}</div>}

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
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Meeting Type</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>
              {visit.meeting_type === 'call' ? '\uD83D\uDCDE Call' : visit.meeting_type === 'video_call' ? '\uD83D\uDCF9 Video Call' : '\uD83C\uDFE2 In Person'}
            </p>
          </div>
          {visit.participants && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Meeting Participants</label>
              <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.participants}</p>
            </div>
          )}
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
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{ padding: '0.25rem 0.75rem', borderRadius: '4px', fontSize: '0.875rem', backgroundColor: report.status === 'draft' ? '#fff3cd' : report.status === 'submitted' ? '#d1ecf1' : '#d4edda', color: report.status === 'draft' ? '#856404' : report.status === 'submitted' ? '#0c5460' : '#155724' }}>{report.status}</span>
                          {report.delivered_at ? (
                            <button
                              onClick={() => handleToggleDelivery(report.id, true)}
                              disabled={deliveryLoading === report.id}
                              title="Click per annullare la consegna"
                              style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '4px',
                                fontSize: '0.875rem',
                                backgroundColor: 'rgba(74, 96, 120, 0.12)',
                                color: '#3D5068',
                                border: '1px solid rgba(74, 96, 120, 0.3)',
                                cursor: deliveryLoading === report.id ? 'wait' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {deliveryLoading === report.id
                                ? '⏳…'
                                : `✓ Consegnato il ${new Date(report.delivered_at).toLocaleDateString('it-IT')}`}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleToggleDelivery(report.id, false)}
                              disabled={deliveryLoading === report.id}
                              title="Marca questo report come consegnato al cliente"
                              style={{
                                padding: '0.25rem 0.75rem',
                                borderRadius: '4px',
                                fontSize: '0.875rem',
                                backgroundColor: 'rgba(212, 175, 55, 0.12)',
                                color: '#997b1a',
                                border: '1px dashed rgba(212, 175, 55, 0.4)',
                                cursor: deliveryLoading === report.id ? 'wait' : 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {deliveryLoading === report.id ? '⏳…' : '📤 Marca come consegnato'}
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleDownloadPdf(report.id)}
                          disabled={emailLoading !== null}
                          style={{ padding: '0.4rem 0.8rem', background: emailLoading === `pdf-${report.id}` ? '#999' : '#4A6078', color: 'white', border: 'none', borderRadius: '4px', cursor: emailLoading !== null ? 'wait' : 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          title="Scarica PDF con questa sezione (testo, allegati e ordini del fornitore)"
                        >
                          {emailLoading === `pdf-${report.id}` ? '⏳…' : '📄 PDF'}
                        </button>
                        <button
                          onClick={() => handleGenerateEmail(report.id, `${report.company?.name} - ${report.section}`)}
                          disabled={emailLoading !== null}
                          style={{ padding: '0.4rem 0.8rem', background: emailLoading === `eml-${report.id}` ? '#999' : '#2E7D32', color: 'white', border: 'none', borderRadius: '4px', cursor: emailLoading !== null ? 'wait' : 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          title="Condividi PDF (apre il share sheet di sistema)"
                        >
                          {emailLoading === `eml-${report.id}` ? '⏳…' : '✉️ Condividi'}
                        </button>
                        <button
                          onClick={() => handleOutlookDraft(report.id)}
                          disabled={emailLoading !== null}
                          style={{ padding: '0.4rem 0.8rem', background: emailLoading === `outlook-${report.id}` ? '#999' : '#0F6CBD', color: 'white', border: 'none', borderRadius: '4px', cursor: emailLoading !== null ? 'wait' : 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          title="Crea una bozza in Outlook con questa sezione in PDF"
                        >
                          {emailLoading === `outlook-${report.id}` ? '⏳…' : '📧 Bozza Outlook'}
                        </button>
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
                        {reportOpportunities[report.id]?.length > 0 ? (
                          <button
                            onClick={() => navigate(`/opportunities/${reportOpportunities[report.id][0].id}`)}
                            style={{ padding: '0.4rem 0.8rem', background: '#7B68AE', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          >
                            View Opportunity →
                          </button>
                        ) : (
                          <button
                            onClick={() => navigate(`/opportunities/new?visitId=${id}&reportId=${report.id}&clientId=${visit.client_id}&companyId=${report.company_id}`)}
                            style={{ padding: '0.4rem 0.8rem', background: '#7B68AE', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                          >
                            + Opportunity
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <p style={{ whiteSpace: 'pre-wrap', color: '#555', margin: '1rem 0 0 0' }}>{report.content}</p>
                  {/* Attachments section - always show for upload capability */}
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>
                        Attachments ({report.attachments?.length || 0})
                        {uploadingReportId === report.id && <span style={{ fontSize: '0.75rem', color: 'var(--color-info)', marginLeft: '0.5rem' }}>⏳ Uploading...</span>}
                      </h4>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <button
                          onClick={() => setPasteTargetReportId(pasteTargetReportId === report.id ? null : report.id)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem',
                            color: pasteTargetReportId === report.id ? '#fff' : '#666',
                            backgroundColor: pasteTargetReportId === report.id ? 'var(--color-info)' : 'transparent',
                            padding: '4px 10px', border: `1px ${pasteTargetReportId === report.id ? 'solid var(--color-info)' : 'dashed var(--color-border)'}`, borderRadius: '4px',
                          }}
                          title={pasteTargetReportId === report.id ? 'Now paste with ⌘+V' : 'Click to enable paste'}
                        >
                          📋 {pasteTargetReportId === report.id ? '⌘+V to Paste' : 'Paste'}
                        </button>
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
                            await uploadFilesToReport(report.id, Array.from(files));
                        }} />
                      </label>
                      </div>
                    </div>
                    {report.attachments && report.attachments.length > 0 && (
                      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                        {report.attachments.map((att: any) => (
                          <li key={att.id} style={{ marginBottom: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            <span style={{ flex: 1 }}>{att.filename}</span>
                            {att.file_size && <span style={{ fontSize: '0.75rem', color: '#999' }}>({(att.file_size / 1024 / 1024).toFixed(1)} MB)</span>}
                            <a
                              href={`${config.API_BASE_URL}/visits/${visit?.id}/reports/${report.id}/attachments/${att.id}/preview`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '0.8rem', color: 'var(--color-info)', textDecoration: 'none', padding: '2px 8px', border: '1px solid var(--color-info)', borderRadius: '4px' }}
                            >
                              View
                            </a>
                            <a
                              href={`${config.API_BASE_URL}/visits/${visit?.id}/reports/${report.id}/attachments/${att.id}/download`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '0.8rem', color: '#fff', textDecoration: 'none', padding: '2px 8px', backgroundColor: 'var(--color-info)', borderRadius: '4px' }}
                            >
                              Download
                            </a>
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

      {(visit.direct_attachments && visit.direct_attachments.length > 0) && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Visit Attachments ({visit.direct_attachments.length})</h2>
          <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1.5rem' }}>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {visit.direct_attachments.map((att: any) => (
                <li key={att.id} style={{ marginBottom: '0.5rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <span style={{ flex: 1 }}>{att.filename}</span>
                  {att.file_size && <span style={{ fontSize: '0.75rem', color: '#999' }}>({(att.file_size / 1024 / 1024).toFixed(1)} MB)</span>}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res: any = await apiService.downloadVisitDirectAttachment(visit.id, att.id);
                        const url = res?.data?.url || res?.url;
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                      } catch (e: any) {
                        alert(`Errore: ${e?.message || 'unknown'}`);
                      }
                    }}
                    style={{ fontSize: '0.8rem', color: '#fff', background: 'var(--color-info)', border: 'none', padding: '2px 10px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Apri
                  </button>
                </li>
              ))}
            </ul>
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
