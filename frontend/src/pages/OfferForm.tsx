import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { Offer, OfferItem, Client, Company, Visit, Project } from '../types';
import '../styles/OfferForm.css';

const EMPTY_ITEM = (): Partial<OfferItem> & { _key: string } => ({
  _key: crypto.randomUUID(),
  serie: '',
  articolo: '',
  finitura: '',
  formato: '',
  spessore_mm: undefined,
  prezzo_unitario: 0,
  unita_misura: '',
  quantita: 1,
  total_amount: 0,
  data: '',
  tipo_offerta: 'retail',
  promozionale: false,
  numero_progetto: '',
  progetto_nome: '',
  fase_progetto: '',
  sviluppo_progetto: '',
  project_id: '',
  consegna_prevista: '',
  note: '',
});

export const OfferForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;

  // Lookups
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [companyVisits, setCompanyVisits] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  // Form
  const [formData, setFormData] = useState({
    client_id: '',
    company_id: '',
    offer_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    status: 'draft',
    currency: 'EUR',
    visit_id: '',
    company_visit_id: '',
    notes: '',
  });

  const [items, setItems] = useState<(Partial<OfferItem> & { _key: string })[]>([]);
  const [offer, setOffer] = useState<Offer | null>(null);

  // UI
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Load lookups in parallel
        const [clientsRes, companiesRes, visitsRes, companyVisitsRes, projectsRes] = await Promise.all([
          apiService.getClients(),
          apiService.getCompanies(),
          apiService.getVisits(),
          apiService.getCompanyVisits(),
          apiService.getProjects(),
        ]);

        if (clientsRes.success && clientsRes.data) setClients(clientsRes.data);
        if (companiesRes.success && companiesRes.data) setCompanies(companiesRes.data);
        if (visitsRes.success && visitsRes.data) setVisits(Array.isArray(visitsRes.data) ? visitsRes.data : []);
        if (companyVisitsRes.success && companyVisitsRes.data) setCompanyVisits(Array.isArray(companyVisitsRes.data) ? companyVisitsRes.data : []);
        if (projectsRes.success && projectsRes.data) setProjects(Array.isArray(projectsRes.data) ? projectsRes.data : []);

        // Pre-fill from URL params
        const clientIdFromUrl = searchParams.get('clientId');
        const companyIdFromUrl = searchParams.get('companyId');
        if (clientIdFromUrl) setFormData(prev => ({ ...prev, client_id: clientIdFromUrl }));
        if (companyIdFromUrl) setFormData(prev => ({ ...prev, company_id: companyIdFromUrl }));

        // Edit mode: load existing offer
        if (isEditMode && id) {
          const offerRes = await apiService.getOffer(id);
          if (offerRes.success && offerRes.data) {
            const existing = offerRes.data;
            setOffer(existing);
            setFormData({
              client_id: existing.client_id || '',
              company_id: existing.company_id || '',
              offer_date: existing.offer_date ? new Date(existing.offer_date).toISOString().split('T')[0] : '',
              valid_until: existing.valid_until ? new Date(existing.valid_until).toISOString().split('T')[0] : '',
              status: existing.status || 'draft',
              currency: existing.currency || 'EUR',
              visit_id: existing.visit_id || '',
              company_visit_id: existing.company_visit_id || '',
              notes: existing.notes || '',
            });
            if (existing.items && existing.items.length > 0) {
              setItems(existing.items.map((item: OfferItem) => ({
                ...item,
                _key: item.id || crypto.randomUUID(),
                data: item.data ? new Date(item.data).toISOString().split('T')[0] : '',
                consegna_prevista: item.consegna_prevista ? new Date(item.consegna_prevista).toISOString().split('T')[0] : '',
              })));
            }
          } else {
            setError('Offer not found');
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [id, isEditMode, searchParams]);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Item management
  const handleAddItem = () => {
    setItems(prev => [...prev, EMPTY_ITEM()]);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      // Auto-calculate total
      if (field === 'prezzo_unitario' || field === 'quantita') {
        const price = field === 'prezzo_unitario' ? Number(value) : Number(item.prezzo_unitario || 0);
        const qty = field === 'quantita' ? Number(value) : Number(item.quantita || 0);
        item.total_amount = price * qty;
      }
      updated[index] = item;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  // Save
  const handleSave = async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (!formData.offer_date) {
        setError('Please fill required field: Offer Date');
        return;
      }

      const offerData: any = {
        client_id: formData.client_id || undefined,
        company_id: formData.company_id || undefined,
        offer_date: formData.offer_date,
        valid_until: formData.valid_until || undefined,
        status: formData.status,
        currency: formData.currency || undefined,
        visit_id: formData.visit_id || undefined,
        company_visit_id: formData.company_visit_id || undefined,
        notes: formData.notes || undefined,
      };

      if (isEditMode && offer) {
        // Update existing offer
        const response = await apiService.updateOffer(offer.id, offerData);
        if (response.success) {
          // Update items: delete removed, update existing, add new
          const existingItemIds = new Set((offer.items || []).map(i => i.id));
          const currentItemIds = new Set(items.filter(i => i.id).map(i => i.id!));

          // Delete removed items
          for (const existingId of existingItemIds) {
            if (!currentItemIds.has(existingId)) {
              await apiService.deleteOfferItem(offer.id, existingId);
            }
          }

          // Update or add items
          for (const item of items) {
            const itemData = {
              serie: item.serie || undefined,
              articolo: item.articolo || undefined,
              finitura: item.finitura || undefined,
              formato: item.formato || undefined,
              spessore_mm: item.spessore_mm ? Number(item.spessore_mm) : undefined,
              prezzo_unitario: Number(item.prezzo_unitario || 0),
              unita_misura: item.unita_misura || undefined,
              quantita: Number(item.quantita || 0),
              data: item.data || undefined,
              tipo_offerta: item.tipo_offerta || 'retail',
              promozionale: !!item.promozionale,
              numero_progetto: item.numero_progetto || undefined,
              progetto_nome: item.progetto_nome || undefined,
              fase_progetto: item.fase_progetto || undefined,
              sviluppo_progetto: item.sviluppo_progetto || undefined,
              project_id: item.project_id || undefined,
              consegna_prevista: item.consegna_prevista || undefined,
              note: item.note || undefined,
            };
            if (item.id) {
              await apiService.updateOfferItem(offer.id, item.id, itemData);
            } else {
              await apiService.addOfferItem(offer.id, itemData);
            }
          }

          setSuccess('Offer updated successfully');
          setTimeout(() => navigate(`/offers/${offer.id}`), 1500);
        }
      } else {
        // Create new offer
        const response = await apiService.createOffer(offerData);
        if (response.success && response.data) {
          const newOffer = response.data;
          // Add items one by one
          for (const item of items) {
            const itemData = {
              serie: item.serie || undefined,
              articolo: item.articolo || undefined,
              finitura: item.finitura || undefined,
              formato: item.formato || undefined,
              spessore_mm: item.spessore_mm ? Number(item.spessore_mm) : undefined,
              prezzo_unitario: Number(item.prezzo_unitario || 0),
              unita_misura: item.unita_misura || undefined,
              quantita: Number(item.quantita || 0),
              data: item.data || undefined,
              tipo_offerta: item.tipo_offerta || 'retail',
              promozionale: !!item.promozionale,
              numero_progetto: item.numero_progetto || undefined,
              progetto_nome: item.progetto_nome || undefined,
              fase_progetto: item.fase_progetto || undefined,
              sviluppo_progetto: item.sviluppo_progetto || undefined,
              project_id: item.project_id || undefined,
              consegna_prevista: item.consegna_prevista || undefined,
              note: item.note || undefined,
            };
            await apiService.addOfferItem(newOffer.id, itemData);
          }
          setSuccess('Offer created successfully');
          setTimeout(() => navigate(`/offers/${newOffer.id}`), 1500);
        } else {
          setError(response.error || 'Error creating offer');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ofrf-page">
      <div className="ofrf-header">
        <h1>{isEditMode ? 'Edit Offer' : 'New Offer'}</h1>
        <button className="ofrf-back" onClick={() => navigate(isEditMode && id ? `/offers/${id}` : '/offers')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
      </div>

      {error && <div className="ofrf-alert ofrf-alert-error">{error}</div>}
      {success && <div className="ofrf-alert ofrf-alert-success">{success}</div>}

      {/* Form card */}
      <div className="ofrf-card">
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Offer Details</h2>

        <div className="ofrf-form-row">
          <div className="ofrf-form-group">
            <label>Client</label>
            <select name="client_id" value={formData.client_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- Select Client --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ofrf-form-group">
            <label>Supplier</label>
            <select name="company_id" value={formData.company_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- Select Supplier --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="ofrf-form-row">
          <div className="ofrf-form-group">
            <label>Offer Date *</label>
            <input type="date" name="offer_date" value={formData.offer_date} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Valid Until</label>
            <input type="date" name="valid_until" value={formData.valid_until} onChange={handleChange} disabled={isLoading} />
          </div>
        </div>

        <div className="ofrf-form-row">
          <div className="ofrf-form-group">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange} disabled={isLoading}>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <div className="ofrf-form-group">
            <label>Currency</label>
            <input type="text" name="currency" value={formData.currency} onChange={handleChange} placeholder="EUR" disabled={isLoading} />
          </div>
        </div>

        <div className="ofrf-form-row">
          <div className="ofrf-form-group">
            <label>Link to Visit (optional)</label>
            <select name="visit_id" value={formData.visit_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- None --</option>
              {visits.map(v => (
                <option key={v.id} value={v.id}>
                  {new Date(v.visit_date).toLocaleDateString('it-IT')} - {v.client?.name || v.client_id}
                </option>
              ))}
            </select>
          </div>
          <div className="ofrf-form-group">
            <label>Link to Company Visit (optional)</label>
            <select name="company_visit_id" value={formData.company_visit_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- None --</option>
              {companyVisits.map(cv => (
                <option key={cv.id} value={cv.id}>
                  {new Date(cv.visit_date).toLocaleDateString('it-IT')} - {cv.company?.name || cv.company_id}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ofrf-form-group" style={{ marginTop: '0.5rem' }}>
          <label>Notes</label>
          <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional notes..." disabled={isLoading} rows={3} />
        </div>
      </div>

      {/* Line Items */}
      <div className="ofrf-card ofrf-items-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600 }}>Line Items ({items.length})</h2>
          <button type="button" className="ofrf-btn-add-row" onClick={handleAddItem} disabled={isLoading}>
            + Add Row
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-tertiary)', fontSize: '0.875rem' }}>
            No items yet. Click "+ Add Row" to add line items.
          </div>
        ) : (
          <div className="ofrf-items-table-wrap">
            <table className="ofrf-items-table">
              <thead>
                <tr>
                  <th>Serie</th>
                  <th>Articolo</th>
                  <th>Finitura</th>
                  <th>Formato</th>
                  <th>Sp. MM</th>
                  <th>Prezzo</th>
                  <th>U.M.</th>
                  <th>Qty</th>
                  <th>Total</th>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Promo</th>
                  <th>N. Prog.</th>
                  <th>Progetto</th>
                  <th>Fase</th>
                  <th>Sviluppo</th>
                  <th>Consegna</th>
                  <th>Note</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item._key}>
                    <td><input type="text" value={item.serie || ''} onChange={e => handleItemChange(idx, 'serie', e.target.value)} /></td>
                    <td><input type="text" value={item.articolo || ''} onChange={e => handleItemChange(idx, 'articolo', e.target.value)} /></td>
                    <td><input type="text" value={item.finitura || ''} onChange={e => handleItemChange(idx, 'finitura', e.target.value)} /></td>
                    <td><input type="text" value={item.formato || ''} onChange={e => handleItemChange(idx, 'formato', e.target.value)} /></td>
                    <td><input type="number" value={item.spessore_mm ?? ''} onChange={e => handleItemChange(idx, 'spessore_mm', e.target.value)} /></td>
                    <td><input type="number" step="0.01" value={item.prezzo_unitario ?? ''} onChange={e => handleItemChange(idx, 'prezzo_unitario', e.target.value)} /></td>
                    <td><input type="text" value={item.unita_misura || ''} onChange={e => handleItemChange(idx, 'unita_misura', e.target.value)} /></td>
                    <td><input type="number" value={item.quantita ?? ''} onChange={e => handleItemChange(idx, 'quantita', e.target.value)} /></td>
                    <td className="ofrf-item-total">{Number(item.total_amount || 0).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
                    <td><input type="date" value={item.data || ''} onChange={e => handleItemChange(idx, 'data', e.target.value)} /></td>
                    <td>
                      <select value={item.tipo_offerta || 'retail'} onChange={e => handleItemChange(idx, 'tipo_offerta', e.target.value)}>
                        <option value="retail">Retail</option>
                        <option value="progetto">Progetto</option>
                      </select>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!item.promozionale} onChange={e => handleItemChange(idx, 'promozionale', e.target.checked)} />
                    </td>
                    <td><input type="text" value={item.numero_progetto || ''} onChange={e => handleItemChange(idx, 'numero_progetto', e.target.value)} /></td>
                    <td>
                      {item.tipo_offerta === 'progetto' ? (
                        <select value={item.project_id || ''} onChange={e => handleItemChange(idx, 'project_id', e.target.value)}>
                          <option value="">-- None --</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || `Project #${p.project_number}`}</option>)}
                        </select>
                      ) : (
                        <input type="text" value={item.progetto_nome || ''} onChange={e => handleItemChange(idx, 'progetto_nome', e.target.value)} />
                      )}
                    </td>
                    <td><input type="text" value={item.fase_progetto || ''} onChange={e => handleItemChange(idx, 'fase_progetto', e.target.value)} /></td>
                    <td><input type="text" value={item.sviluppo_progetto || ''} onChange={e => handleItemChange(idx, 'sviluppo_progetto', e.target.value)} /></td>
                    <td><input type="date" value={item.consegna_prevista || ''} onChange={e => handleItemChange(idx, 'consegna_prevista', e.target.value)} /></td>
                    <td><input type="text" value={item.note || ''} onChange={e => handleItemChange(idx, 'note', e.target.value)} /></td>
                    <td>
                      <button type="button" className="ofrf-btn-remove-row" onClick={() => handleRemoveItem(idx)} title="Remove row">
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="ofrf-form-actions">
        <button className="ofrf-btn-save" onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving...' : isEditMode ? 'Update Offer' : 'Create Offer'}
        </button>
        <button className="ofrf-btn-cancel" onClick={() => navigate(isEditMode && id ? `/offers/${id}` : '/offers')} disabled={isLoading}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default OfferForm;
