import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { apiService } from '../services/api';
import { Opportunity, Client, Company } from '../types';
import '../styles/OpportunityForm.css';

export const OpportunityForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;

  // Lookups
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  // Form
  const [formData, setFormData] = useState({
    client_id: '',
    company_id: '',
    visit_id: '',
    report_id: '',
    title: '',
    description: '',
    status: 'open',
    estimated_value: '',
    currency: 'EUR',
    expected_close_date: '',
  });

  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);

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

        const [clientsRes, companiesRes] = await Promise.all([
          apiService.getClients(),
          apiService.getCompanies(),
        ]);

        if (clientsRes.success && clientsRes.data) setClients(clientsRes.data);
        if (companiesRes.success && companiesRes.data) setCompanies(companiesRes.data);

        // Pre-fill from URL params
        const clientIdFromUrl = searchParams.get('clientId');
        const companyIdFromUrl = searchParams.get('companyId');
        const visitIdFromUrl = searchParams.get('visitId');
        const reportIdFromUrl = searchParams.get('reportId');
        if (clientIdFromUrl) setFormData(prev => ({ ...prev, client_id: clientIdFromUrl }));
        if (companyIdFromUrl) setFormData(prev => ({ ...prev, company_id: companyIdFromUrl }));
        if (visitIdFromUrl) setFormData(prev => ({ ...prev, visit_id: visitIdFromUrl }));
        if (reportIdFromUrl) setFormData(prev => ({ ...prev, report_id: reportIdFromUrl }));

        // Edit mode: load existing opportunity
        if (isEditMode && id) {
          const oppRes = await apiService.getOpportunityById(id);
          if (oppRes.success && oppRes.data) {
            const existing = oppRes.data;
            setOpportunity(existing);
            setFormData({
              client_id: existing.client_id || '',
              company_id: existing.company_id || '',
              visit_id: existing.visit_id || '',
              report_id: existing.report_id || '',
              title: existing.title || '',
              description: existing.description || '',
              status: existing.status || 'open',
              estimated_value: existing.estimated_value != null ? String(existing.estimated_value) : '',
              currency: existing.currency || 'EUR',
              expected_close_date: existing.expected_close_date ? new Date(existing.expected_close_date).toISOString().split('T')[0] : '',
            });
          } else {
            setError('Opportunity not found');
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

      if (!formData.title.trim()) {
        setError('Please fill required field: Title');
        return;
      }
      if (!formData.client_id) {
        setError('Please select a Client');
        return;
      }
      if (!formData.company_id) {
        setError('Please select a Company');
        return;
      }

      const oppData: any = {
        client_id: formData.client_id,
        company_id: formData.company_id,
        visit_id: formData.visit_id || undefined,
        report_id: formData.report_id || undefined,
        title: formData.title.trim(),
        description: formData.description || undefined,
        status: formData.status,
        estimated_value: formData.estimated_value ? parseFloat(formData.estimated_value) : undefined,
        currency: formData.currency || undefined,
        expected_close_date: formData.expected_close_date || undefined,
      };

      if (isEditMode && opportunity) {
        const response = await apiService.updateOpportunity(opportunity.id, oppData);
        if (response.success) {
          navigate(`/opportunities/${opportunity.id}`);
        } else {
          setError(response.error || 'Error updating opportunity');
        }
      } else {
        const response = await apiService.createOpportunity(oppData);
        if (response.success && response.data) {
          navigate(`/opportunities/${response.data.id}`);
        } else {
          setError(response.error || 'Error creating opportunity');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="oppf-page">
      <div className="oppf-header">
        <h1>{isEditMode ? 'Edit Opportunity' : 'New Opportunity'}</h1>
        <button className="oppf-back" onClick={() => navigate(isEditMode && id ? `/opportunities/${id}` : '/opportunities')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Back
        </button>
      </div>

      {error && <div className="oppf-alert oppf-alert-error">{error}</div>}
      {success && <div className="oppf-alert oppf-alert-success">{success}</div>}

      {/* Form card */}
      <div className="oppf-card">
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Opportunity Details</h2>

        <div className="oppf-form-group" style={{ marginBottom: '0.75rem' }}>
          <label>Title *</label>
          <input type="text" name="title" value={formData.title} onChange={handleChange} placeholder="Opportunity title..." disabled={isLoading} />
        </div>

        <div className="oppf-form-row">
          <div className="oppf-form-group">
            <label>Client *</label>
            <select name="client_id" value={formData.client_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- Select Client --</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="oppf-form-group">
            <label>Company (Supplier) *</label>
            <select name="company_id" value={formData.company_id} onChange={handleChange} disabled={isLoading}>
              <option value="">-- Select Company --</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="oppf-form-row">
          <div className="oppf-form-group">
            <label>Status</label>
            <select name="status" value={formData.status} onChange={handleChange} disabled={isLoading}>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="qualified">Qualified</option>
              <option value="negotiation">Negotiation</option>
              <option value="closed_won">Closed Won</option>
              <option value="closed_lost">Closed Lost</option>
            </select>
          </div>
          <div className="oppf-form-group">
            <label>Expected Close Date</label>
            <input type="date" name="expected_close_date" value={formData.expected_close_date} onChange={handleChange} disabled={isLoading} />
          </div>
        </div>

        <div className="oppf-form-row">
          <div className="oppf-form-group">
            <label>Estimated Value</label>
            <input type="number" name="estimated_value" value={formData.estimated_value} onChange={handleChange} placeholder="0.00" step="0.01" disabled={isLoading} />
          </div>
          <div className="oppf-form-group">
            <label>Currency</label>
            <input type="text" name="currency" value={formData.currency} onChange={handleChange} placeholder="EUR" disabled={isLoading} />
          </div>
        </div>

        {formData.visit_id && (
          <>
            <h3 style={{ margin: '1.5rem 0 0.75rem', fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-secondary)', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>Links</h3>
            <div className="oppf-form-group" style={{ marginBottom: '0.75rem' }}>
              <label>Linked Visit</label>
              <div style={{ fontSize: '0.875rem', padding: '0.5rem 0' }}>
                <Link to={`/visits/${formData.visit_id}`} style={{ color: 'var(--color-info)', textDecoration: 'none' }}>
                  View Visit #{formData.visit_id.substring(0, 8)}...
                </Link>
              </div>
            </div>
          </>
        )}

        <div className="oppf-form-group" style={{ marginTop: '0.5rem' }}>
          <label>Description</label>
          <textarea name="description" value={formData.description} onChange={handleChange} placeholder="Additional details about this opportunity..." disabled={isLoading} rows={4} />
        </div>
      </div>

      {/* Actions */}
      <div className="oppf-form-actions">
        <button className="oppf-btn-save" onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving...' : isEditMode ? 'Update Opportunity' : 'Create Opportunity'}
        </button>
        <button className="oppf-btn-cancel" onClick={() => navigate(isEditMode && id ? `/opportunities/${id}` : '/opportunities')} disabled={isLoading}>
          Cancel
        </button>
      </div>
    </div>
  );
};

export default OpportunityForm;
