import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company, Client } from '../types';
import '../styles/Projects.css';

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadData(); }, [id]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [compRes, cliRes] = await Promise.all([
        apiService.getCompanies(),
        apiService.getClients(),
      ]);
      if (compRes.success && compRes.data) setCompanies(compRes.data);
      if (cliRes.success && cliRes.data) setClients(cliRes.data);

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

  // Auto-populate country from client
  const selectedClient = useMemo(() => clients.find(c => c.id === form.client_id), [clients, form.client_id]);
  useEffect(() => {
    if (selectedClient && !form.country) {
      setForm(prev => ({ ...prev, country: selectedClient.country || '' }));
    }
  }, [selectedClient]);

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
      // Convert numeric fields
      if (payload.project_value) payload.project_value = parseFloat(payload.project_value);
      else payload.project_value = null;
      if (payload.total_value_shipped) payload.total_value_shipped = parseFloat(payload.total_value_shipped);
      else payload.total_value_shipped = null;
      // Convert empty strings to null for optional fields
      if (!payload.supplier_id) payload.supplier_id = null;
      if (!payload.client_id) payload.client_id = null;
      if (!payload.registration_date) payload.registration_date = null;
      if (!payload.estimated_order_date) payload.estimated_order_date = null;
      if (!payload.estimated_delivery_date) payload.estimated_delivery_date = null;
      if (!payload.estimated_arrival_date) payload.estimated_arrival_date = null;

      let res;
      if (isEdit) {
        res = await apiService.updateProject(id!, payload);
      } else {
        res = await apiService.createProject(payload);
      }

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

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  const fieldStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', border: '1px solid #d5d0c8', borderRadius: 8, fontSize: '0.85rem', width: '100%', background: 'white' };
  const labelStyle: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' };
  const sectionStyle: React.CSSProperties = { background: '#F0EDE8', borderRadius: 12, padding: '1.5rem', marginBottom: '1.5rem' };
  const gridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' };

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div>
          <h1>{isEdit ? 'Edit Project' : 'New Project'}</h1>
          <p>{isEdit ? 'Update project details' : 'Register a new project'}</p>
        </div>
        <button className="projects-btn" onClick={() => navigate('/projects')}>Back to Projects</button>
      </div>

      {error && <div style={{ background: '#fce4ec', color: '#c62828', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Basic Information</h3>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Project Name *</label>
              <input style={fieldStyle} value={form.project_name} onChange={e => handleChange('project_name', e.target.value)} placeholder="Project name" required />
            </div>
            <div>
              <label style={labelStyle}>Supplier</label>
              <select style={fieldStyle} value={form.supplier_id} onChange={e => handleChange('supplier_id', e.target.value)}>
                <option value="">Select supplier...</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Client</label>
              <select style={fieldStyle} value={form.client_id} onChange={e => handleChange('client_id', e.target.value)}>
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <input style={fieldStyle} value={form.country} onChange={e => handleChange('country', e.target.value)} placeholder="Country" />
            </div>
            <div>
              <label style={labelStyle}>Registration Date</label>
              <input style={fieldStyle} type="date" value={form.registration_date} onChange={e => handleChange('registration_date', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Status & Development */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Status & Development</h3>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Status</label>
              <select style={fieldStyle} value={form.status} onChange={e => handleChange('status', e.target.value)}>
                {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Project Development</label>
              <select style={fieldStyle} value={form.project_development} onChange={e => handleChange('project_development', e.target.value)}>
                <option value="">Select...</option>
                {PROJECT_DEVELOPMENT.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Project Registration</label>
              <select style={fieldStyle} value={form.project_registration} onChange={e => handleChange('project_registration', e.target.value)}>
                <option value="">Select...</option>
                {PROJECT_REGISTRATION.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Project Details */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Project Details</h3>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Project Type</label>
              <select style={fieldStyle} value={form.project_type} onChange={e => handleChange('project_type', e.target.value)}>
                <option value="">Select...</option>
                {PROJECT_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Detail of Project Type</label>
              <select style={fieldStyle} value={form.detail_of_project_type} onChange={e => handleChange('detail_of_project_type', e.target.value)}>
                <option value="">Select...</option>
                {DETAIL_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Designated Area</label>
              <input style={fieldStyle} value={form.designated_area} onChange={e => handleChange('designated_area', e.target.value)} placeholder="e.g. Shower Booth" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Project Address</label>
              <textarea style={{ ...fieldStyle, minHeight: 60, resize: 'vertical' }} value={form.project_address} onChange={e => handleChange('project_address', e.target.value)} placeholder="Full project address" />
            </div>
          </div>
        </div>

        {/* People */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>People</h3>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Architect / Designer</label>
              <input style={fieldStyle} value={form.architect_designer} onChange={e => handleChange('architect_designer', e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label style={labelStyle}>Developer</label>
              <input style={fieldStyle} value={form.developer} onChange={e => handleChange('developer', e.target.value)} placeholder="Name" />
            </div>
            <div>
              <label style={labelStyle}>Contractor</label>
              <input style={fieldStyle} value={form.contractor} onChange={e => handleChange('contractor', e.target.value)} placeholder="Name" />
            </div>
          </div>
        </div>

        {/* Items & Quantities */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Items & Values</h3>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Item</label>
              <input style={fieldStyle} value={form.item} onChange={e => handleChange('item', e.target.value)} placeholder="Item/product name" />
            </div>
            <div>
              <label style={labelStyle}>Quantity</label>
              <input style={fieldStyle} value={form.quantity} onChange={e => handleChange('quantity', e.target.value)} placeholder="Quantity" />
            </div>
            <div>
              <label style={labelStyle}>Project Value (EUR)</label>
              <input style={fieldStyle} type="number" step="0.01" value={form.project_value} onChange={e => handleChange('project_value', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Total Value Shipped (EUR)</label>
              <input style={fieldStyle} type="number" step="0.01" value={form.total_value_shipped} onChange={e => handleChange('total_value_shipped', e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        {/* Dates */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Estimated Dates</h3>
          <div style={gridStyle}>
            <div>
              <label style={labelStyle}>Estimated Order Date</label>
              <input style={fieldStyle} type="date" value={form.estimated_order_date} onChange={e => handleChange('estimated_order_date', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Estimated Delivery Date (from Italy)</label>
              <input style={fieldStyle} type="date" value={form.estimated_delivery_date} onChange={e => handleChange('estimated_delivery_date', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Estimated Arrival Date (destination)</label>
              <input style={fieldStyle} type="date" value={form.estimated_arrival_date} onChange={e => handleChange('estimated_arrival_date', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={sectionStyle}>
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Notes</h3>
          <textarea style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }} value={form.note} onChange={e => handleChange('note', e.target.value)} placeholder="Additional notes..." />
        </div>

        {/* Submit */}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
          <button type="button" className="projects-btn" onClick={() => navigate('/projects')}>Cancel</button>
          <button type="submit" className="projects-new-btn" disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Update Project' : 'Create Project'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjectForm;
