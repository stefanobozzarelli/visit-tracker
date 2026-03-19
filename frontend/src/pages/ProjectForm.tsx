import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company, Client } from '../types';
import '../styles/ProjectForm.css';

const PROJECT_STATUSES = ['ATTIVO', 'COMPLETATO', 'SOSPESO', 'CANCELLATO'];
const PROJECT_DEVELOPMENT = [
  'INFO DAL CLIENTE', 'RICHIESTA OFFERTA', 'OFFERTA FATTA',
  'ORDINE CONFERMATO', 'IN PRODUZIONE', 'SPEDITO PARZIALMENTE',
  'SPEDITO', 'CONSEGNATO',
];
const PROJECT_REGISTRATION = [
  'INFO DAL CLIENTE', 'RICHIESTA REGISTRAZIONE',
  'PROGETTO REGISTRATO', 'REGISTRAZIONE RIFIUTATA',
];
const PROJECT_TYPES = ['RESIDENTIAL', 'COMMERCIAL'];
const DETAIL_TYPES = ['HOTEL', 'BUILDING', 'VILLA', 'APARTMENT', 'OFFICE', 'RETAIL', 'RESTAURANT', 'SPA'];

interface FormData {
  supplier_id: string;
  client_id: string;
  country: string;
  registration_date: string;
  project_name: string;
  status: string;
  project_development: string;
  project_registration: string;
  project_address: string;
  project_type: string;
  detail_of_project_type: string;
  designated_area: string;
  architect_designer: string;
  developer: string;
  contractor: string;
  item: string;
  quantity: string;
  note: string;
  estimated_order_date: string;
  estimated_delivery_date: string;
  estimated_arrival_date: string;
  project_value: string;
  total_value_shipped: string;
}

const emptyForm: FormData = {
  supplier_id: '', client_id: '', country: '', registration_date: '',
  project_name: '', status: 'ATTIVO', project_development: '', project_registration: '',
  project_address: '', project_type: '', detail_of_project_type: '', designated_area: '',
  architect_designer: '', developer: '', contractor: '', item: '', quantity: '',
  note: '', estimated_order_date: '', estimated_delivery_date: '',
  estimated_arrival_date: '', project_value: '', total_value_shipped: '',
};

const toDateInput = (d?: string) => {
  if (!d) return '';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return ''; }
};

