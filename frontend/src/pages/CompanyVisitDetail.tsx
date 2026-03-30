import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { config } from '../config';
import { CompanyVisit, CompanyVisitAttachment } from '../types';
import '../styles/CrudPages.css';

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
  const [attachments, setAttachments] = useState<CompanyVisitAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
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
  const handleUploadAttachment = async (file: File) => {
    if (!id) return;
    setUploading(true);
    try {
      await apiService.uploadCompanyVisitAttachment(id, file);
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
    window.open(`${config.API_BASE_URL}/company-visits/${id}/attachments/${attachmentId}/preview`, '_blank');
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

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!visit) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>Not found</div>;

  return (
    <div style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
      <button onClick={() => navigate('/company-visits')} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Supplier Meeting Details</h1>

      {/* Alerts */}
      {error && <div style={{ padding: '0.75rem 1rem', background: '#fdecea', color: '#c00', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</div>}
      {success && <div style={{ padding: '0.75rem 1rem', background: '#eaf6ec', color: '#2e7d32', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem' }}>{success}</div>}

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Supplier</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{visit.company?.name || '-'}</p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Date</label>
            <p style={{ margin: 0, fontSize: '1rem' }}>{formatDate(visit.date)}</p>
          </div>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Status</label>
          <p style={{ margin: 0, fontSize: '1rem' }}>{visit.status || '-'}</p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Subject</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.subject || '-'}</p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Participants</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.participants || '-'}</p>
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Notes</label>
          <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.notes || '-'}</p>
        </div>

        {visit.preparation && (
          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Preparation / Pre-meeting Notes</label>
            <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap' }}>{visit.preparation}</p>
          </div>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/company-visits/${visit.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>

      {/* Attachments section */}
      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem' }}>Attachments</h2>
        {attachments.length > 0 ? (
          <div style={{ marginBottom: '1rem' }}>
            {attachments.map(att => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', fontSize: '0.875rem', padding: '0.4rem 0', borderBottom: '1px solid #eee' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                <span style={{ flex: 1, wordBreak: 'break-word', lineHeight: '1.3' }}>{att.filename}</span>
                <span style={{ color: '#888', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{att.file_size ? formatFileSize(att.file_size) : ''}</span>
                <button
                  onClick={() => handleViewAttachment(att.id)}
                  style={{ padding: '2px 8px', border: '1px solid #ccc', borderRadius: '3px', background: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                >View</button>
                <button
                  onClick={() => handleDownloadAttachment(att.id, att.filename)}
                  style={{ padding: '2px 8px', border: 'none', borderRadius: '3px', background: '#007bff', color: '#fff', cursor: 'pointer', fontSize: '0.8rem' }}
                >Download</button>
                <button
                  onClick={() => handleDeleteAttachment(att.id)}
                  style={{ padding: '2px 6px', border: 'none', background: 'transparent', color: '#c00', cursor: 'pointer', fontSize: '0.9rem' }}
                  title="Delete"
                >&#10005;</button>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.813rem', color: '#888', margin: '0 0 0.5rem' }}>No attachments yet.</p>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={e => {
            const files = e.target.files;
            if (files) Array.from(files).forEach(f => handleUploadAttachment(f));
            e.target.value = '';
          }}
        />
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); Array.from(e.dataTransfer.files).forEach(f => handleUploadAttachment(f)); }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? '#007bff' : '#ccc'}`,
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center',
            cursor: 'pointer',
            fontSize: '0.85rem',
            color: '#888',
            background: dragOver ? '#f0f7ff' : 'transparent',
            transition: 'all 0.2s',
          }}
        >
          {uploading ? 'Uploading...' : (
            <span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', marginRight: '8px' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Drag files here or click to upload
            </span>
          )}
        </div>
      </div>

      {/* Offers section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Offers ({offers.length})</h2>
          <button
            onClick={() => navigate(`/offers/new?companyVisitId=${id}&companyId=${visit.company_id}`)}
            style={{ padding: '0.4rem 0.8rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
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
                    <span style={{ fontSize: '0.8rem', color: '#007bff', fontWeight: '600' }}>View →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No offers linked to this meeting.</p>
        )}
      </div>
    </div>
  );
};

export default CompanyVisitDetail;
