import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { config } from '../config';
import { Project, Company, Client } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/Projects.css';

const API_BASE_URL = config.API_BASE_URL;

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';
const formatCurrency = (v?: number) => v != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) : '-';

const STATUS_DOT: Record<string, string> = { ATTIVO: '#4caf50', COMPLETATO: '#1565c0', SOSPESO: '#e65100', CANCELLATO: '#c62828' };

export const Projects: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'master_admin' || user?.role === 'manager';

  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters (initialized from URL params for back-navigation persistence)
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get('supplier') || '');
  const [clientFilter, setClientFilter] = useState(searchParams.get('client') || '');
  const [countryFilter, setCountryFilter] = useState(searchParams.get('country') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');

  // AI Search
  const [nlpQuery, setNlpQuery] = useState('');
  const [nlpResults, setNlpResults] = useState<Project[] | null>(null);
  const [nlpSearching, setNlpSearching] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);
  const [deleteChecked, setDeleteChecked] = useState(false);

  // Highlight
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // Handle highlight from URL
  useEffect(() => {
    const highlight = searchParams.get('highlight');
    if (highlight) {
      setHighlightId(highlight);
      setTimeout(() => {
        const element = document.getElementById(`project-${highlight}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
      const timer = setTimeout(() => setHighlightId(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Sync filters to URL for back-navigation persistence
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (supplierFilter) params.set('supplier', supplierFilter);
    if (clientFilter) params.set('client', clientFilter);
    if (countryFilter) params.set('country', countryFilter);
    if (statusFilter) params.set('status', statusFilter);
    if (typeFilter) params.set('type', typeFilter);
    // Preserve highlight param if present
    const highlight = searchParams.get('highlight');
    if (highlight) params.set('highlight', highlight);
    setSearchParams(params, { replace: true });
  }, [search, supplierFilter, clientFilter, countryFilter, statusFilter, typeFilter]);

  useEffect(() => { loadData(); }, []);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(''), 4000); return () => clearTimeout(t); } }, [success]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [projRes, compRes, cliRes] = await Promise.all([
        apiService.getProjects(),
        apiService.getCompanies(),
        apiService.getClients(),
      ]);
      if (projRes.success && projRes.data) setProjects(projRes.data);
      if (compRes.success && compRes.data) setCompanies(compRes.data);
      if (cliRes.success && cliRes.data) setClients(cliRes.data);
    } catch {
      setError('Error loading projects');
    } finally {
      setLoading(false);
    }
  };

  // Derived data
  const countries = useMemo(() => [...new Set(projects.map(p => p.country).filter(Boolean))].sort(), [projects]);

  const filteredProjects = useMemo(() => {
    const baseList = nlpResults !== null ? nlpResults : projects;
    return baseList.filter(p => {
      if (search) {
        const s = search.toLowerCase();
        const match = (p.project_name || '').toLowerCase().includes(s)
          || (p.supplier?.name || '').toLowerCase().includes(s)
          || (p.client?.name || '').toLowerCase().includes(s)
          || (p.architect_designer || '').toLowerCase().includes(s)
          || (p.developer || '').toLowerCase().includes(s)
          || (p.item || '').toLowerCase().includes(s)
          || String(p.project_number).includes(s);
        if (!match) return false;
      }
      if (supplierFilter && p.supplier_id !== supplierFilter) return false;
      if (clientFilter && p.client_id !== clientFilter) return false;
      if (countryFilter && p.country !== countryFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      if (typeFilter && p.project_type !== typeFilter) return false;
      return true;
    });
  }, [projects, nlpResults, search, supplierFilter, clientFilter, countryFilter, statusFilter, typeFilter]);

  // KPIs (based on filtered data)
  const kpis = useMemo(() => {
    const active = filteredProjects.filter(p => p.status === 'ATTIVO').length;
    const completed = filteredProjects.filter(p => p.status === 'COMPLETATO').length;
    const totalValue = filteredProjects.filter(p => p.status === 'ATTIVO').reduce((s, p) => s + (Number(p.project_value) || 0), 0);
    const totalShipped = filteredProjects.reduce((s, p) => s + (Number(p.total_value_shipped) || 0), 0);
    return { total: filteredProjects.length, active, completed, totalValue, totalShipped };
  }, [filteredProjects]);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const res = await apiService.deleteProject(deleteConfirm.id);
      if (res.success) {
        setProjects(prev => prev.filter(p => p.id !== deleteConfirm.id));
        setSuccess('Project deleted');
      }
    } catch {
      setError('Error deleting project');
    }
    setDeleteConfirm(null);
    setDeleteChecked(false);
  };

  const handleNlpSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpQuery.trim()) return;
    try {
      setNlpSearching(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/search/projects`,
        { query: nlpQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setNlpResults(res.data.data || []);
      }
    } catch {
      setError('AI search failed');
    } finally {
      setNlpSearching(false);
    }
  };

  const clearNlpSearch = () => {
    setNlpQuery('');
    setNlpResults(null);
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const filters = { supplier_id: supplierFilter, client_id: clientFilter, country: countryFilter, status: statusFilter, project_type: typeFilter };
      const blob = format === 'pdf'
        ? await apiService.exportProjectsPdf(filters)
        : await apiService.exportProjectsExcel(filters);
      downloadBlob(blob, `projects-report-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading projects...</div>;

  return (
    <div className="projects-page">
      {/* Header */}
      <div className="projects-header">
        <div>
          <h1>Projects</h1>
          <p>Manage and track project registrations</p>
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
          {isAdmin && (
            <button className="projects-new-btn" onClick={() => navigate('/projects/new')}>
              + New Project
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ background: '#fce4ec', color: '#c62828', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>{error}</div>}
      {success && <div style={{ background: '#e8f5e9', color: '#2e7d32', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem' }}>{success}</div>}

      {/* KPI Cards */}
      <div className="projects-kpi-row">
        <div className="projects-kpi-card">
          <div className="projects-kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></div>
          <div><div className="projects-kpi-value">{kpis.total}</div><div className="projects-kpi-label">Total Projects</div></div>
        </div>
        <div className="projects-kpi-card">
          <div className="projects-kpi-icon" style={{ color: '#4caf50' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div>
          <div><div className="projects-kpi-value">{kpis.active}</div><div className="projects-kpi-label">Active</div></div>
        </div>
        <div className="projects-kpi-card">
          <div className="projects-kpi-icon" style={{ color: '#1565c0' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
          <div><div className="projects-kpi-value">{kpis.completed}</div><div className="projects-kpi-label">Completed</div></div>
        </div>
        <div className="projects-kpi-card">
          <div className="projects-kpi-icon" style={{ color: '#e65100' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
          <div><div className="projects-kpi-value">{formatCurrency(kpis.totalValue)}</div><div className="projects-kpi-label">Active Value</div></div>
        </div>
      </div>

      {/* Filters */}
      <div className="projects-filters">
        <input
          type="text" placeholder="Search projects..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)}>
          <option value="">All Suppliers</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}>
          <option value="">All Countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="ATTIVO">Attivo</option>
          <option value="COMPLETATO">Completato</option>
          <option value="SOSPESO">Sospeso</option>
          <option value="CANCELLATO">Cancellato</option>
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
        </select>
      </div>

      {/* AI Search */}
      <form className="projects-nlp-row" onSubmit={handleNlpSearch}>
        <input
          type="text"
          placeholder='Natural language search... e.g. "hotel projects in Korea" or "progetti attivi Kronos"'
          value={nlpQuery}
          onChange={e => setNlpQuery(e.target.value)}
        />
        <button type="submit" disabled={nlpSearching || !nlpQuery.trim()}>
          {nlpSearching ? 'Searching...' : 'AI Search'}
        </button>
        {nlpResults !== null && (
          <button type="button" className="projects-nlp-clear" onClick={clearNlpSearch}>
            Clear
          </button>
        )}
      </form>

      {/* Table */}
      <div className="projects-table-wrapper">
        <div className="projects-count">
          {filteredProjects.length} projects{nlpResults !== null ? ' (AI search results)' : ''}
        </div>
        {filteredProjects.length === 0 ? (
          <div className="projects-empty">No projects found</div>
        ) : (
          <table className="projects-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Project</th>
                <th>Supplier</th>
                <th>Client</th>
                <th>Country</th>
                <th>Status</th>
                <th>Development</th>
                <th>Type</th>
                <th>Value</th>
                <th>Shipped</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProjects.map(p => (
                <tr key={p.id} id={`project-${p.id}`} className={highlightId === p.id ? 'highlighted' : ''} onDoubleClick={() => navigate(`/projects/${p.id}`)} style={{ cursor: 'pointer' }}>
                  <td>{p.project_number}</td>
                  <td>
                    <div className="project-name-cell">{p.project_name || '-'}</div>
                    {p.registration_date && <div style={{ fontSize: '0.75rem', color: '#888' }}>{formatDate(p.registration_date)}</div>}
                  </td>
                  <td>{p.supplier?.name || '-'}</td>
                  <td>{p.client?.name || '-'}</td>
                  <td>{p.country || '-'}</td>
                  <td>
                    <span className={`project-status ${p.status}`}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[p.status] || '#888', display: 'inline-block' }} />
                      {p.status}
                    </span>
                  </td>
                  <td><span className="project-dev-badge">{p.project_development || '-'}</span></td>
                  <td>{p.project_type || '-'}</td>
                  <td><span className="project-value">{formatCurrency(p.project_value)}</span></td>
                  <td><span className="project-value shipped">{formatCurrency(p.total_value_shipped)}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="projects-actions">
                      <button className="projects-btn primary" onClick={() => navigate(`/projects/${p.id}`)}>View</button>
                      <button className="projects-btn" onClick={() => navigate(`/projects/${p.id}/edit`)}>Edit</button>
                      {(user?.role === 'admin' || user?.role === 'master_admin') && (
                        <button className="projects-btn delete" onClick={() => { setDeleteConfirm(p); setDeleteChecked(false); }}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete modal */}
      {deleteConfirm && (
        <div className="projects-delete-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="projects-delete-modal" onClick={e => e.stopPropagation()}>
            <h3>Delete Project</h3>
            <p>Are you sure you want to delete project <strong>#{deleteConfirm.project_number} - {deleteConfirm.project_name}</strong>?</p>
            <label>
              <input type="checkbox" checked={deleteChecked} onChange={e => setDeleteChecked(e.target.checked)} />
              I confirm deletion
            </label>
            <div className="projects-delete-actions">
              <button className="cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="confirm" disabled={!deleteChecked} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
