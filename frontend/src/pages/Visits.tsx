import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Visit, Client, Company, User, TodoItem, VisitReport } from '../types';
import { decodeMetadata, filterDisplayReports, METADATA_SECTION } from '../utils/visitMetadata';
import axios from 'axios';
import { config } from '../config';
import '../styles/Visits.css';

const API_BASE_URL = config.API_BASE_URL;

// ---- Helpers ----
const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const isThisMonth = (d: string) => {
  const date = new Date(d);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
};

const isLast30Days = (d: string) => {
  const date = new Date(d);
  const thirtyAgo = new Date();
  thirtyAgo.setDate(thirtyAgo.getDate() - 30);
  return date >= thirtyAgo;
};

// Get display reports (filtering out __metadata__)
const getDisplayReports = (reports?: VisitReport[]) => {
  if (!reports || !Array.isArray(reports)) return [];
  return reports.filter(r => r.section !== METADATA_SECTION);
};

// Report status for a visit
type ReportStatus = 'has_report' | 'missing';
const getReportStatus = (reports?: VisitReport[]): ReportStatus => {
  const display = getDisplayReports(reports);
  return display.length > 0 ? 'has_report' : 'missing';
};

const REPORT_STATUS_CONFIG: Record<ReportStatus, { label: string; className: string }> = {
  has_report: { label: 'Report Ready', className: 'report-ready' },
  missing:    { label: 'Missing Report', className: 'report-missing' },
};

// Follow-up status
type FollowUpStatus = 'none' | 'needed' | 'open' | 'completed';
const FOLLOWUP_CONFIG: Record<FollowUpStatus, { label: string; className: string }> = {
  none:      { label: 'No Follow-up', className: 'followup-none' },
  needed:    { label: 'Follow-up Needed', className: 'followup-needed' },
  open:      { label: 'Task Open', className: 'followup-open' },
  completed: { label: 'Completed', className: 'followup-completed' },
};

