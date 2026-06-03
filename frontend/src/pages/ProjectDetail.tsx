import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Project } from '../types';

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';
const formatCurrency = (v?: number) => v != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) : '-';
const formatBytes = (b?: number) => {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '2rem' }}>
    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '1rem', marginTop: 0, borderBottom: '2px solid #007bff', paddingBottom: '0.5rem' }}>{title}</h3>
    {children}
  </div>
);

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>{label}</label>
    <p style={{ margin: 0, fontSize: '1rem' }}>{value || '-'}</p>
  </div>
);

export const ProjectDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [offers, setOffers] = useState<any[]>([]);
  const [offersTotal, setOffersTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Attachments
  const [attachments, setAttachments] = useState<any[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  // Movements
  const [movements, setMovements] = useState<any[]>([]);
  const [newMovDate, setNewMovDate] = useState(new Date().toISOString().slice(0, 10));
  const [newMovAction, setNewMovAction] = useState('');
  const [savingMovement, setSavingMovement] = useState(false);
  const [editMovId, setEditMovId] = useState<string | null>(null);
  const [editMovDate, setEditMovDate] = useState('');
  const [editMovAction, setEditMovAction] = useState('');
  const [uploadingMovAtt, setUploadingMovAtt] = useState<string | null>(null);

  const loadAttachments = async () => {
    if (!id) return;
    try {
      const res = await apiService.getProjectAttachments(id);
      if (res.success && res.data) setAttachments(Array.isArray(res.data) ? res.data : []);
    } catch {}
  };

  const loadMovements = async () => {
    if (!id) return;
    try {
      const res = await apiService.getProjectMovements(id);
      if (res.success && res.data) setMovements(Array.isArray(res.data) ? res.data : []);
    } catch {}
  };

  useEffect(() => {
    if (!id) return;
    const loadProject = async () => {
      try {
        const res = await apiService.getProject(id);
        if (res.success && res.data) {
          setProject(res.data);
          try {
            const offersRes = await apiService.getOffers({ project_id: id });
            if (offersRes.success && offersRes.data) {
              setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
            }
          } catch {}
          try {
            const totalRes = await apiService.getProjectOffersTotal(id);
            if (totalRes.success && totalRes.data) setOffersTotal(Number(totalRes.data.offers_total || 0));
          } catch {}
          await loadAttachments();
          await loadMovements();
        } else {
          setError('Project not found');
        }
      } catch (err) {
        setError('Error loading project');
      } finally {
        setLoading(false);
      }
    };
    loadProject();
  }, [id]);

  // ---- Attachment handlers ----
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = '';
    setUploadingAttachment(true);
    try {
      await apiService.uploadProjectAttachment(id, file);
      await loadAttachments();
    } catch {
      alert('Errore durante il caricamento dell’allegato');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleDownloadAttachment = async (attachmentId: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadProjectAttachment(id, attachmentId);
      if (res.success && res.data?.url) window.open(res.data.url, '_blank');
    } catch {
      alert('Errore durante il download');
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!id || !window.confirm('Eliminare questo allegato?')) return;
    try {
      await apiService.deleteProjectAttachment(id, attachmentId);
      await loadAttachments();
    } catch {
      alert('Errore durante l’eliminazione');
    }
  };

  // ---- Movement handlers ----
  const handleAddMovement = async () => {
    if (!id || !newMovAction.trim()) return;
    setSavingMovement(true);
    try {
      await apiService.addProjectMovement(id, { date: newMovDate, action: newMovAction.trim() });
      setNewMovAction('');
      setNewMovDate(new Date().toISOString().slice(0, 10));
      await loadMovements();
    } catch {
      alert('Errore durante il salvataggio del movimento');
    } finally {
      setSavingMovement(false);
    }
  };

  const startEditMovement = (m: any) => {
    setEditMovId(m.id);
    setEditMovDate(m.date ? new Date(m.date).toISOString().slice(0, 10) : '');
    setEditMovAction(m.action || '');
  };

  const handleUpdateMovement = async () => {
    if (!id || !editMovId) return;
    try {
      await apiService.updateProjectMovement(id, editMovId, { date: editMovDate, action: editMovAction });
      setEditMovId(null);
      await loadMovements();
    } catch {
      alert('Errore durante l’aggiornamento');
    }
  };

  const handleDeleteMovement = async (movementId: string) => {
    if (!id || !window.confirm('Eliminare questo movimento?')) return;
    try {
      await apiService.deleteProjectMovement(id, movementId);
      await loadMovements();
    } catch {
      alert('Errore durante l’eliminazione');
    }
  };

  const handleUploadMovAtt = async (movementId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!id || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    e.target.value = '';
    setUploadingMovAtt(movementId);
    try {
      await apiService.uploadProjectMovementAttachment(id, movementId, file);
      await loadMovements();
    } catch {
      alert('Errore durante il caricamento dell’allegato');
    } finally {
      setUploadingMovAtt(null);
    }
  };

  const handleDownloadMovAtt = async (movementId: string, attachmentId: string) => {
    if (!id) return;
    try {
      const res = await apiService.downloadProjectMovementAttachment(id, movementId, attachmentId);
      if (res.success && res.data?.url) window.open(res.data.url, '_blank');
    } catch {
      alert('Errore durante il download');
    }
  };

  const handleDeleteMovAtt = async (movementId: string, attachmentId: string) => {
    if (!id || !window.confirm('Eliminare questo allegato?')) return;
    try {
      await apiService.deleteProjectMovementAttachment(id, movementId, attachmentId);
      await loadMovements();
    } catch {
      alert('Errore durante l’eliminazione');
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!project) return <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>{error || 'Not found'}</div>;

  const linkStyle: React.CSSProperties = { color: '#007bff', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: 'none', border: 'none', padding: 0 };

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <button onClick={() => navigate(-1)} style={{ marginBottom: '1rem', padding: '0.5rem 1rem', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' }}>
        ← Back
      </button>

      <h1 style={{ marginBottom: '1.5rem' }}>Project Details - {project.project_name || 'Untitled'}</h1>

      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '2rem', marginBottom: '2rem' }}>
        {/* Basic Information */}
        <Section title="Basic Information">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <Field label="Project #" value={project.project_number || ''} />
            <Field label="Status" value={project.status || ''} />
            <Field label="Registration Date" value={formatDate(project.registration_date)} />
          </div>
        </Section>

        {/* Parties */}
        <Section title="Parties">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <Field label="Client" value={project.client?.name || ''} />
            <Field label="Supplier" value={project.supplier?.name || ''} />
            <Field label="Country" value={project.country || ''} />
            <Field label="Architect / Designer" value={project.architect_designer || ''} />
            <Field label="Developer" value={project.developer || ''} />
            <Field label="Contractor" value={project.contractor || ''} />
          </div>
        </Section>

        {/* Project Details */}
        <Section title="Project Details">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
            <Field label="Project Address" value={project.project_address || ''} />
            <Field label="Project Type" value={project.project_type || ''} />
            <Field label="Detail of Project Type" value={project.detail_of_project_type || ''} />
            <Field label="Designated Area" value={project.designated_area || ''} />
          </div>
        </Section>

        {/* Items & Quantities */}
        {(project.item || project.quantity) && (
          <Section title="Items & Quantities">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <Field label="Item" value={project.item || ''} />
              <Field label="Quantity" value={project.quantity || ''} />
            </div>
          </Section>
        )}

        {/* Project Development & Registration */}
        <Section title="Status & Development">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <Field label="Project Development" value={project.project_development || ''} />
            <Field label="Project Registration" value={project.project_registration || ''} />
          </div>
        </Section>

        {/* Dates */}
        <Section title="Important Dates">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
            <Field label="Estimated Order Date" value={formatDate(project.estimated_order_date)} />
            <Field label="Estimated Delivery Date" value={formatDate(project.estimated_delivery_date)} />
            <Field label="Estimated Arrival Date" value={formatDate(project.estimated_arrival_date)} />
          </div>
        </Section>

        {/* Financial Information */}
        <Section title="Financial Information">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#666', marginBottom: '0.5rem' }}>Project Value</label>
              <p style={{ margin: 0, fontSize: '1rem' }}>{formatCurrency(project.project_value)}</p>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#999' }}>
                {(project as any).project_value_manual
                  ? 'Valore impostato manualmente'
                  : `Calcolato dalla somma delle offerte${offersTotal != null ? ` (${formatCurrency(offersTotal)})` : ''}`}
              </p>
            </div>
            <Field label="Total Value Shipped" value={formatCurrency(project.total_value_shipped)} />
          </div>
        </Section>

        {/* Notes */}
        {project.note && (
          <Section title="Notes">
            <p style={{ margin: 0, fontSize: '1rem', whiteSpace: 'pre-wrap', color: '#555' }}>{project.note}</p>
          </Section>
        )}

        <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid #e0e0e0' }}>
          <button
            onClick={() => navigate(`/projects/${project.id}/edit`)}
            style={{ padding: '0.6rem 1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '1rem' }}
          >
            Edit
          </button>
        </div>
      </div>

      {/* Offers section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>
            Offers ({offers.length})
            {offersTotal != null && (
              <span style={{ fontSize: '0.9rem', fontWeight: 400, color: '#666', marginLeft: '0.75rem' }}>
                Totale offerte: <strong>{formatCurrency(offersTotal)}</strong>
              </span>
            )}
          </h2>
          <button
            onClick={() => navigate(`/offers/new?projectId=${id}&clientId=${project.client_id}`)}
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
                      {offer.total_amount != null ? `${offer.currency || '€'} ${Number(offer.total_amount).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '-'}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#007bff', fontWeight: '600' }}>View →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>No offers linked to this project.</p>
        )}
      </div>

      {/* Attachments section */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0 }}>Allegati ({attachments.length})</h2>
          <label style={{ padding: '0.4rem 0.8rem', background: '#007bff', color: 'white', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
            {uploadingAttachment ? 'Caricamento...' : '+ Aggiungi allegato'}
            <input type="file" onChange={handleUploadAttachment} disabled={uploadingAttachment} style={{ display: 'none' }} />
          </label>
        </div>
        {attachments.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {attachments.map((att: any) => (
              <div key={att.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem' }}>{att.filename}</p>
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: '#999' }}>
                    {formatBytes(att.file_size)} · {formatDate(att.created_at)}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button onClick={() => handleDownloadAttachment(att.id)} style={linkStyle}>Scarica</button>
                  <button onClick={() => handleDeleteAttachment(att.id)} style={{ ...linkStyle, color: '#dc3545' }}>Elimina</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>Nessun allegato.</p>
        )}
      </div>

      {/* Movements section (claim-style) */}
      <div style={{ marginBottom: '2rem' }}>
        <h2 style={{ margin: '0 0 1rem' }}>Movimenti ({movements.length})</h2>

        {/* Add new movement */}
        <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#666', marginBottom: '0.25rem' }}>Data</label>
              <input type="date" value={newMovDate} onChange={(e) => setNewMovDate(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#666', marginBottom: '0.25rem' }}>Azione / Movimento</label>
              <input type="text" value={newMovAction} onChange={(e) => setNewMovAction(e.target.value)} placeholder="Descrivi il movimento..." style={{ width: '100%', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
            </div>
            <button onClick={handleAddMovement} disabled={savingMovement || !newMovAction.trim()} style={{ padding: '0.5rem 1rem', background: savingMovement || !newMovAction.trim() ? '#aaa' : '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: savingMovement || !newMovAction.trim() ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
              {savingMovement ? 'Salvataggio...' : 'Aggiungi'}
            </button>
          </div>
        </div>

        {movements.length > 0 ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {movements.map((m: any) => (
              <div key={m.id} style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '1rem' }}>
                {editMovId === m.id ? (
                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <input type="date" value={editMovDate} onChange={(e) => setEditMovDate(e.target.value)} style={{ padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px' }} />
                    <input type="text" value={editMovAction} onChange={(e) => setEditMovAction(e.target.value)} style={{ flex: 1, minWidth: '200px', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }} />
                    <button onClick={handleUpdateMovement} style={{ ...linkStyle, color: '#28a745' }}>Salva</button>
                    <button onClick={() => setEditMovId(null)} style={{ ...linkStyle, color: '#666' }}>Annulla</button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <p style={{ margin: 0, fontWeight: 600, fontSize: '0.85rem', color: '#007bff' }}>{formatDate(m.date)}</p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.95rem', whiteSpace: 'pre-wrap' }}>{m.action}</p>
                        {m.created_by_user && (
                          <p style={{ margin: '0.25rem 0 0', fontSize: '0.7rem', color: '#999' }}>
                            {m.created_by_user.first_name || ''} {m.created_by_user.last_name || ''}
                          </p>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '1rem' }}>
                        <button onClick={() => startEditMovement(m)} style={linkStyle}>Modifica</button>
                        <button onClick={() => handleDeleteMovement(m.id)} style={{ ...linkStyle, color: '#dc3545' }}>Elimina</button>
                      </div>
                    </div>

                    {/* Movement attachments */}
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #f0f0f0' }}>
                      {Array.isArray(m.attachments) && m.attachments.length > 0 && (
                        <div style={{ display: 'grid', gap: '0.4rem', marginBottom: '0.5rem' }}>
                          {m.attachments.map((att: any) => (
                            <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                              <span style={{ color: '#555' }}>📎 {att.filename} <span style={{ color: '#aaa' }}>({formatBytes(att.file_size)})</span></span>
                              <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button onClick={() => handleDownloadMovAtt(m.id, att.id)} style={linkStyle}>Scarica</button>
                                <button onClick={() => handleDeleteMovAtt(m.id, att.id)} style={{ ...linkStyle, color: '#dc3545' }}>Elimina</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <label style={{ fontSize: '0.8rem', color: '#007bff', cursor: 'pointer', fontWeight: 600 }}>
                        {uploadingMovAtt === m.id ? 'Caricamento...' : '+ Allega file'}
                        <input type="file" onChange={(e) => handleUploadMovAtt(m.id, e)} disabled={uploadingMovAtt === m.id} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: '#888', fontSize: '0.875rem' }}>Nessun movimento registrato.</p>
        )}
      </div>
    </div>
  );
};

export default ProjectDetail;
