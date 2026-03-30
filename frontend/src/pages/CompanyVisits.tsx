import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Company, CompanyVisit, User } from '../types';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/CompanyVisits.css';

// ---- Status helpers ----
type VisitStatus = 'scheduled' | 'completed' | 'cancelled';

const STATUS_CONFIG: Record<VisitStatus, { label: string; color: string }> = {
  scheduled:  { label: 'Scheduled',  color: '#B09840' },
  completed:  { label: 'Completed',  color: '#5B8A65' },
  cancelled:  { label: 'Cancelled',  color: '#8A7F72' },
};

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

// ---- Component ----
export const CompanyVisits: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [visits, setVisits] = useState<CompanyVisit[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Filters
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [exporting, setExporting] = useState(false);

  // Close company dropdown on outside click
  useEffect(() => {
    if (!showCompanyDropdown) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.cv-company-multiselect')) setShowCompanyDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCompanyDropdown]);

  // Clear alerts
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ---- Data loading ----
  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadVisits(); }, [selectedCompanyIds, statusFilter, countryFilter]);

  const loadData = async () => {
    try {
      setLoading(true);
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) setCompanies(r.data);
      } catch {}
      try {
        const r = await apiService.getUsers();
        if (r.success && r.data) setUsers(r.data);
      } catch {}
      await loadVisits();
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  const loadVisits = async () => {
    try {
      const filters: any = {};
      if (selectedCompanyIds.length > 0) filters.companyIds = selectedCompanyIds;
      if (statusFilter) filters.status = statusFilter;
      if (countryFilter) filters.country = countryFilter;

      const response = await apiService.getCompanyVisits(filters);
      if (response.success) {
        const data = Array.isArray(response.data) ? response.data : [];
        setVisits(data);
      }
    } catch {
      setError('Error loading company meetings');
    }
  };

  // ---- Actions ----
  const handleDelete = async (visitId: string) => {
    if (!window.confirm('Delete this company meeting?')) return;
    try {
      await apiService.deleteCompanyVisit(visitId);
      setSuccess('Company meeting deleted');
      loadVisits();
    } catch {
      setError('Error deleting company meeting');
    }
  };

  // ---- Computed data ----
  const getCompanyName = useCallback((id: string) => {
    return companies.find(c => c.id === id)?.name || '-';
  }, [companies]);

  const getUserName = useCallback((id: string) => {
    return users.find(u => u.id === id)?.name || id;
  }, [users]);

  const getParticipantsDisplay = useCallback((visit: CompanyVisit) => {
    const parts: string[] = [];

    if (visit.participants_user_ids) {
      try {
        const ids: string[] = JSON.parse(visit.participants_user_ids);
        if (Array.isArray(ids) && ids.length > 0) {
          const names = ids.map(id => getUserName(id));
          parts.push(names.join(', '));
        }
      } catch {
        // invalid JSON, skip
      }
    }

    if (visit.participants_external) {
      parts.push(visit.participants_external);
    }

    return parts.length > 0 ? parts.join('; ') : '-';
  }, [getUserName]);

  // Unique countries from companies
  const countries = useMemo(() => {
    const set = new Set<string>();
    companies.forEach(c => { if (c.country) set.add(c.country); });
    return Array.from(set).sort();
  }, [companies]);

  const toggleCompanyId = useCallback((id: string) => {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }, []);

  const companyFilterLabel = useMemo(() => {
    if (selectedCompanyIds.length === 0) return 'All Companies';
    if (selectedCompanyIds.length === 1) {
      return companies.find(c => c.id === selectedCompanyIds[0])?.name || '1 company';
    }
    return `${selectedCompanyIds.length} companies`;
  }, [selectedCompanyIds, companies]);

  // KPIs
  const kpis = useMemo(() => {
    let scheduled = 0, completed = 0, cancelled = 0;
    for (const v of visits) {
      if (v.status === 'scheduled') scheduled++;
      else if (v.status === 'completed') completed++;
      else if (v.status === 'cancelled') cancelled++;
    }
    return { scheduled, completed, cancelled, total: visits.length };
  }, [visits]);

  // ---- Export ----
  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const filters: any = {};
      if (selectedCompanyIds.length > 0) filters.companyIds = selectedCompanyIds;
      if (statusFilter) filters.status = statusFilter;
      if (countryFilter) filters.country = countryFilter;
      const blob = format === 'pdf'
        ? await apiService.exportCompanyVisitsPdf(filters)
        : await apiService.exportCompanyVisitsExcel(filters);
      downloadBlob(blob, `company-visits-report-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="cv-page"><div className="cv-loading">Loading company meetings...</div></div>;
  }

  return (
    <div className="cv-page">
      {/* Header */}
      <div className="cv-header">
        <div className="cv-header-left">
          <h1>Supplier Meetings</h1>
          <p className="cv-header-subtitle">Manage supplier meetings</p>
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
          <button className="cv-btn-new" onClick={() => navigate('/company-visits/new')}>
            + New Meeting
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && <div className="cv-alert cv-alert-error">{error}</div>}
      {success && <div className="cv-alert cv-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="cv-kpi-row">
        <div className="cv-kpi kpi-scheduled">
          <div className="cv-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </div>
          <div className="cv-kpi-body">
            <div className="cv-kpi-value">{kpis.scheduled}</div>
            <div className="cv-kpi-label">Scheduled</div>
          </div>
        </div>
        <div className="cv-kpi kpi-completed">
          <div className="cv-kpi-icon green">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          </div>
          <div className="cv-kpi-body">
            <div className="cv-kpi-value">{kpis.completed}</div>
            <div className="cv-kpi-label">Completed</div>
          </div>
        </div>
        <div className="cv-kpi kpi-cancelled">
          <div className="cv-kpi-icon gray">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
          </div>
          <div className="cv-kpi-body">
            <div className="cv-kpi-value">{kpis.cancelled}</div>
            <div className="cv-kpi-label">Cancelled</div>
          </div>
        </div>
        <div className="cv-kpi kpi-total">
          <div className="cv-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="cv-kpi-body">
            <div className="cv-kpi-value">{kpis.total}</div>
            <div className="cv-kpi-label">Total</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="cv-toolbar">
        <div className="cv-filters-row">
          {/* Multi-select company dropdown */}
          <div className="cv-company-multiselect" style={{ position: 'relative' }}>
            <button
              type="button"
              className={`cv-filter-select${selectedCompanyIds.length > 0 ? ' active' : ''}`}
              onClick={() => setShowCompanyDropdown(prev => !prev)}
              style={{ cursor: 'pointer', textAlign: 'left', minWidth: '180px' }}
            >
              {companyFilterLabel}
            </button>
            {showCompanyDropdown && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 50,
                  background: 'var(--color-bg, #fff)',
                  border: '1px solid var(--color-border, #ddd)',
                  borderRadius: '8px',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  maxHeight: '280px',
                  overflowY: 'auto',
                  minWidth: '220px',
                  padding: '0.25rem 0',
                }}
              >
                {selectedCompanyIds.length > 0 && (
                  <div
                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.75rem', color: '#dc2626', cursor: 'pointer', borderBottom: '1px solid var(--color-border, #eee)' }}
                    onClick={() => setSelectedCompanyIds([])}
                  >
                    Clear selection
                  </div>
                )}
                {companies.map(c => (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.4rem 0.75rem',
                      cursor: 'pointer',
                      fontSize: '0.8125rem',
                      background: selectedCompanyIds.includes(c.id) ? 'var(--color-bg-hover, #f0f4ff)' : 'transparent',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCompanyIds.includes(c.id)}
                      onChange={() => toggleCompanyId(c.id)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Country filter */}
          <select
            className={`cv-filter-select${countryFilter ? ' active' : ''}`}
            value={countryFilter}
            onChange={e => setCountryFilter(e.target.value)}
          >
            <option value="">All Countries</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            className={`cv-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {(selectedCompanyIds.length > 0 || statusFilter || countryFilter) && (
            <button
              type="button"
              className="cv-reset-btn"
              onClick={() => {
                setSelectedCompanyIds([]);
                setStatusFilter('');
                setCountryFilter('');
              }}
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="cv-table-wrap">
        {visits.length > 0 && (
          <div className="cv-result-count">
            {visits.length} visit{visits.length !== 1 ? 's' : ''}
          </div>
        )}

        {visits.length === 0 ? (
          <div className="cv-empty">
            <div className="cv-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <div className="cv-empty-text">No company meetings found</div>
            <div className="cv-empty-hint">Try adjusting your filters or create a new meeting</div>
          </div>
        ) : (
          <div className="cv-table-scroll">
            <table className="cv-table">
              <thead>
                <tr>
                  <th style={{ width: '15%' }}>Company</th>
                  <th style={{ width: '10%' }}>Date</th>
                  <th style={{ width: '20%' }}>Subject</th>
                  <th style={{ width: '25%' }}>Participants</th>
                  <th style={{ width: '10%' }}>Status</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visits.map(visit => (
                  <tr key={visit.id} onDoubleClick={() => navigate(`/company-visits/${visit.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div className="cv-company-name">
                        {visit.company?.name || getCompanyName(visit.company_id)}
                      </div>
                    </td>
                    <td>{formatDate(visit.date)}</td>
                    <td style={{ maxWidth: '250px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {visit.subject ? (visit.subject.length > 80 ? visit.subject.substring(0, 80) + '...' : visit.subject) : '-'}
                    </td>
                    <td style={{ maxWidth: '300px', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {(() => {
                        const display = getParticipantsDisplay(visit);
                        return display.length > 80 ? display.substring(0, 80) + '...' : display;
                      })()}
                    </td>
                    <td>
                      <span className={`cv-status-pill status-${visit.status}`}>
                        <span className="cv-status-dot" />
                        {STATUS_CONFIG[visit.status as VisitStatus]?.label || visit.status}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="cv-actions">
                        <button
                          className="cv-action-btn primary"
                          onClick={() => navigate(`/company-visits/${visit.id}`)}
                        >
                          View
                        </button>
                        <button
                          className="cv-action-btn"
                          onClick={() => navigate(`/company-visits/${visit.id}/edit`)}
                        >
                          Edit
                        </button>
                        {isAdmin && (
                          <button
                            className="cv-action-btn danger"
                            onClick={() => handleDelete(visit.id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyVisits;