export const ProjectForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const isEdit = !!id;

  const [form, setForm] = useState<FormData>(emptyForm);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isAddingCountry, setIsAddingCountry] = useState(false);
  const [newCountryInput, setNewCountryInput] = useState('');

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [compRes, cliRes, projRes] = await Promise.all([
        apiService.getCompanies(),
        apiService.getClients(),
        apiService.getProjects(),
      ]);
      if (compRes.success && compRes.data) setCompanies(compRes.data);
      if (cliRes.success && cliRes.data) setClients(cliRes.data);
      if (projRes.success && projRes.data) setAllProjects(projRes.data);

      if (isEdit) {
        const projRes = await apiService.getProject(id!);
        if (projRes.success && projRes.data) {
          const p = projRes.data;
          setForm({
            supplier_id: p.supplier_id || '',
            client_id: p.client_id || '',
            country: p.country || '',
            registration_date: toDateInput(p.registration_date),
            project_name: p.project_name || '',
            status: p.status || 'ATTIVO',
            project_development: p.project_development || '',
            project_registration: p.project_registration || '',
            project_address: p.project_address || '',
            project_type: p.project_type || '',
            detail_of_project_type: p.detail_of_project_type || '',
            designated_area: p.designated_area || '',
            architect_designer: p.architect_designer || '',
            developer: p.developer || '',
            contractor: p.contractor || '',
            item: p.item || '',
            quantity: p.quantity || '',
            note: p.note || '',
            estimated_order_date: toDateInput(p.estimated_order_date),
            estimated_delivery_date: toDateInput(p.estimated_delivery_date),
            estimated_arrival_date: toDateInput(p.estimated_arrival_date),
            project_value: p.project_value != null ? String(p.project_value) : '',
            total_value_shipped: p.total_value_shipped != null ? String(p.total_value_shipped) : '',
          });
        }
      }
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const selectedClient = useMemo(() => clients.find(c => c.id === form.client_id), [clients, form.client_id]);
  useEffect(() => {
    if (selectedClient && !form.country) {
      setForm(prev => ({ ...prev, country: selectedClient.country || '' }));
    }
  }, [selectedClient]);

  // Derive unique countries from clients + existing projects
  const existingCountries = useMemo(() => {
    const fromClients = clients.map(c => c.country).filter(Boolean);
    const fromProjects = allProjects.map((p: any) => p.country).filter(Boolean);
    return [...new Set([...fromClients, ...fromProjects])].sort();
  }, [clients, allProjects]);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_name) { setError('Project name is required'); return; }

    try {
      setSaving(true);
      setError('');
      const payload: any = { ...form };
      if (payload.project_value) payload.project_value = parseFloat(payload.project_value);
      else payload.project_value = null;
      if (payload.total_value_shipped) payload.total_value_shipped = parseFloat(payload.total_value_shipped);
      else payload.total_value_shipped = null;
      if (!payload.supplier_id) payload.supplier_id = null;
      if (!payload.client_id) payload.client_id = null;
      if (!payload.registration_date) payload.registration_date = null;
      if (!payload.estimated_order_date) payload.estimated_order_date = null;
      if (!payload.estimated_delivery_date) payload.estimated_delivery_date = null;
      if (!payload.estimated_arrival_date) payload.estimated_arrival_date = null;

      const res = isEdit
        ? await apiService.updateProject(id!, payload)
        : await apiService.createProject(payload);

      if (res.success) {
        navigate('/projects');
      } else {
        setError(res.error || 'Error saving project');
      }
    } catch (err: any) {
      setError(err?.message || 'Error saving project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="pf-loading">
      <div className="pf-loading-spinner" />
      <span>Loading project data...</span>
    </div>
  );

  return (
    <div className="pf-wrapper">
      {/* Sticky header */}
      <div className="pf-page-header">
        <div className="pf-page-header-inner">
          <div className="pf-page-header-left">
            <h1>{isEdit ? 'Edit Project' : 'New Project'}</h1>
            <p>{isEdit ? 'Update project registration details' : 'Register a new project in the system'}</p>
          </div>
          <div className="pf-page-header-actions">
            <button type="button" className="pf-btn-secondary" onClick={() => navigate('/projects')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <button type="submit" form="project-form" className="pf-btn-primary" disabled={saving}>
              {saving ? (
                <><span className="pf-btn-spinner" /> Saving...</>
              ) : (
                <>{isEdit ? 'Update' : 'Save'} Project</>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="pf-error-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          {error}
          <button onClick={() => setError('')}>&times;</button>
        </div>
      )}

      <form id="project-form" onSubmit={handleSubmit} className="pf-form">
        {/* SECTION 1: Core identification */}
        <div className="pf-card">
          <div className="pf-card-header">
            <div className="pf-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div>
              <h2>Project Identification</h2>
              <span>Core project details and parties involved</span>
            </div>
          </div>
          <div className="pf-card-body">
            <div className="pf-grid pf-grid-3">
              <div className="pf-field pf-span-2">
                <label>Project Name <span className="pf-required">*</span></label>
                <input value={form.project_name} onChange={e => handleChange('project_name', e.target.value)} placeholder="Enter project name" required />
              </div>
              <div className="pf-field">
                <label>Registration Date</label>
                <input type="date" value={form.registration_date} onChange={e => handleChange('registration_date', e.target.value)} />
              </div>
            </div>
            <div className="pf-grid pf-grid-3">
              <div className="pf-field">
                <label>Supplier</label>
                <select value={form.supplier_id} onChange={e => handleChange('supplier_id', e.target.value)}>
                  <option value="">Select supplier...</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label>Client</label>
                <select value={form.client_id} onChange={e => handleChange('client_id', e.target.value)}>
                  <option value="">Select client...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label>Country</label>
                {isAddingCountry ? (
                  <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                    <input
                      value={newCountryInput}
                      onChange={e => setNewCountryInput(e.target.value.toUpperCase())}
                      placeholder="NEW COUNTRY"
                      autoFocus
                      style={{ flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newCountryInput.trim()) {
                          handleChange('country', newCountryInput.trim());
                        }
                        setIsAddingCountry(false);
                        setNewCountryInput('');
                      }}
                      style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #4A6078', background: '#4A6078', color: 'white', cursor: 'pointer', fontSize: '0.8rem' }}
                    >OK</button>
                    <button
                      type="button"
                      onClick={() => { setIsAddingCountry(false); setNewCountryInput(''); }}
                      style={{ padding: '0.45rem 0.7rem', borderRadius: 8, border: '1px solid #d5d0c8', background: 'white', cursor: 'pointer', fontSize: '0.8rem' }}
                    >X</button>
                  </div>
                ) : (
                  <select
                    value={form.country}
                    onChange={e => {
                      if (e.target.value === '__add_new__') {
                        setIsAddingCountry(true);
                        setNewCountryInput('');
                      } else {
                        handleChange('country', e.target.value);
                      }
                    }}
                  >
                    <option value="">Select country...</option>
                    {existingCountries.map(c => <option key={c} value={c}>{c}</option>)}
                    {form.country && !existingCountries.includes(form.country) && (
                      <option value={form.country}>{form.country}</option>
                    )}
                    <option value="__add_new__">+ Add new country...</option>
                  </select>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 2: Status & Classification */}
        <div className="pf-card">
          <div className="pf-card-header">
            <div className="pf-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            </div>
            <div>
              <h2>Status & Classification</h2>
              <span>Project progress, type and registration status</span>
            </div>
          </div>
          <div className="pf-card-body">
            <div className="pf-grid pf-grid-3">
              <div className="pf-field">
                <label>Status</label>
                <select value={form.status} onChange={e => handleChange('status', e.target.value)}>
                  {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label>Development Stage</label>
                <select value={form.project_development} onChange={e => handleChange('project_development', e.target.value)}>
                  <option value="">Select stage...</option>
                  {PROJECT_DEVELOPMENT.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label>Registration Status</label>
                <select value={form.project_registration} onChange={e => handleChange('project_registration', e.target.value)}>
                  <option value="">Select...</option>
                  {PROJECT_REGISTRATION.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="pf-grid pf-grid-3">
              <div className="pf-field">
                <label>Project Type</label>
                <select value={form.project_type} onChange={e => handleChange('project_type', e.target.value)}>
                  <option value="">Select type...</option>
                  {PROJECT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label>Type Detail</label>
                <select value={form.detail_of_project_type} onChange={e => handleChange('detail_of_project_type', e.target.value)}>
                  <option value="">Select detail...</option>
                  {DETAIL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="pf-field">
                <label>Designated Area</label>
                <input value={form.designated_area} onChange={e => handleChange('designated_area', e.target.value)} placeholder="e.g. Shower Booth, Lobby" />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3: Location, People & Products */}
        <div className="pf-card">
          <div className="pf-card-header">
            <div className="pf-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <h2>Details & Stakeholders</h2>
              <span>Location, people involved and product information</span>
            </div>
          </div>
          <div className="pf-card-body">
            <div className="pf-grid pf-grid-1">
              <div className="pf-field">
                <label>Project Address</label>
                <textarea value={form.project_address} onChange={e => handleChange('project_address', e.target.value)} placeholder="Full project address" rows={2} />
              </div>
            </div>
            <div className="pf-grid pf-grid-3">
              <div className="pf-field">
                <label>Architect / Designer</label>
                <input value={form.architect_designer} onChange={e => handleChange('architect_designer', e.target.value)} placeholder="Name" />
              </div>
              <div className="pf-field">
                <label>Developer</label>
                <input value={form.developer} onChange={e => handleChange('developer', e.target.value)} placeholder="Name" />
              </div>
              <div className="pf-field">
                <label>Contractor</label>
                <input value={form.contractor} onChange={e => handleChange('contractor', e.target.value)} placeholder="Name" />
              </div>
            </div>
            <div className="pf-separator" />
            <div className="pf-grid pf-grid-3">
              <div className="pf-field">
                <label>Item / Product</label>
                <input value={form.item} onChange={e => handleChange('item', e.target.value)} placeholder="Product name or line" />
              </div>
              <div className="pf-field">
                <label>Quantity</label>
                <input value={form.quantity} onChange={e => handleChange('quantity', e.target.value)} placeholder="Qty" />
              </div>
              <div className="pf-field" />
            </div>
          </div>
        </div>

        {/* SECTION 4: Financial & Timeline */}
        <div className="pf-card-row">
          <div className="pf-card pf-card-half">
            <div className="pf-card-header">
              <div className="pf-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div>
                <h2>Financial</h2>
                <span>Project value and shipped amounts</span>
              </div>
            </div>
            <div className="pf-card-body">
              <div className="pf-grid pf-grid-2">
                <div className="pf-field">
                  <label>Project Value (EUR)</label>
                  <div className="pf-input-with-prefix">
                    <span className="pf-prefix">EUR</span>
                    <input type="number" step="0.01" value={form.project_value} onChange={e => handleChange('project_value', e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="pf-field">
                  <label>Total Value Shipped (EUR)</label>
                  <div className="pf-input-with-prefix">
                    <span className="pf-prefix">EUR</span>
                    <input type="number" step="0.01" value={form.total_value_shipped} onChange={e => handleChange('total_value_shipped', e.target.value)} placeholder="0.00" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pf-card pf-card-half">
            <div className="pf-card-header">
              <div className="pf-card-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div>
                <h2>Timeline</h2>
                <span>Estimated dates for order and delivery</span>
              </div>
            </div>
            <div className="pf-card-body">
              <div className="pf-grid pf-grid-1">
                <div className="pf-field">
                  <label>Est. Order Date</label>
                  <input type="date" value={form.estimated_order_date} onChange={e => handleChange('estimated_order_date', e.target.value)} />
                </div>
                <div className="pf-field">
                  <label>Est. Delivery (from Italy)</label>
                  <input type="date" value={form.estimated_delivery_date} onChange={e => handleChange('estimated_delivery_date', e.target.value)} />
                </div>
                <div className="pf-field">
                  <label>Est. Arrival (destination)</label>
                  <input type="date" value={form.estimated_arrival_date} onChange={e => handleChange('estimated_arrival_date', e.target.value)} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="pf-card">
          <div className="pf-card-header">
            <div className="pf-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div>
              <h2>Notes</h2>
              <span>Additional information and remarks</span>
            </div>
          </div>
          <div className="pf-card-body">
            <div className="pf-field">
              <textarea value={form.note} onChange={e => handleChange('note', e.target.value)} placeholder="Additional notes, special instructions, or remarks..." rows={3} />
            </div>
          </div>
        </div>

        {/* Bottom actions (mobile) */}
        <div className="pf-bottom-actions">
          <button type="button" className="pf-btn-secondary" onClick={() => navigate('/projects')}>Cancel</button>
          <button type="submit" className="pf-btn-primary" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Project' : 'Save Project'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectForm;