// ---- Component ----
export const Visits: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  // Data
  const [visits, setVisits] = useState<Visit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);

  // Filters
  const [clientId, setClientId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [visitedBy, setVisitedBy] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [localSearch, setLocalSearch] = useState('');

  // Quick filters
  const [thisMonth, setThisMonth] = useState(false);
  const [last30Days, setLast30Days] = useState(false);
  const [withReport, setWithReport] = useState(false);
  const [missingReport, setMissingReport] = useState(false);
  const [followUpNeeded, setFollowUpNeeded] = useState(false);

  // NLP search
  const [nlpQuery, setNlpQuery] = useState('');
  const [nlpResults, setNlpResults] = useState<Visit[] | null>(null);
  const [nlpSearching, setNlpSearching] = useState(false);

  // UI
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [openMoreId, setOpenMoreId] = useState<string | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openMoreId && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setOpenMoreId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMoreId]);

  // Clear alerts
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  // ---- Data loading ----
  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      try {
        const r = await apiService.getVisits();
        if (r.success && r.data) setVisits(r.data);
      } catch {}
      try {
        const r = await apiService.getClients();
        if (r.success && r.data) setClients(r.data);
      } catch {}
      try {
        const r = await apiService.getCompanies();
        if (r.success && r.data) setCompanies(r.data);
      } catch {}
      try {
        const r = await apiService.getUsers();
        if (r.success && r.data) setUsers(r.data);
      } catch {}
      try {
        const r = isAdmin
          ? await apiService.getTodos()
          : await apiService.getMyTodos();
        if (r.success) {
          const data = Array.isArray(r.data) ? r.data : [];
          setTodos(data);
        }
      } catch {}
    } catch {
      setError('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  // ---- Lookups ----
  const getClientName = useCallback((id: string) => clients.find(c => c.id === id)?.name || '-', [clients]);
  const getCompanyName = useCallback((id: string) => companies.find(c => c.id === id)?.name || '-', [companies]);
  const getUserName = useCallback((id: string) => users.find(u => u.id === id)?.name || '-', [users]);

  // ---- Follow-up status per visit ----
  const visitFollowUp = useMemo(() => {
    const map = new Map<string, FollowUpStatus>();
    for (const visit of visits) {
      const meta = decodeMetadata(visit.reports || []);
      const visitTodos = todos.filter(t => t.visit_report_id &&
        visit.reports?.some(r => r.id === t.visit_report_id));

      if (visitTodos.length > 0) {
        const allDone = visitTodos.every(t => t.status === 'done' || t.status === 'completed');
        map.set(visit.id, allDone ? 'completed' : 'open');
      } else if (meta?.followUpRequired) {
        map.set(visit.id, 'needed');
      } else {
        map.set(visit.id, 'none');
      }
    }
    return map;
  }, [visits, todos]);

  // ---- Companies involved in a visit (from reports) ----
  const getVisitCompanies = useCallback((visit: Visit) => {
    const display = getDisplayReports(visit.reports);
    const companyNames = display
      .map(r => r.company?.name || getCompanyName(r.company_id))
      .filter((name, idx, arr) => name !== '-' && arr.indexOf(name) === idx);
    return companyNames;
  }, [getCompanyName]);

  // ---- KPIs ----
  const kpis = useMemo(() => {
    let thisMonthCount = 0;
    let reportsPending = 0;
    let openFollowups = 0;

    const visitedClientIds = new Set<string>();
    const recentClientIds = new Set<string>();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 60);

    for (const v of visits) {
      if (isThisMonth(v.visit_date)) thisMonthCount++;
      if (getReportStatus(v.reports) === 'missing') reportsPending++;

      const fu = visitFollowUp.get(v.id);
      if (fu === 'needed' || fu === 'open') openFollowups++;

      visitedClientIds.add(v.client_id);
      if (new Date(v.visit_date) >= thirtyDaysAgo) {
        recentClientIds.add(v.client_id);
      }
    }

    // Clients not visited recently: clients that have visits but none in last 60 days
    const neglected = visitedClientIds.size - recentClientIds.size;

    return {
      total: visits.length,
      thisMonth: thisMonthCount,
      reportsPending,
      openFollowups,
      neglected: neglected > 0 ? neglected : 0,
    };
  }, [visits, visitFollowUp]);

  // ---- Visible visits ----
  const visibleVisits = useMemo(() => {
    let list = nlpResults !== null ? nlpResults : visits;

    // Sort by date descending
    list = [...list].sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

    // Client filter
    if (clientId) {
      list = list.filter(v => v.client_id === clientId);
    }

    // Company filter (visit has a report for this company)
    if (companyId) {
      list = list.filter(v =>
        v.reports?.some(r => r.company_id === companyId && r.section !== METADATA_SECTION)
      );
    }

    // Visited by filter
    if (visitedBy) {
      list = list.filter(v => v.visited_by_user_id === visitedBy);
    }

    // Status filter
    if (statusFilter) {
      list = list.filter(v => (v.status || 'scheduled') === statusFilter);
    }

    // Quick filters
    if (thisMonth) {
      list = list.filter(v => isThisMonth(v.visit_date));
    }
    if (last30Days) {
      list = list.filter(v => isLast30Days(v.visit_date));
    }
    if (withReport) {
      list = list.filter(v => getReportStatus(v.reports) === 'has_report');
    }
    if (missingReport) {
      list = list.filter(v => getReportStatus(v.reports) === 'missing');
    }
    if (followUpNeeded) {
      list = list.filter(v => {
        const fu = visitFollowUp.get(v.id);
        return fu === 'needed' || fu === 'open';
      });
    }

    // Local text search
    if (localSearch.trim()) {
      const q = localSearch.toLowerCase();
      list = list.filter(v => {
        const clientName = (v.client?.name || getClientName(v.client_id)).toLowerCase();
        const userName = (v.visited_by_user?.name || getUserName(v.visited_by_user_id)).toLowerCase();
        const companyNames = getVisitCompanies(v).join(' ').toLowerCase();
        const meta = decodeMetadata(v.reports || []);
        const purpose = (meta?.purpose || '').toLowerCase();
        const location = (meta?.location || '').toLowerCase();
        return clientName.includes(q) || userName.includes(q) || companyNames.includes(q)
          || purpose.includes(q) || location.includes(q);
      });
    }

    return list;
  }, [visits, nlpResults, clientId, companyId, visitedBy, statusFilter, thisMonth, last30Days,
      withReport, missingReport, followUpNeeded, localSearch,
      getClientName, getUserName, getVisitCompanies, visitFollowUp]);

  // ---- NLP search ----
  const handleNlpSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpQuery.trim()) return;
    try {
      setNlpSearching(true);
      const token = localStorage.getItem('token');
      const res = await axios.post(
        `${API_BASE_URL}/search/visits`,
        { query: nlpQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        setNlpResults(res.data.data || []);
      }
    } catch {
      setError('Search failed');
    } finally {
      setNlpSearching(false);
    }
  };

  const clearNlpSearch = () => {
    setNlpQuery('');
    setNlpResults(null);
  };

  // ---- Delete ----
  const handleDelete = async (visitId: string) => {
    setOpenMoreId(null);
    if (!window.confirm('Delete this visit?')) return;
    try {
      await apiService.deleteVisit(visitId);
      setSuccess('Visit deleted');
      setVisits(prev => prev.filter(v => v.id !== visitId));
    } catch {
      setError('Error deleting visit');
    }
  };

  // ---- Render ----
  if (loading) {
    return <div className="visits-page"><div className="visits-loading">Loading visits...</div></div>;
  }

  return (
    <div className="visits-page">
      {/* Header */}
      <div className="visits-header">
        <div className="visits-header-left">
          <h1>Client Meetings</h1>
          <p className="visits-header-subtitle">Track client meetings, reports, and follow-up activity</p>
        </div>
        <button className="visits-btn-new" onClick={() => navigate('/visits/new')}>
          + Register New Visit
        </button>
      </div>

      {/* Alerts */}
      {error && <div className="visits-alert visits-alert-error">{error}</div>}
      {success && <div className="visits-alert visits-alert-success">{success}</div>}

      {/* KPI row */}
      <div className="visits-kpi-row">
        <div className="visits-kpi">
          <div className="visits-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="visits-kpi-body">
            <div className="visits-kpi-value">{kpis.thisMonth}</div>
            <div className="visits-kpi-label">This Month</div>
          </div>
        </div>
        <div className="visits-kpi">
          <div className="visits-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="visits-kpi-body">
            <div className={`visits-kpi-value${kpis.reportsPending > 0 ? ' alert' : ''}`}>{kpis.reportsPending}</div>
            <div className="visits-kpi-label">Reports Pending</div>
          </div>
        </div>
        <div className="visits-kpi">
          <div className="visits-kpi-icon red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="visits-kpi-body">
            <div className={`visits-kpi-value${kpis.openFollowups > 0 ? ' alert' : ''}`}>{kpis.openFollowups}</div>
            <div className="visits-kpi-label">Open Follow-ups</div>
          </div>
        </div>
        <div className="visits-kpi">
          <div className="visits-kpi-icon gray">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <div className="visits-kpi-body">
            <div className="visits-kpi-value">{kpis.neglected}</div>
            <div className="visits-kpi-label">Not Visited (60d)</div>
          </div>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="visits-toolbar">
        <div className="visits-filters-row">
          <input
            type="text"
            className="visits-search-input"
            placeholder="Search visits..."
            value={localSearch}
            onChange={e => setLocalSearch(e.target.value)}
          />

          <select
            className={`visits-filter-select${clientId ? ' active' : ''}`}
            value={clientId}
            onChange={e => setClientId(e.target.value)}
          >
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select
            className={`visits-filter-select${companyId ? ' active' : ''}`}
            value={companyId}
            onChange={e => setCompanyId(e.target.value)}
          >
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {isAdmin && (
            <select
              className={`visits-filter-select${visitedBy ? ' active' : ''}`}
              value={visitedBy}
              onChange={e => setVisitedBy(e.target.value)}
            >
              <option value="">All Visitors</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}

          <select
            className={`visits-filter-select${statusFilter ? ' active' : ''}`}
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <div className="visits-filter-divider" />

          {/* Reset filters button if any are active */}
          {(clientId || companyId || visitedBy || statusFilter || thisMonth || last30Days || withReport || missingReport || followUpNeeded || localSearch) && (
            <button
              type="button"
              className="visits-chip"
              onClick={() => {
                setClientId('');
                setCompanyId('');
                setVisitedBy('');
                setStatusFilter('');
                setThisMonth(false);
                setLast30Days(false);
                setWithReport(false);
                setMissingReport(false);
                setFollowUpNeeded(false);
                setLocalSearch('');
              }}
              style={{ background: '#fff3cd', color: '#856404', borderColor: '#ffc107' }}
            >
              ✕ Reset Filters
            </button>
          )}

          {/* Quick filter chips */}
          <div className="visits-chips">
            <button
              className={`visits-chip${thisMonth ? ' active' : ''}`}
              onClick={() => { setThisMonth(!thisMonth); if (!thisMonth) setLast30Days(false); }}
            >
              <span className="visits-chip-dot" />
              This Month
            </button>
            <button
              className={`visits-chip${last30Days ? ' active' : ''}`}
              onClick={() => { setLast30Days(!last30Days); if (!last30Days) setThisMonth(false); }}
            >
              <span className="visits-chip-dot" />
              Last 30 Days
            </button>
            <button
              className={`visits-chip${withReport ? ' active chip-green' : ''}`}
              onClick={() => { setWithReport(!withReport); if (!withReport) setMissingReport(false); }}
            >
              <span className="visits-chip-dot" />
              With Report
            </button>
            <button
              className={`visits-chip${missingReport ? ' active chip-orange' : ''}`}
              onClick={() => { setMissingReport(!missingReport); if (!missingReport) setWithReport(false); }}
            >
              <span className="visits-chip-dot" />
              Missing Report
            </button>
            <button
              className={`visits-chip${followUpNeeded ? ' active chip-red' : ''}`}
              onClick={() => setFollowUpNeeded(!followUpNeeded)}
            >
              <span className="visits-chip-dot" />
              Follow-up Needed
            </button>
          </div>
        </div>

        {/* NLP search — subtle, secondary row */}
        <form className="visits-nlp-row" onSubmit={handleNlpSearch}>
          <input
            type="text"
            className="visits-nlp-input"
            placeholder='Natural language search... e.g. "visits with issues this month"'
            value={nlpQuery}
            onChange={e => setNlpQuery(e.target.value)}
            disabled={nlpSearching}
          />
          <button type="submit" className="visits-nlp-btn" disabled={nlpSearching || !nlpQuery.trim()}>
            {nlpSearching ? 'Searching...' : 'AI Search'}
          </button>
          {nlpResults !== null && (
            <button type="button" className="visits-nlp-clear" onClick={clearNlpSearch}>
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="visits-table-wrap">
        {visibleVisits.length > 0 && (
          <div className="visits-result-count">
            {visibleVisits.length} visit{visibleVisits.length !== 1 ? 's' : ''}
            {nlpResults !== null && ' (AI search results)'}
          </div>
        )}

        {visibleVisits.length === 0 ? (
          <div className="visits-empty">
            <div className="visits-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="visits-empty-text">No visits found for this period</div>
            <div className="visits-empty-hint">Try changing filters or register a new visit</div>
          </div>
        ) : (
          <div className="visits-table-scroll">
            <table className="visits-table">
              <thead>
                <tr>
                  <th>Visit</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Visited By</th>
                  <th>Report</th>
                  <th>Follow-up</th>
                  <th style={{ width: '1%' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleVisits.map(visit => {
                  const clientName = visit.client?.name || getClientName(visit.client_id);
                  const visitorName = visit.visited_by_user?.name || getUserName(visit.visited_by_user_id);
                  const companyNames = getVisitCompanies(visit);
                  const meta = decodeMetadata(visit.reports || []);
                  const reportStatus = getReportStatus(visit.reports);
                  const reportConf = REPORT_STATUS_CONFIG[reportStatus];
                  const displayReports = getDisplayReports(visit.reports);
                  const followUp = visitFollowUp.get(visit.id) || 'none';
                  const followUpConf = FOLLOWUP_CONFIG[followUp];
                  const needsAttention = reportStatus === 'missing' || followUp === 'needed' || followUp === 'open';

                  return (
                    <tr
                      key={visit.id}
                      className={needsAttention ? 'row-needs-attention' : ''}
                      onDoubleClick={() => navigate(`/visits/${visit.id}`)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Visit — Client + Company + metadata */}
                      <td className="visit-context-cell">
                        <div className="visit-client-name">{clientName}</div>
                        {companyNames.length > 0 && (
                          <div className="visit-company-names">
                            {companyNames.join(' · ')}
                          </div>
                        )}
                        {meta?.purpose && (
                          <div className="visit-purpose">{meta.purpose}</div>
                        )}
                        {meta?.location && (
                          <div className="visit-location">{meta.location}</div>
                        )}
                      </td>

                      {/* Date */}
                      <td>
                        <span className="visit-date">{formatDate(visit.visit_date)}</span>
                      </td>

                      {/* Status */}
                      <td>
                        {(() => {
                          const st = (visit.status || 'scheduled') as 'scheduled' | 'completed' | 'cancelled';
                          const configs: Record<string, { label: string; className: string }> = {
                            scheduled:  { label: 'Scheduled',  className: 'visit-status-scheduled' },
                            completed:  { label: 'Completed',  className: 'visit-status-completed' },
                            cancelled:  { label: 'Cancelled',  className: 'visit-status-cancelled' },
                          };
                          const c = configs[st] || configs.scheduled;
                          return (
                            <span className={`visit-status-pill ${c.className}`}>
                              <span className="visit-status-dot" />
                              {c.label}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Visited By */}
                      <td>
                        <div className="visit-visitor">
                          <span className="visit-avatar">{getInitials(visitorName)}</span>
                          <span className="visit-visitor-name">{visitorName}</span>
                        </div>
                      </td>

                      {/* Report Status */}
                      <td>
                        <span className={`visit-report-pill ${reportConf.className}`}>
                          <span className="visit-report-dot" />
                          {reportConf.label}
                          {displayReports.length > 1 && (
                            <span className="visit-report-count">{displayReports.length}</span>
                          )}
                        </span>
                      </td>

                      {/* Follow-up */}
                      <td>
                        <span
                          className={`visit-followup-pill ${followUpConf.className}${followUp === 'open' || followUp === 'needed' ? ' clickable' : ''}`}
                          onClick={followUp === 'open' || followUp === 'needed' ? () => navigate('/tasks') : undefined}
                        >
                          {followUpConf.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="visit-actions">
                          <button
                            className="visit-action-btn primary"
                            onClick={() => navigate(`/visits/${visit.id}`)}
                          >
                            View
                          </button>
                          <button
                            className="visit-action-btn"
                            onClick={() => navigate(`/visits/${visit.id}`)}
                          >
                            Edit
                          </button>
                          <div
                            className="visit-more-wrap"
                            ref={openMoreId === visit.id ? moreRef : undefined}
                          >
                            <button
                              className="visit-more-btn"
                              onClick={() => setOpenMoreId(openMoreId === visit.id ? null : visit.id)}
                            >
                              &#x22EE;
                            </button>
                            {openMoreId === visit.id && (
                              <div className="visit-more-menu">
                                <button
                                  className="visit-more-item"
                                  onClick={() => { setOpenMoreId(null); navigate(`/visits/${visit.id}`); }}
                                >
                                  Open Report
                                </button>
                                <button
                                  className="visit-more-item"
                                  onClick={() => { setOpenMoreId(null); navigate('/todos/new'); }}
                                >
                                  Create Follow-up
                                </button>
                                <div className="visit-more-divider" />
                                <button
                                  className="visit-more-item danger"
                                  onClick={() => handleDelete(visit.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Visits;
