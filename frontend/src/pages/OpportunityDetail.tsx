import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { apiService } from '../services/api';
import { Opportunity, OpportunityAdvance } from '../types';
import '../styles/Opportunities.css';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';

const formatCurrency = (val?: number, currency?: string) => {
  if (val == null) return '-';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: currency || 'EUR' }).format(val);
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  qualified: 'Qualified',
  negotiation: 'Negotiation',
  closed_won: 'Closed Won',
  closed_lost: 'Closed Lost',
};

export const OpportunityDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Advance form
  const [advDate, setAdvDate] = useState(new Date().toISOString().split('T')[0]);
  const [advDescription, setAdvDescription] = useState('');
  const [advFiles, setAdvFiles] = useState<File[]>([]);
  const [addingAdvance, setAddingAdvance] = useState(false);
  const advFileRef = useRef<HTMLInputElement>(null);

  // Linked report data
  const [reportTasks, setReportTasks] = useState<any[]>([]);
  const [reportAttachments, setReportAttachments] = useState<any[]>([]);

  // Attachment upload
  const mainFileRef = useRef<HTMLInputElement>(null);

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
    if (!id) return;
    loadOpportunity();
  }, [id]);

  const loadOpportunity = async () => {
    try {
      const res = await apiService.getOpportunityById(id!);
      if (res.success && res.data) {
        setOpportunity(res.data);
        // Load linked report tasks and attachments
        if (res.data.report_id && res.data.client_id) {
          try {
            const todosRes = await apiService.getTodos({ clientId: res.data.client_id });
            if (todosRes.success && todosRes.data) {
              const all = Array.isArray(todosRes.data) ? todosRes.data : [];
              setReportTasks(all.filter((t: any) => t.visit_report_id === res.data.report_id));
            }
          } catch {}
          if (res.data.report?.attachments) setReportAttachments(res.data.report.attachments);
        }
      } else {
        setError('Opportunity not found');
      }
    } catch (err) {
      setError('Error loading opportunity');
    } finally {
      setLoading(false);
    }
  };

  // ---- Attachments ----
  const handleUploadAttachment = async (file: File) => {
    try {
      await apiService.uploadOpportunityAttachment(id!, file);
      setSuccess('Attachment uploaded');
      loadOpportunity();
    } catch {
      setError('Error uploading attachment');
    }
  };

  const handleDownloadAttachment = async (attachmentId: string, filename: string) => {
    try {
      const res = await apiService.downloadOpportunityAttachment(id!, attachmentId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      setError('Error downloading attachment');
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await apiService.deleteOpportunityAttachment(id!, attachmentId);
      setSuccess('Attachment deleted');
      loadOpportunity();
    } catch {
      setError('Error deleting attachment');
    }
  };

  // ---- Advances ----
  const handleAddAdvance = async () => {
    if (!advDescription.trim()) return;
    setAddingAdvance(true);
    try {
      const res = await apiService.addOpportunityAdvance(id!, { date: advDate, description: advDescription.trim() });
      if (res.success && res.data) {
        const newAdvanceId = res.data.id;
        // Upload files for this advance
        for (const file of advFiles) {
          try {
            await apiService.uploadOpportunityAdvanceAttachment(id!, newAdvanceId, file);
          } catch {
            console.error('Failed to upload advance attachment');
          }
        }
        setAdvDate(new Date().toISOString().split('T')[0]);
        setAdvDescription('');
        setAdvFiles([]);
        setSuccess('Advance added');
        loadOpportunity();
      }
    } catch {
      setError('Error adding advance');
    } finally {
      setAddingAdvance(false);
    }
  };

  const handleDeleteAdvance = async (advanceId: string) => {
    if (!window.confirm('Delete this advance?')) return;
    try {
      await apiService.deleteOpportunityAdvance(id!, advanceId);
      setSuccess('Advance deleted');
      loadOpportunity();
    } catch {
      setError('Error deleting advance');
    }
  };

  // Advance attachment handlers
  const handleDownloadAdvanceAttachment = async (advanceId: string, attachmentId: string) => {
    try {
      const res = await apiService.downloadOpportunityAdvanceAttachment(id!, advanceId, attachmentId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      setError('Error downloading attachment');
    }
  };

  const handleDeleteAdvanceAttachment = async (advanceId: string, attachmentId: string) => {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await apiService.deleteOpportunityAdvanceAttachment(id!, advanceId, attachmentId);
      setSuccess('Attachment deleted');
      loadOpportunity();
    } catch {
      setError('Error deleting attachment');
    }
  };

  const handleUploadAdvanceAttachment = async (advanceId: string, file: File) => {
    try {
      await apiService.uploadOpportunityAdvanceAttachment(id!, advanceId, file);
      setSuccess('Attachment uploaded');
      loadOpportunity();
    } catch {
      setError('Error uploading attachment');
    }
  };

  // ---- Create Task ----
  const handleCreateTask = () => {
    navigate(`/todos/new?clientId=${opportunity?.client_id || ''}&companyId=${opportunity?.company_id || ''}&opportunityId=${id}`);
  };

  if (loading) return <div className="opp-detail-page"><div className="opp-loading">Loading...</div></div>;
  if (!opportunity) return <div className="opp-detail-page"><div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div></div>;

  return (
    <div className="opp-detail-page">
      {/* Header */}
      <div className="opp-detail-header">
        <h1>Opportunity Details</h1>
        <button className="opp-detail-back" onClick={() => navigate('/opportunities')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="opp-alert opp-alert-error">{error}</div>}
      {success && <div className="opp-alert opp-alert-success">{success}</div>}

      {/* Testata */}
      <div className="opp-detail-card">
        <div className="opp-detail-grid">
          <div className="opp-detail-field opp-detail-full">
            <label>Title</label>
            <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>{opportunity.title}</p>
          </div>
          <div className="opp-detail-field">
            <label>Client</label>
            <p>{opportunity.client?.name || '-'}</p>
          </div>
          <div className="opp-detail-field">
            <label>Company (Supplier)</label>
            <p>{opportunity.company?.name || '-'}</p>
          </div>
          <div className="opp-detail-field">
            <label>Status</label>
            <p>{STATUS_LABELS[opportunity.status] || opportunity.status}</p>
          </div>
          <div className="opp-detail-field">
            <label>Expected Close Date</label>
            <p>{formatDate(opportunity.expected_close_date)}</p>
          </div>
          <div className="opp-detail-field">
            <label>Estimated Value</label>
            <p>{formatCurrency(opportunity.estimated_value, opportunity.currency)}</p>
          </div>
          <div className="opp-detail-field">
            <label>Currency</label>
            <p>{opportunity.currency || 'EUR'}</p>
          </div>
          {opportunity.visit_id && (
            <div className="opp-detail-field">
              <label>Visit</label>
              <p><Link to={`/visits/${opportunity.visit_id}`} style={{ color: 'var(--color-info)', textDecoration: 'none' }}>View Visit</Link></p>
            </div>
          )}
          {opportunity.report_id && opportunity.report && (
            <div className="opp-detail-field">
              <label>Supplier Report</label>
              <p>{opportunity.report.company?.name || '-'} - {opportunity.report.section || '-'}</p>
            </div>
          )}
          <div className="opp-detail-field">
            <label>Created</label>
            <p>{formatDate(opportunity.created_at)}{opportunity.created_by_user ? ` by ${opportunity.created_by_user.name}` : ''}</p>
          </div>
        </div>

        {/* Linked Report Tasks */}
        {reportTasks.length > 0 && (
          <>
            <hr className="opp-detail-divider" />
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Report Tasks ({reportTasks.length})</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '1px solid #e0e0e0' }}>Task</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '1px solid #e0e0e0' }}>Assigned To</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '1px solid #e0e0e0' }}>Due Date</th>
                  <th style={{ textAlign: 'left', padding: '0.4rem 0.75rem', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', borderBottom: '1px solid #e0e0e0' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {reportTasks.map((t: any) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }}
                    onClick={() => navigate(`/tasks?highlight=${t.id}`)}
                  >
                    <td style={{ padding: '0.4rem 0.75rem', color: 'var(--color-info)' }}>{t.title}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>{t.assigned_to_user?.name || '-'}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>{t.due_date ? formatDate(t.due_date) : '-'}</td>
                    <td style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>{t.status === 'done' ? 'Completed' : t.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Linked Report Attachments */}
        {reportAttachments.length > 0 && (
          <>
            <hr className="opp-detail-divider" />
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Report Attachments ({reportAttachments.length})</h3>
            {reportAttachments.map((att: any) => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.4rem 0', fontSize: '0.85rem', borderBottom: '1px solid #eee' }}>
                <span style={{ fontSize: '1rem' }}>📎</span>
                <span style={{ flex: 1, wordBreak: 'break-all' }}>{att.filename}</span>
                <span style={{ color: '#888', fontSize: '0.75rem' }}>({(att.file_size / 1024 / 1024).toFixed(1)} MB)</span>
                <button onClick={async () => {
                  try {
                    const token = localStorage.getItem('token');
                    const { config: cfg } = await import('../config');
                    const resp = await fetch(`${cfg.API_BASE_URL}/visits/${opportunity.visit_id}/reports/${opportunity.report_id}/attachments/${att.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
                    const data = await resp.json();
                    if (data.success && data.data?.url) {
                      const a = document.createElement('a'); a.href = data.data.url; a.target = '_blank'; a.rel = 'noopener'; a.click();
                    }
                  } catch {}
                }} style={{ padding: '0.25rem 0.5rem', border: '1px solid #ccc', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}>View</button>
              </div>
            ))}
          </>
        )}

        {opportunity.description && (
          <>
            <hr className="opp-detail-divider" />
            <div className="opp-detail-field">
              <label>Description</label>
              <p style={{ whiteSpace: 'pre-wrap' }}>{opportunity.description}</p>
            </div>
          </>
        )}

        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => navigate(`/opportunities/${opportunity.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#4A6078', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
          >
            Edit
          </button>
          <button className="opp-task-btn" onClick={handleCreateTask}>
            + Create Task
          </button>
        </div>
      </div>

      {/* Attachments section */}
      <div className="opp-detail-card">
        <div className="opp-attachments-section">
          <h3>Attachments</h3>
          {opportunity.attachments && opportunity.attachments.length > 0 ? (
            <div className="opp-attachment-list">
              {opportunity.attachments.map(att => (
                <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                  <span>📎</span>
                  <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: '1.3' }}>{att.filename}</span>
                  <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{att.file_size ? `(${(att.file_size / 1024 / 1024).toFixed(1)} MB)` : ''}</span>
                  <button
                    onClick={async () => { const res = await apiService.downloadOpportunityAttachment(opportunity!.id, att.id); if (res.success && res.data?.url) window.open(res.data.url, '_blank'); }}
                    style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                  >View</button>
                  <button
                    onClick={async () => { const res = await apiService.downloadOpportunityAttachment(opportunity!.id, att.id); if (res.success && res.data?.url) { const a = document.createElement('a'); a.href = res.data.url; a.download = att.filename; a.target = '_blank'; a.click(); } }}
                    style={{ padding: '2px 8px', border: 'none', borderRadius: '3px', background: 'var(--color-info)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                  >Download</button>
                  <button onClick={() => handleDeleteAttachment(att.id)} style={{ padding: '2px 6px', border: 'none', background: 'transparent', color: '#c00', cursor: 'pointer', fontSize: '0.9rem' }} title="Delete">✕</button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: '0.813rem', color: 'var(--color-text-tertiary)', margin: '0 0 0.5rem' }}>No attachments yet.</p>
          )}
          <input
            ref={mainFileRef}
            type="file"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) handleUploadAttachment(file);
              e.target.value = '';
            }}
          />
          <div
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-info)'; e.currentTarget.style.background = '#f0f7ff'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.background = 'transparent'; }}
            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.background = 'transparent'; const files = e.dataTransfer.files; if (files.length > 0) { Array.from(files).forEach(f => handleUploadAttachment(f)); } }}
            onClick={() => mainFileRef.current?.click()}
            style={{ border: '2px dashed #ccc', borderRadius: '8px', padding: '1rem', textAlign: 'center', cursor: 'pointer', fontSize: '0.85rem', color: '#888', marginTop: '0.5rem' }}
          >
            📎 Drag files here or click to upload
          </div>
        </div>
      </div>

      {/* Advances section */}
      <div className="opp-detail-card">
        <div className="opp-advances-section">
          <h3>Advances</h3>
          {opportunity.advances && opportunity.advances.length > 0 ? (
            opportunity.advances.map((adv: OpportunityAdvance) => (
              <div key={adv.id} className="opp-advance-item">
                <div className="opp-advance-header">
                  <div>
                    <span className="opp-advance-date">{formatDate(adv.date)}</span>
                    {adv.created_by_user && <span className="opp-advance-by">by {adv.created_by_user.name}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      onClick={() => navigate(`/todos/new?clientId=${opportunity?.client_id || ''}&companyId=${opportunity?.company_id || ''}&opportunityId=${id}&returnTo=/opportunities/${id}`)}
                      style={{ padding: '0.3rem 0.6rem', background: 'var(--color-info)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}
                    >
                      + Task
                    </button>
                    <button className="opp-advance-delete" onClick={() => handleDeleteAdvance(adv.id)}>Delete</button>
                  </div>
                </div>
                <div className="opp-advance-description">{adv.description}</div>
                {/* Advance attachments */}
                {adv.attachments && adv.attachments.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    {adv.attachments.map(att => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.85rem', padding: '0.4rem 0.5rem', background: '#f9f9f6', borderRadius: '4px' }}>
                        <span style={{ marginTop: '2px' }}>📎</span>
                        <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: '1.4' }}>{att.filename}
                          <span style={{ color: '#888', fontSize: '0.75rem', marginLeft: '0.3rem' }}>{att.file_size ? `(${(att.file_size / 1024 / 1024).toFixed(1)} MB)` : ''}</span>
                        </span>
                        <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                          <button
                            onClick={async () => { const res = await apiService.downloadOpportunityAdvanceAttachment(opportunity!.id, adv.id, att.id); if (res.success && res.data?.url) window.open(res.data.url, '_blank'); }}
                            style={{ padding: '3px 8px', border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                          >View</button>
                          <button
                            onClick={async () => { const res = await apiService.downloadOpportunityAdvanceAttachment(opportunity!.id, adv.id, att.id); if (res.success && res.data?.url) { const a = document.createElement('a'); a.href = res.data.url; a.download = att.filename; a.target = '_blank'; a.click(); } }}
                            style={{ padding: '3px 8px', border: 'none', borderRadius: '3px', background: 'var(--color-info)', color: '#fff', cursor: 'pointer', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                          >Download</button>
                          <button onClick={() => handleDeleteAdvanceAttachment(adv.id, att.id)} style={{ padding: '3px 6px', border: 'none', background: 'transparent', color: '#c00', cursor: 'pointer', fontSize: '0.85rem' }}>✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Drag & drop + click upload for advance */}
                <div
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-info)'; e.currentTarget.style.background = '#f0f7ff'; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.background = 'transparent'; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = '#ccc'; e.currentTarget.style.background = 'transparent'; Array.from(e.dataTransfer.files).forEach(f => handleUploadAdvanceAttachment(adv.id, f)); }}
                  onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.onchange = (ev: any) => { Array.from(ev.target?.files || []).forEach((f: any) => handleUploadAdvanceAttachment(adv.id, f)); }; input.click(); }}
                  style={{ border: '1px dashed #ccc', borderRadius: '6px', padding: '0.5rem', textAlign: 'center', cursor: 'pointer', fontSize: '0.8rem', color: '#888', marginTop: '0.4rem' }}
                >
                  📎 Drop files or click to attach
                </div>
              </div>
            ))
          ) : (
            <p style={{ fontSize: '0.813rem', color: 'var(--color-text-tertiary)', margin: '0 0 0.5rem' }}>No advances yet.</p>
          )}

          {/* Inline add advance form */}
          <div className="opp-add-advance">
            <h4>Add Advance</h4>
            <div className="opp-add-advance-row">
              <input type="date" value={advDate} onChange={e => setAdvDate(e.target.value)} />
              <textarea
                placeholder="Describe the advance..."
                value={advDescription}
                onChange={e => setAdvDescription(e.target.value)}
                rows={1}
              />
              <button
                className="opp-advance-add-btn"
                onClick={handleAddAdvance}
                disabled={addingAdvance || !advDescription.trim()}
              >
                {addingAdvance ? 'Adding...' : 'Add'}
              </button>
            </div>
            <div className="opp-add-advance-files">
              <input
                ref={advFileRef}
                type="file"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) setAdvFiles(prev => [...prev, file]);
                  e.target.value = '';
                }}
              />
              <label className="opp-upload-label" onClick={() => advFileRef.current?.click()}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Attach File
              </label>
              {advFiles.map((f, i) => (
                <span key={i} className="opp-add-advance-file-chip">
                  {f.name}
                  <button onClick={() => setAdvFiles(prev => prev.filter((_, idx) => idx !== i))}>x</button>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OpportunityDetail;
