import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { OfferItem } from '../types';
import '../styles/OfferForm.css';

export const OfferItemForm: React.FC = () => {
  const navigate = useNavigate();
  const { offerId, itemId } = useParams<{ offerId: string; itemId?: string }>();
  const isEditMode = !!itemId;

  // Form
  const [formData, setFormData] = useState({
    serie: '',
    articolo: '',
    finitura: '',
    formato: '',
    spessore_mm: '',
    prezzo_unitario: '',
    unita_misura: '',
    quantita: '1',
    total_amount: 0,
    data: '',
    tipo_offerta: 'retail' as 'progetto' | 'retail',
    promozionale: false,
    numero_progetto: '',
    progetto_nome: '',
    fase_progetto: '',
    sviluppo_progetto: '',
    consegna_prevista: '',
    note: '',
  });

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

  // Load item data in edit mode
  useEffect(() => {
    const loadItem = async () => {
      if (!isEditMode || !offerId || !itemId) return;
      try {
        setIsLoading(true);
        const offerRes = await apiService.getOffer(offerId);
        if (offerRes.success && offerRes.data) {
          const items: OfferItem[] = offerRes.data.items || [];
          const item = items.find(i => i.id === itemId);
          if (item) {
            setFormData({
              serie: item.serie || '',
              articolo: item.articolo || '',
              finitura: item.finitura || '',
              formato: item.formato || '',
              spessore_mm: item.spessore_mm != null ? String(item.spessore_mm) : '',
              prezzo_unitario: String(item.prezzo_unitario || ''),
              unita_misura: item.unita_misura || '',
              quantita: String(item.quantita || 1),
              total_amount: item.total_amount || 0,
              data: item.data ? new Date(item.data).toISOString().split('T')[0] : '',
              tipo_offerta: item.tipo_offerta || 'retail',
              promozionale: !!item.promozionale,
              numero_progetto: item.numero_progetto || '',
              progetto_nome: item.progetto_nome || '',
              fase_progetto: item.fase_progetto || '',
              sviluppo_progetto: item.sviluppo_progetto || '',
              consegna_prevista: item.consegna_prevista ? new Date(item.consegna_prevista).toISOString().split('T')[0] : '',
              note: item.note || '',
            });
          } else {
            setError('Item not found');
          }
        } else {
          setError('Offer not found');
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadItem();
  }, [offerId, itemId, isEditMode]);

  // Auto-calculate total
  useEffect(() => {
    const price = Number(formData.prezzo_unitario) || 0;
    const qty = Number(formData.quantita) || 0;
    setFormData(prev => ({ ...prev, total_amount: price * qty }));
  }, [formData.prezzo_unitario, formData.quantita]);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Save
  const handleSave = async () => {
    if (!offerId) return;
    try {
      setIsLoading(true);
      setError(null);

      const itemData: any = {
        serie: formData.serie || undefined,
        articolo: formData.articolo || undefined,
        finitura: formData.finitura || undefined,
        formato: formData.formato || undefined,
        spessore_mm: formData.spessore_mm ? Number(formData.spessore_mm) : undefined,
        prezzo_unitario: Number(formData.prezzo_unitario || 0),
        unita_misura: formData.unita_misura || undefined,
        quantita: Number(formData.quantita || 0),
        data: formData.data || undefined,
        tipo_offerta: formData.tipo_offerta || 'retail',
        promozionale: !!formData.promozionale,
        numero_progetto: formData.numero_progetto || undefined,
        progetto_nome: formData.progetto_nome || undefined,
        fase_progetto: formData.fase_progetto || undefined,
        sviluppo_progetto: formData.sviluppo_progetto || undefined,
        consegna_prevista: formData.consegna_prevista || undefined,
        note: formData.note || undefined,
      };

      if (isEditMode && itemId) {
        const response = await apiService.updateOfferItem(offerId, itemId, itemData);
        if (response.success) {
          navigate(`/offers/${offerId}`);
        } else {
          setError(response.error || 'Error updating item');
        }
      } else {
        const response = await apiService.addOfferItem(offerId, itemData);
        if (response.success) {
          navigate(`/offers/${offerId}`);
        } else {
          setError(response.error || 'Error adding item');
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
        <h1>{isEditMode ? 'Edit Item' : 'New Item'}</h1>
        <button className="ofrf-back" onClick={() => navigate(`/offers/${offerId}`)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back to Offer
        </button>
      </div>

      {error && <div className="ofrf-alert ofrf-alert-error">{error}</div>}
      {success && <div className="ofrf-alert ofrf-alert-success">{success}</div>}

      <div className="ofrf-card">
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Item Details</h2>

        {/* Row 1: Serie, Articolo, Finitura */}
        <div className="ofrf-form-grid">
          <div className="ofrf-form-group">
            <label>Serie</label>
            <input type="text" name="serie" value={formData.serie} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Articolo</label>
            <input type="text" name="articolo" value={formData.articolo} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Finitura</label>
            <input type="text" name="finitura" value={formData.finitura} onChange={handleChange} disabled={isLoading} />
          </div>
        </div>

        {/* Row 2: Formato, Spessore MM, U.M. */}
        <div className="ofrf-form-grid">
          <div className="ofrf-form-group">
            <label>Formato</label>
            <input type="text" name="formato" value={formData.formato} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Spessore MM</label>
            <input type="number" name="spessore_mm" value={formData.spessore_mm} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>U.M.</label>
            <input type="text" name="unita_misura" value={formData.unita_misura} onChange={handleChange} disabled={isLoading} />
          </div>
        </div>

        {/* Row 3: Prezzo Unitario, Quantita, Total */}
        <div className="ofrf-form-grid">
          <div className="ofrf-form-group">
            <label>Prezzo Unitario</label>
            <input type="number" step="0.01" name="prezzo_unitario" value={formData.prezzo_unitario} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Quantita</label>
            <input type="number" name="quantita" value={formData.quantita} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Total</label>
            <input
              type="text"
              value={formData.total_amount.toLocaleString('it-IT', { minimumFractionDigits: 2 })}
              readOnly
              disabled
              style={{ background: 'var(--color-bg-secondary)', fontWeight: 600 }}
            />
          </div>
        </div>

        {/* Row 4: Data, Tipo Offerta, Promozionale */}
        <div className="ofrf-form-grid">
          <div className="ofrf-form-group">
            <label>Data</label>
            <input type="date" name="data" value={formData.data} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group">
            <label>Tipo Offerta</label>
            <select name="tipo_offerta" value={formData.tipo_offerta} onChange={handleChange} disabled={isLoading}>
              <option value="retail">Retail</option>
              <option value="progetto">Progetto</option>
            </select>
          </div>
          <div className="ofrf-form-group">
            <label>Promozionale</label>
            <div style={{ paddingTop: '0.375rem' }}>
              <input
                type="checkbox"
                name="promozionale"
                checked={formData.promozionale}
                onChange={handleChange}
                disabled={isLoading}
                style={{ width: 'auto', cursor: 'pointer' }}
              />
            </div>
          </div>
        </div>

        {/* Row 5: Consegna Prevista */}
        <div className="ofrf-form-grid">
          <div className="ofrf-form-group">
            <label>Consegna Prevista</label>
            <input type="date" name="consegna_prevista" value={formData.consegna_prevista} onChange={handleChange} disabled={isLoading} />
          </div>
          <div className="ofrf-form-group" />
          <div className="ofrf-form-group" />
        </div>

        {/* Row 7: Note */}
        <div className="ofrf-form-group ofrf-form-full" style={{ marginTop: '0.75rem' }}>
          <label>Note</label>
          <textarea name="note" value={formData.note} onChange={handleChange} placeholder="Notes about this item..." disabled={isLoading} rows={3} />
        </div>
      </div>

      {/* Actions */}
      <div className="ofrf-form-actions">
        <button className="ofrf-btn-save" onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving...' : isEditMode ? 'Update Item' : 'Add Item'}
        </button>
        <button className="ofrf-btn-cancel" onClick={() => navigate(`/offers/${offerId}`)} disabled={isLoading}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default OfferItemForm;
