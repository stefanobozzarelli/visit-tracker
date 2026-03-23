import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Offer, OfferItem, OfferAttachment, OfferStatus } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/Offers.css';

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');
const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const STATUS_CONFIG: Record<OfferStatus, { label: string; color: string }> = {
  draft:    { label: 'Draft',    color: '#b0b0b0' },
  sent:     { label: 'Sent',     color: '#3498DB' },
  accepted: { label: 'Accepted', color: '#2ECC71' },
  rejected: { label: 'Rejected', color: '#E74C3C' },
  expired:  { label: 'Expired',  color: '#8A7F72' },
};

export const OfferDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin';

  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [exporting, setExporting] = useState(false);

  // Attachment upload
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

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

  useEffect(() => { loadOffer(); }, [id]);

  const loadOffer = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const r = await apiService.getOffer(id);
      if (r.success && r.data) {
        setOffer(r.data);
      } else {
        setError('Offer not found');
      }
    } catch {
      setError('Error loading offer');
    } finally {
      setLoading(false);
    }
  };

  // Delete offer
  const handleDelete = async () => {
    if (!id) return;
    if (!window.confirm('Delete this offer? This cannot be undone.')) return;
    try {
      await apiService.deleteOffer(id);
      navigate('/offers');
    } catch {
      setError('Error deleting offer');
    }
  };

  // Delete item
  const handleDeleteItem = async (itemId: string) => {
    if (!id) return;
    if (!window.confirm('Delete this item?')) return;
    try {
      await apiService.deleteOfferItem(id, itemId);
      setSuccess('Item deleted');
      await loadOffer();
    } catch {
      setError('Error deleting item');
    }
  };

  // Offer-level attachments
  const handleUploadAttachment = async (files: FileList | null) => {
    if (!id || !files || files.length === 0) return;
    setUploadingAttachment(true);
    try {
      for (let i = 0; i < files.length; i++) {
        await apiService.uploadOfferAttachment(id, files[i]);
      }
      setSuccess(`${files.length} file${files.length > 1 ? 's' : ''} uploaded`);
      await loadOffer();
    } catch {
      setError('Error uploading file');
    } finally {
      setUploadingAttachment(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadOfferAttachment(id, attachmentId);
      if (res.success && res.data?.url) {
        window.open(res.data.url, '_blank');
      }
    } catch {
      setError('Error downloading file');
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!id) return;
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await apiService.deleteOfferAttachment(id, attachmentId);
      setSuccess('Attachment deleted');
      await loadOffer();
    } catch {
      setError('Error deleting attachment');
    }
  };

  // Export
  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const blob = format === 'pdf'
        ? await apiService.exportOffersPdf({ offer_id: id })
        : await apiService.exportOffersExcel({ offer_id: id });
      downloadBlob(blob, `offer-${id?.substring(0, 8)}-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
      setError('Error exporting');
    } finally {
      setExporting(false);
    }
  };

  // Render
  if (loading) return <div className="off-page"><div className="off-loading">Loading...</div></div>;
  if (!offer) return <div className="off-page"><div className="off-loading">Offer not found</div></div>;

  const statusCfg = STATUS_CONFIG[offer.status] || STATUS_CONFIG.draft;
  const items = offer.items || [];
  const attachments = offer.attachments || [];

  return (
    <div className="off-page">
      {/* Header */}
      <div className="off-header">
        <div className="off-header-left">
          <button className="off-back-btn" onClick={() => navigate('/offers')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
            Back to Offers
          </button>
          <h1>Offer Details</h1>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            style={{ padding: '0.5rem 0.75rem', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
          >
            PDF
          </button>
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting}
            style={{ padding: '0.5rem 0.75rem', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Excel
          </button>
          <button className="off-action-btn primary" onClick={() => navigate(`/offers/${id}/edit`)}>Edit</button>
          {isAdmin && <button className="off-action-btn danger" onClick={handleDelete}>Delete</button>}
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="off-alert off-alert-error">{error}</div>}
      {success && <div className="off-alert off-alert-success">{success}</div>}

      {/* Info card */}
      <div className="off-detail-card">
        <h3 style={{ margin: '0 0 1rem', fontSize: '1.125rem' }}>Offer Information</h3>
        <div className="off-detail-grid">
          <div className="off-detail-item">
            <span className="off-detail-label">Client</span>
            <span className="off-detail-value">
              {offer.client ? (
                <button type="button" className="off-link" onClick={() => navigate(`/contacts/${offer.client_id}`)}>
                  {offer.client.name}
                </button>
              ) : offer.client_id || '-'}
            </span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Supplier</span>
            <span className="off-detail-value">{offer.company?.name || '-'}</span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Project</span>
            <span className="off-detail-value">
              {offer.project_id ? (
                <button type="button" className="off-link" onClick={() => navigate(`/projects/${offer.project_id}`)}>
                  {offer.project?.project_name || `Project #${offer.project_id.substring(0, 8)}`}
                </button>
              ) : '-'}
            </span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Offer Date</span>
            <span className="off-detail-value">{formatDate(offer.offer_date)}</span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Valid Until</span>
            <span className="off-detail-value">{offer.valid_until ? formatDate(offer.valid_until) : '-'}</span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Status</span>
            <span className="off-detail-value">
              <span
                className="off-status-badge"
                style={{
                  background: `${statusCfg.color}18`,
                  color: statusCfg.color,
                  borderColor: `${statusCfg.color}33`,
                }}
              >
                <span className="off-status-dot" style={{ backgroundColor: statusCfg.color }} />
                {statusCfg.label}
              </span>
            </span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Total Amount</span>
            <span className="off-detail-value" style={{ fontWeight: 600, fontSize: '1.125rem' }}>
              {offer.currency || '\u20AC'} {Number(offer.total_amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="off-detail-item">
            <span className="off-detail-label">Currency</span>
            <span className="off-detail-value">{offer.currency || 'EUR'}</span>
          </div>
          {offer.visit_id && (
            <div className="off-detail-item">
              <span className="off-detail-label">Linked Visit</span>
              <span className="off-detail-value">
                <button type="button" className="off-link" onClick={() => navigate(`/visits/${offer.visit_id}`)}>
                  {offer.visit ? `${formatDate(offer.visit.visit_date)} - ${offer.visit.client?.name || ''}` : 'View Visit'}
                </button>
              </span>
            </div>
          )}
          {offer.company_visit_id && (
            <div className="off-detail-item">
              <span className="off-detail-label">Linked Company Visit</span>
              <span className="off-detail-value">
                <button type="button" className="off-link" onClick={() => navigate(`/company-visits/${offer.company_visit_id}`)}>
                  {offer.company_visit ? `${formatDate(offer.company_visit.visit_date)} - ${offer.company_visit.company?.name || ''}` : 'View Company Visit'}
                </button>
              </span>
            </div>
          )}
          {offer.notes && (
            <div className="off-detail-item off-detail-full">
              <span className="off-detail-label">Notes</span>
              <span className="off-detail-value off-notes-text">{offer.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items section - card layout */}
      <div className="off-detail-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Line Items ({items.length})</h3>
          <button
            type="button"
            className="off-btn-new"
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }}
            onClick={() => navigate(`/offers/${id}/items/new`)}
          >
            + Add Item
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
            No items yet. Click "+ Add Item" to add line items.
          </div>
        ) : (
          <div className="off-table-wrap">
            <table className="off-table" style={{ fontSize: '0.8125rem' }}>
              <thead>
                <tr>
                  <th>Serie</th>
                  <th>Articolo</th>
                  <th>Finitura</th>
                  <th>Formato</th>
                  <th>Sp. MM</th>
                  <th>€ Unit.</th>
                  <th>U.M.</th>
                  <th>Qty</th>
                  <th>Totale</th>
                  <th>Tipo</th>
                  <th>Consegna</th>
                  <th>Note</th>
                  <th>Allegati</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>{item.serie || '-'}</td>
                    <td>{item.articolo || '-'}</td>
                    <td>{item.finitura || '-'}</td>
                    <td>{item.formato || '-'}</td>
                    <td>{item.spessore_mm != null ? item.spessore_mm : '-'}</td>
                    <td>{Number(item.prezzo_unitario || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                    <td>{item.unita_misura || '-'}</td>
                    <td>{Number(item.quantita || 0).toLocaleString('it-IT')}</td>
                    <td style={{ fontWeight: 600 }}>€ {Number(item.total_amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                    <td>
                      <span className={`off-item-tipo ${item.tipo_offerta}`}>
                        {item.tipo_offerta === 'progetto' ? 'Prog.' : 'Retail'}
                      </span>
                      {item.promozionale && <span className="off-item-tag promo" style={{ marginLeft: '0.25rem' }}>P</span>}
                    </td>
                    <td>{item.consegna_prevista ? formatDate(item.consegna_prevista) : '-'}</td>
                    <td style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.note || ''}>{item.note || '-'}</td>
                    <td>
                      {item.attachments && item.attachments.length > 0 ? (
                        <span
                          className="off-item-att-badge"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            item.attachments!.forEach(async (att) => {
                              try {
                                const res = await apiService.downloadOfferItemAttachment(id!, item.id, att.id);
                                if (res.success && res.data?.url) window.open(res.data.url, '_blank');
                              } catch {}
                            });
                          }}
                        >
                          📎 {item.attachments.length}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button type="button" className="off-action-btn primary" onClick={() => navigate(`/offers/${id}/items/${item.id}/edit`)}>Edit</button>
                        <button type="button" className="off-action-btn danger" onClick={() => handleDeleteItem(item.id)}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Offer-level Attachments */}
      <div className="off-detail-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Attachments ({attachments.length})</h3>
          <button
            type="button"
            className="off-btn-new"
            style={{ fontSize: '0.8125rem', padding: '0.4rem 0.875rem' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAttachment}
          >
            {uploadingAttachment ? 'Uploading...' : '+ Upload File'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={e => handleUploadAttachment(e.target.files)}
          />
        </div>

        {attachments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
            No attachments yet
          </div>
        ) : (
          <div className="off-attachments-list">
            {attachments.map(att => (
              <div key={att.id} className="off-attachment-row">
                <div className="off-attachment-info">
                  <span className="off-attachment-name">{att.filename}</span>
                  <span className="off-attachment-size">{formatFileSize(att.file_size)}</span>
                  <span className="off-attachment-date">{formatDate(att.created_at)}</span>
                </div>
                <div className="off-attachment-actions">
                  <button type="button" className="off-action-btn primary" onClick={() => handleDownloadAttachment(att.id)}>Download</button>
                  <button type="button" className="off-action-btn danger" onClick={() => handleDeleteAttachment(att.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfferDetail;
