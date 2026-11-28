import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { openSignedLink } from '../utils/openSignedLink';
import { config } from '../config';
import { CompanyVisit, CompanyVisitAttachment } from '../types';
import '../styles/CrudPages.css';
import '../styles/VisitForms.css';
import { fmtNum } from '../utils/numberFormat';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

export const CompanyVisitDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<CompanyVisit | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<CompanyVisitAttachment[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleDownloadPdf = async () => {
    if (!visit) return;
    setPdfLoading(true);
    try {
      const blob = await apiService.exportCompanyVisitPdf(visit.id);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const slug = (visit.company?.name || 'fornitore').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      a.download = `report-${slug}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(`Errore generazione PDF: ${e?.message || 'Errore sconosciuto'}`);
    } finally {
      setPdfLoading(false);
    }
  };
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); }
  }, [success]);

  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(''), 6000); return () => clearTimeout(t); }
  }, [error]);

  const loadVisit = async () => {
    if (!id) return;
    try {
      const res = await apiService.getCompanyVisitById(id);
      if (res.success && res.data) {
        setVisit(res.data);
        try {
          const offersRes = await apiService.getOffers({ company_visit_id: id });
          if (offersRes.success && offersRes.data) {
            setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
          }
        } catch {}
        try {
          const tasksRes = await apiService.getTodosByCompanyVisitId(id);
          if (tasksRes.success && tasksRes.data) {
            setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
          }
        } catch {}
        try {
          const usersRes: any = await apiService.getUsers();
          if (usersRes?.success && Array.isArray(usersRes.data)) setUsers(usersRes.data);
        } catch {}
        try {
          const attRes = await apiService.getCompanyVisitAttachments(id);
          if (attRes.success && attRes.data) {
            setAttachments(attRes.data);
          }
        } catch {}
      } else {
        setError('Meeting not found');
      }
    } catch (err) {
      setError('Error loading meeting');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVisit();
  }, [id]);

  // ---- Attachment handlers ----
  const handleUploadAttachment = async (file: File, attachmentType: string = 'post_visit') => {
    if (!id) return;
    setUploading(true);
    try {
      await apiService.uploadCompanyVisitAttachment(id, file, attachmentType);
      setSuccess('Attachment uploaded');
      const attRes = await apiService.getCompanyVisitAttachments(id);
      if (attRes.success && attRes.data) setAttachments(attRes.data);
    } catch {
      setError('Error uploading attachment');
    } finally {
      setUploading(false);
    }
  };

  const handleViewAttachment = (attachmentId: string) => {
    if (!id) return;
    openSignedLink(() => apiService.getCompanyVisitAttachmentLink(id, attachmentId, 'preview'));
  };

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadCompanyVisitAttachment(id, attachmentId);
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

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!id) return;
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await apiService.deleteCompanyVisitAttachment(id, attachmentId);
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      setSuccess('Attachment deleted');
    } catch {
      setError('Error deleting attachment');
    }
  };

  const renderAttachmentSection = (title: string, type: string) => {
    const filtered = attachments.filter((a: any) => (a.attachment_type || 'post_visit') === type);
    return (
      <div style={{ marginTop: '1.25rem', paddingTop: '1.1rem', borderTop: '1px solid var(--color-border)' }}>
        <div className="vx-label">{title} ({filtered.length})</div>
        {filtered.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            {filtered.map((att: any) => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '15px', padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <span>📎</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{att.filename}</span>
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '13px', whiteSpace: 'nowrap' }}>{att.file_size ? formatFileSize(att.file_size) : ''}</span>
                <button className="vx-btn vx-sm" onClick={() => handleViewAttachment(att.id)}>View</button>
                <button className="vx-btn vx-sm vx-primary" onClick={() => handleDownloadAttachment(att.id, att.filename)}>Download</button>
                <button className="vx-link-danger" style={{ marginLeft: 0 }} onClick={() => handleDeleteAttachment(att.id)} title="Delete">✕</button>
              </div>
            ))}
          </div>
        )}
        <div
          className={`cv-attachment-dropzone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(f => handleUploadAttachment(f, type)); }}
          onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.onchange = (ev: any) => { const files = ev.target?.files; if (files) Array.from(files).forEach((f: any) => handleUploadAttachment(f, type)); }; input.click(); }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span>{uploading ? 'Uploading...' : 'Drop files here or click to upload'}</span>
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!visit) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div>;

  const v: any = visit;
  const statusTone: Record<string, { color: string; bg: string; label: string }> = {
    scheduled: { color: '#8a7630', bg: 'rgba(176, 152, 64, 0.14)', label: 'Scheduled' },
    completed: { color: 'var(--color-success)', bg: 'rgba(91, 138, 101, 0.13)', label: 'Completed' },
    cancelled: { color: 'var(--color-error)', bg: 'rgba(158, 90, 82, 0.12)', label: 'Cancelled' },
  };
  const st = statusTone[visit.status] || statusTone.scheduled;
  let internalNames = '';
  try {
    const ids: string[] = visit.participants_user_ids ? JSON.parse(visit.participants_user_ids) : [];
    internalNames = ids.map(uid => users.find(u => u.id === uid)?.name || '').filter(Boolean).join(', ');
  } catch {}

  return (
    <div className="vx-page vx-detail">
      <button className="vx-back" onClick={() => navigate('/company-visits')}>← Back to Supplier Meetings</button>
      <div className="vx-head">
        <div>
          <h1>{visit.company?.name || 'Supplier Meeting'}</h1>
          <div className="vx-sub">Supplier meeting · {formatDate(visit.date)}</div>
        </div>
        <div className="vx-head-actions">
          <button className="vx-btn" onClick={handleDownloadPdf} disabled={pdfLoading} title="Scarica il report PDF di questa visita">
            {pdfLoading ? '⏳…' : '📄 PDF'}
          </button>
          <button className="vx-btn" onClick={() => navigate(`/todos/new?companyVisitId=${id}&companyId=${visit.company_id}&returnTo=/company-visits/${id}`)}>+ Task</button>
          <button className="vx-btn vx-primary" onClick={() => navigate(`/company-visits/${visit.id}/edit`)}>Edit</button>
        </div>
      </div>

      {error && <div style={{ padding: '0.75rem 1rem', background: '#fdecea', color: '#c00', borderRadius: '10px', marginBottom: '1rem', fontSize: '15px' }}>{error}</div>}
      {success && <div style={{ padding: '0.75rem 1rem', background: '#eaf6ec', color: '#2e7d32', borderRadius: '10px', marginBottom: '1rem', fontSize: '15px' }}>{success}</div>}

      <div className="vx-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div className="vx-avatar">{(visit.company?.name || '?').charAt(0)}</div>
            <div className="vx-value" style={{ fontWeight: 600 }}>{visit.company?.name || '-'}</div>
          </div>
          <span className="vx-pill" style={{ color: st.color, background: st.bg }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor' }} />
            {st.label}
          </span>
        </div>
        <div className="vx-facts">
          <div><div className="vx-label">Date</div><p className="vx-value">{formatDate(visit.date)}</p></div>
          <div><div className="vx-label">Meeting Type</div><p className="vx-value">{visit.meeting_type === 'call' ? '📞 Call' : visit.meeting_type === 'video_call' ? '📹 Video Call' : '🏢 In Person'}</p></div>
          {v.zone && <div><div className="vx-label">Zone / Sales Area</div><p className="vx-value">{v.zone}</p></div>}
          {visit.created_by_user?.name && <div><div className="vx-label">Created By</div><p className="vx-value">{visit.created_by_user.name}</p></div>}
          {internalNames && <div><div className="vx-label">Participants - Internal</div><p className="vx-value">{internalNames}</p></div>}
          {visit.participants_external && <div><div className="vx-label">Participants - External</div><p className="vx-value" style={{ whiteSpace: 'pre-wrap' }}>{visit.participants_external}</p></div>}
        </div>
      </div>

      {visit.preparation && (
        <div className="vx-card">
          <div className="vx-label">Preparation / Pre-meeting Notes</div>
          <p className="vx-prose" style={{ color: 'var(--color-text-secondary)' }}>{visit.preparation}</p>
        </div>
      )}

      <div className="vx-section"><h2>Report</h2></div>
      <div className="vx-card vx-report">
        <h3 className="vx-report-title">{visit.subject || '-'}</h3>
        <div className="vx-report-company" style={{ marginBottom: '1rem' }}>{visit.company?.name}</div>
        {visit.report
          ? <p className="vx-prose">{visit.report}</p>
          : <p style={{ color: 'var(--color-text-tertiary)', fontSize: '16px', margin: 0 }}>No report written yet. Click Edit to add it.</p>}
        {renderAttachmentSection('Pre-visit attachments', 'pre_visit')}
        {renderAttachmentSection('Post-visit attachments', 'post_visit')}
      </div>

      {/* Offers section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Offers ({offers.length})</h2>
          <button
            onClick={() => navigate(`/offers/new?companyVisitId=${id}&companyId=${visit.company_id}`)}
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
                      {offer.total_amount != null ? `${offer.currency || '\u20AC'} ${fmtNum(offer.total_amount, { minimumFractionDigits: 2 })}` : '-'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-info)', fontWeight: '600' }}>View →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No offers linked to this meeting.</p>
        )}
      </div>

      {/* Tasks section */}
      <div className="vx-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Tasks ({tasks.length})</h2>
          <button
            onClick={() => navigate(`/todos/new?companyVisitId=${id}&companyId=${visit.company_id}&returnTo=/company-visits/${id}`)}
            style={{ padding: '0.4rem 0.8rem', background: 'var(--color-info, #4A6078)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            + New Task
          </button>
        </div>
        {tasks.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '2px solid #e0e0e0' }}>Task</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '2px solid #e0e0e0' }}>Assigned To</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '2px solid #e0e0e0' }}>Due Date</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '2px solid #e0e0e0' }}>Priority</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '2px solid #e0e0e0' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => {
                const isOverdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'done';
                const statusColors: Record<string, string> = { todo: '#B09840', in_progress: '#4A6078', done: '#5B8A65' };
                return (
                  <tr key={t.id}
                    style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                    onDoubleClick={() => navigate(`/tasks?highlight=${t.id}`)}
                    title="Double-click to view in Tasks list"
                  >
                    <td style={{ padding: '0.5rem 0.75rem', color: isOverdue ? '#c00' : 'var(--color-info, #4A6078)', fontWeight: 500 }}>{t.title}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>{t.assigned_to_user?.name || '-'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: isOverdue ? '#c00' : undefined }}>{t.due_date ? formatDate(t.due_date) : '-'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: '#D4A017' }}>{'★'.repeat(t.priority || 1)}{'☆'.repeat(3 - (t.priority || 1))}</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>
                      <span style={{ padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 600, background: `${statusColors[t.status] || '#888'}20`, color: statusColors[t.status] || '#888' }}>
                        {t.status === 'in_progress' ? 'In Progress' : t.status === 'done' ? 'Done' : 'To Do'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No tasks linked to this meeting.</p>
        )}
      </div>
    </div>
  );
};

export default CompanyVisitDetail;
