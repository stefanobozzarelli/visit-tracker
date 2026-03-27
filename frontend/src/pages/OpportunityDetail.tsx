import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
          {opportunity.project && (
            <div className="opp-detail-field">
              <label>Project</label>
              <p>#{opportunity.project.project_number} - {opportunity.project.project_name || 'Untitled'}</p>
            </div>
          )}
          <div className="opp-detail-field">
            <label>Created</label>
            <p>{formatDate(opportunity.created_at)}{opportunity.created_by_user ? ` by ${opportunity.created_by_user.name}` : ''}</p>
          </div>
        </div>

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
                  <span style={{ flex: 1 }}>{att.filename}</span>
                  <span style={{ color: '#888', fontSize: '0.75rem' }}>{att.file_size ? `(${(att.file_size / 1024 / 1024).toFixed(1)} MB)` : ''}</span>
                  <button
                    onClick={async () => { const blob = await apiService.downloadOpportunityAttachment(opportunity!.id, att.id); const url = URL.createObjectURL(blob); window.open(url, '_blank'); }}
                    style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                  >View</button>
                  <button
                    onClick={async () => { const blob = await apiService.downloadOpportunityAttachment(opportunity!.id, att.id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = att.filename; a.click(); }}
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
          <label className="opp-upload-label" onClick={() => mainFileRef.current?.click()}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Upload File
          </label>
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
                  <div className="opp-advance-attachments">
                    {adv.attachments.map(att => (
                      <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                        <span>📎</span>
                        <span style={{ flex: 1 }}>{att.filename}</span>
                        <span style={{ color: '#888', fontSize: '0.75rem' }}>{att.file_size ? `(${(att.file_size / 1024 / 1024).toFixed(1)} MB)` : ''}</span>
                        <button
                          onClick={async () => { const blob = await apiService.downloadOpportunityAdvanceAttachment(opportunity!.id, adv.id, att.id); const url = URL.createObjectURL(blob); window.open(url, '_blank'); }}
                          style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                        >View</button>
                        <button
                          onClick={async () => { const blob = await apiService.downloadOpportunityAdvanceAttachment(opportunity!.id, adv.id, att.id); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = att.filename; a.click(); }}
                          style={{ padding: '2px 8px', border: 'none', borderRadius: '3px', background: 'var(--color-info)', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                        >Download</button>
                        <button onClick={() => handleDeleteAdvanceAttachment(adv.id, att.id)} style={{ padding: '2px 6px', border: 'none', background: 'transparent', color: '#c00', cursor: 'pointer', fontSize: '0.9rem' }} title="Delete">✕</button>
                      </div>
                    ))}
                  </div>
                )}
                {/* Upload more attachments to existing advance */}
                <div style={{ marginTop: '0.375rem' }}>
                  <label className="opp-upload-label" onClick={() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.onchange = (ev: any) => {
                      const file = ev.target?.files?.[0];
                      if (file) handleUploadAdvanceAttachment(adv.id, file);
                    };
                    input.click();
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Attach
                  </label>
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
