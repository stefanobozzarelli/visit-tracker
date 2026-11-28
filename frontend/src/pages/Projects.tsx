import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSessionState, useScrollRestore } from '../hooks/useSessionState';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { config } from '../config';
import { Project, Company, Client } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/Projects.css';
import { itNumberFormat, fmtNum } from '../utils/numberFormat';

const API_BASE_URL = config.API_BASE_URL;

const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('it-IT') : '-';
const formatCurrency = (v?: number) => v != null ? itNumberFormat({ style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v) : '-';

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

  // Filters
  const [search, setSearch] = useSessionState('projects__search', '');
  const [supplierFilter, setSupplierFilter] = useSessionState('projects__supplier', '');
  const [clientFilter, setClientFilter] = useSessionState('projects__client', '');
  const [countryFilter, setCountryFilter] = useSessionState('projects__country', '');
  const [statusFilter, setStatusFilter] = useSessionState('projects__status', '');
  const [typeFilter, setTypeFilter] = useSessionState('projects__type', '');

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

  // Duplicate detection — persisted so state survives project navigation
  const [duplicateMode, setDuplicateMode] = useSessionState<boolean>('projects__duplicateMode', false);
  const [duplicateSensitivity, setDuplicateSensitivity] = useSessionState<number>('projects__duplicateSensitivity', 70);

  useScrollRestore('projects', !loading);

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

  // --- Duplicate detection ---
  const duplicateGroups = useMemo(() => {
    if (!duplicateMode) return [];

    const tokenize = (s: string) =>
      (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

    const jaccard = (a: string, b: string): number => {
      const ta = new Set(tokenize(a));
      const tb = new Set(tokenize(b));
      if (ta.size === 0 && tb.size === 0) return 1;
      if (ta.size === 0 || tb.size === 0) return 0;
      let inter = 0;
      ta.forEach(t => { if (tb.has(t)) inter++; });
      return inter / (ta.size + tb.size - inter);
    };

    const exact = (a: string | undefined, b: string | undefined) =>
      a && b && a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;

    const projectSimilarity = (p1: Project, p2: Project): number => {
      const nameSim     = jaccard(p1.project_name || '', p2.project_name || '') * 45;
      const clientSim   = (p1.client_id && p1.client_id === p2.client_id ? 1 : 0) * 20;
      const supplierSim = (p1.supplier_id && p1.supplier_id === p2.supplier_id ? 1 : 0) * 10;
      const addrSim     = jaccard(p1.project_address || '', p2.project_address || '') * 10;
      const countrySim  = exact(p1.country, p2.country) * 5;
      const archSim     = jaccard(p1.architect_designer || '', p2.architect_designer || '') * 5;
      const devSim      = jaccard(p1.developer || '', p2.developer || '') * 5;
      return nameSim + clientSim + supplierSim + addrSim + countrySim + archSim + devSim;
    };

    const threshold = duplicateSensitivity;
    const list = filteredProjects;
    // Build adjacency: pairs above threshold
    const pairs: { i: number; j: number; score: number }[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const score = projectSimilarity(list[i], list[j]);
        if (score >= threshold) pairs.push({ i, j, score });
      }
    }
    // Union-Find for grouping
    const parent = list.map((_, i) => i);
    const find = (x: number): number => parent[x] === x ? x : (parent[x] = find(parent[x]));
    const union = (x: number, y: number) => { parent[find(x)] = find(y); };
    pairs.forEach(({ i, j }) => union(i, j));

    const groupMap = new Map<number, { projects: Project[]; maxScore: number }>();
    list.forEach((p, i) => {
      const root = find(i);
      if (!groupMap.has(root)) groupMap.set(root, { projects: [], maxScore: 0 });
      groupMap.get(root)!.projects.push(p);
    });
    pairs.forEach(({ i, j, score }) => {
      const root = find(i);
      const g = groupMap.get(root);
      if (g && score > g.maxScore) g.maxScore = score;
    });

    return Array.from(groupMap.values())
      .filter(g => g.projects.length > 1)
      .sort((a, b) => b.maxScore - a.maxScore);
  }, [duplicateMode, duplicateSensitivity, filteredProjects]);

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
          <button
            onClick={() => setDuplicateMode(m => !m)}
            style={{ padding: '0.5rem 0.75rem', background: duplicateMode ? '#7c3aed' : '#6b7280', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
          >
            {duplicateMode ? '✕ Duplicati' : '⚡ Duplicati'}
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
          <div><div className="projects-kpi-value">{fmtNum(kpis.total)}</div><div className="projects-kpi-label">Total Projects</div></div>
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

      {/* Duplicate detection panel */}
      {duplicateMode && (
        <div style={{ background: '#f3f0ff', border: '1.5px solid #7c3aed', borderRadius: 10, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap', marginBottom: duplicateGroups.length > 0 ? '1rem' : 0 }}>
            <span style={{ fontWeight: 700, color: '#5b21b6', fontSize: '0.9375rem' }}>⚡ Ricerca Duplicati</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#374151' }}>
              Sensibilità: <strong style={{ color: '#5b21b6', minWidth: 32 }}>{duplicateSensitivity}%</strong>
              <input
                type="range" min={40} max={90} step={5}
                value={duplicateSensitivity}
                onChange={e => setDuplicateSensitivity(Number(e.target.value))}
                style={{ width: 140, accentColor: '#7c3aed' }}
              />
            </label>
            <span style={{ fontSize: '0.8125rem', color: '#6b7280' }}>
              {duplicateGroups.length === 0 ? 'Nessun duplicato trovato' : `${duplicateGroups.length} gruppo${duplicateGroups.length > 1 ? 'i' : ''} trovato${duplicateGroups.length > 1 ? 'i' : ''}`}
            </span>
          </div>
          {duplicateGroups.map((group, gi) => (
            <div key={gi} style={{ background: 'white', border: '1px solid #c4b5fd', borderRadius: 8, marginBottom: '0.75rem', overflow: 'hidden' }}>
              <div style={{ background: '#ede9fe', padding: '0.4rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, color: '#5b21b6', fontSize: '0.8125rem' }}>Gruppo {gi + 1} — {group.projects.length} progetti simili</span>
                <span style={{ background: '#7c3aed', color: 'white', borderRadius: 12, padding: '0.15rem 0.6rem', fontSize: '0.75rem', fontWeight: 700 }}>
                  {Math.round(group.maxScore)}% similitudine
                </span>
              </div>
              <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#faf5ff' }}>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>#</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Progetto</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Fornitore</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Cliente</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Paese</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Architetto</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Developer</th>
                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'left', color: '#374151', fontWeight: 600 }}>Stato</th>
                    <th style={{ padding: '0.4rem 0.75rem' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {group.projects.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid #ede9fe' }}>
                      <td style={{ padding: '0.4rem 0.75rem', color: '#6b7280' }}>{p.project_number}</td>
                      <td style={{ padding: '0.4rem 0.75rem', fontWeight: 600, color: '#1f2937' }}>{p.project_name || '-'}</td>
                      <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{p.supplier?.name || '-'}</td>
                      <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{p.client?.name || '-'}</td>
                      <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{p.country || '-'}</td>
                      <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{p.architect_designer || '-'}</td>
                      <td style={{ padding: '0.4rem 0.75rem', color: '#374151' }}>{p.developer || '-'}</td>
                      <td style={{ padding: '0.4rem 0.75rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 600, color: STATUS_DOT[p.status] || '#888' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[p.status] || '#888', display: 'inline-block' }} />
                          {p.status}
                        </span>
                      </td>
                      <td style={{ padding: '0.4rem 0.75rem' }}>
                        <button
                          onClick={() => navigate(`/projects/${p.id}`)}
                          style={{ padding: '0.25rem 0.6rem', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 5, fontSize: '0.75rem', cursor: 'pointer' }}
                        >
                          Apri
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

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
