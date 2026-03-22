import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { Offer, Client, Company, Visit, Project } from '../types';
import '../styles/OfferForm.css';

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
    project_id: '',
    offer_date: new Date().toISOString().split('T')[0],
    valid_until: '',
    status: 'draft',
    currency: 'EUR',
    visit_id: '',
    company_visit_id: '',
    notes: '',
  });

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
              project_id: existing.project_id || '',
              offer_date: existing.offer_date ? new Date(existing.offer_date).toISOString().split('T')[0] : '',
              valid_until: existing.valid_until ? new Date(existing.valid_until).toISOString().split('T')[0] : '',
              status: existing.status || 'draft',
              currency: existing.currency || 'EUR',
              visit_id: existing.visit_id || '',
              company_visit_id: existing.company_visit_id || '',
              notes: existing.notes || '',
            });
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
        project_id: formData.project_id || undefined,
        offer_date: formData.offer_date,
        valid_until: formData.valid_until || undefined,
        status: formData.status,
        currency: formData.currency || undefined,
        visit_id: formData.visit_id || undefined,
        company_visit_id: formData.company_visit_id || undefined,
        notes: formData.notes || undefined,
      };

      if (isEditMode && offer) {
        const response = await apiService.updateOffer(offer.id, offerData);
        if (response.success) {
          navigate(`/offers/${offer.id}`);
        } else {
          setError(response.error || 'Error updating offer');
        }
      } else {
        const response = await apiService.createOffer(offerData);
        if (response.success && response.data) {
          navigate(`/offers/${response.data.id}`);
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
            <label>Project</label>
            <select name="project_id" value={formData.project_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- Select Project --</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || `Project #${p.project_number}`}</option>)}
            </select>
          </div>
          <div className="ofrf-form-group">
            <label>Offer Date *</label>
            <input type="date" name="offer_date" value={formData.offer_date} onChange={handleChange} disabled={isLoading} />
          </div>
        </div>

        <div className="ofrf-form-row">
          <div className="ofrf-form-group">
            <label>Valid Until</label>
            <input type="date" name="valid_until" value={formData.valid_until} onChange={handleChange} disabled={isLoading} />
          </div>
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
        </div>

        <div className="ofrf-form-row">
          <div className="ofrf-form-group">
            <label>Currency</label>
            <input type="text" name="currency" value={formData.currency} onChange={handleChange} placeholder="EUR" disabled={isLoading} />
          </div>
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
        </div>

        <div className="ofrf-form-row">
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
          <div className="ofrf-form-group" />
        </div>

        <div className="ofrf-form-group" style={{ marginTop: '0.5rem' }}>
          <label>Notes</label>
          <textarea name="notes" value={formData.notes} onChange={handleChange} placeholder="Additional notes..." disabled={isLoading} rows={3} />
        </div>
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
