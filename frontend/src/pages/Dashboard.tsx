import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { decodeMetadata, METADATA_SECTION } from '../utils/visitMetadata';
import '../styles/Dashboard.css';

interface DashboardData {
  visits: any[];
  companyVisits: any[];
  todos: any[];
  companies: any[];
  clients: any[];
  users: any[];
}

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const daysSince = (d: string) => {
  const diff = Date.now() - new Date(d).getTime();
  return Math.floor(diff / 86400000);
};

const getDisplayReports = (reports?: any[]) => {
  if (!reports || !Array.isArray(reports)) return [];
  return reports.filter((r: any) => r.section !== METADATA_SECTION);
};

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>({ visits: [], companyVisits: [], todos: [], companies: [], clients: [], users: [] });
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'master_admin';

  useEffect(() => { loadData(); }, [user?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const results: DashboardData = { visits: [], companyVisits: [], todos: [], companies: [], clients: [], users: [] };

      try {
        const res = await apiService.getVisits(isAdmin ? undefined : { user_id: user?.id });
        if (res.success && res.data) results.visits = res.data;
      } catch {}
      try {
        const res = isAdmin ? await apiService.getTodos() : await apiService.getMyTodos();
        if (res.success && res.data) results.todos = Array.isArray(res.data) ? res.data : [];
      } catch {}
      try {
        const res = await apiService.getCompanyVisits();
        if (res.success && res.data) results.companyVisits = res.data;
      } catch {}
      try {
        const res = await apiService.getCompanies();
        if (res.success && res.data) results.companies = res.data;
      } catch {}
      try {
        const res = await apiService.getClients();
        if (res.success && res.data) results.clients = res.data;
      } catch {}
      try {
        const res = await apiService.getUsers();
        if (res.success && res.data) results.users = res.data;
      } catch {}

      setData(results);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Lookups ──
  const getClientName = (id: string) => data.clients.find(c => c.id === id)?.name || '-';
  const getCompanyName = (id: string) => data.companies.find(c => c.id === id)?.name || '-';
  const getUserName = (id: string) => data.users.find((u: any) => u.id === id)?.name || '-';

  // ── KPIs ──
  const kpis = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const cutoff60 = new Date();
    cutoff60.setDate(cutoff60.getDate() - 60);

    const visitsThisMonth = data.visits.filter(v => new Date(v.visit_date) >= startOfMonth).length;

    const reportsPending = data.visits.filter(v => {
      const display = getDisplayReports(v.reports);
      return display.length === 0;
    }).length;

    const openFollowups = data.todos.filter(t =>
      t.status !== 'done' && t.status !== 'completed'
    ).length;

    // Clients not visited recently
    const clientLastVisit: Record<string, Date> = {};
    for (const v of data.visits) {
      if (!v.client_id) continue;
      const d = new Date(v.visit_date);
      if (!clientLastVisit[v.client_id] || d > clientLastVisit[v.client_id]) {
        clientLastVisit[v.client_id] = d;
      }
    }
    const visitedClientIds = new Set(Object.keys(clientLastVisit));
    const neglectedClients = [...visitedClientIds].filter(id => {
      const last = clientLastVisit[id];
      return last < cutoff60;
    }).length;

    const todayStr = today.toISOString().split('T')[0];

    const tasksDueToday = data.todos.filter(t => {
      if (t.status === 'done' || t.status === 'completed') return false;
      if (!t.due_date) return false;
      return new Date(t.due_date).toISOString().split('T')[0] === todayStr;
    });

    const tasksOverdue = data.todos.filter(t => {
      if (t.status === 'done' || t.status === 'completed') return false;
      if (!t.due_date) return false;
      return new Date(t.due_date) < today;
    }).sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    return { visitsThisMonth, reportsPending, openFollowups, neglectedClients, tasksDueToday, tasksOverdue };
  }, [data]);

  // ── Priority Actions (visits missing report + overdue tasks) ──
  const priorityItems = useMemo(() => {
    const items: { type: 'missing_report' | 'overdue_task' | 'open_followup'; title: string; subtitle: string; date: string; onClick: () => void }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Visits missing report (recent first)
    const sortedVisits = [...data.visits]
      .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());

    for (const v of sortedVisits) {
      const display = getDisplayReports(v.reports);
      if (display.length === 0) {
        const clientName = v.client?.name || getClientName(v.client_id);
        const companies = (v.reports || [])
          .filter((r: any) => r.section !== METADATA_SECTION)
          .map((r: any) => r.company?.name || getCompanyName(r.company_id))
          .filter((n: string, i: number, a: string[]) => n !== '-' && a.indexOf(n) === i);

        items.push({
          type: 'missing_report',
          title: clientName,
          subtitle: companies.length > 0 ? companies.join(' · ') : 'Missing report',
          date: formatDate(v.visit_date),
          onClick: () => navigate(`/visits/${v.id}`),
        });
      }
      if (items.filter(i => i.type === 'missing_report').length >= 3) break;
    }

    // Overdue tasks
    const overdueTasks = data.todos
      .filter(t => {
        if (t.status === 'done' || t.status === 'completed') return false;
        if (!t.due_date) return false;
        return new Date(t.due_date) < today;
      })
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 3);

    for (const t of overdueTasks) {
      const parts = [getClientName(t.client_id)];
      if (t.created_by_user?.name) parts.push(`by ${t.created_by_user.name}`);
      if (t.assigned_to_user?.name) parts.push(`→ ${t.assigned_to_user.name}`);
      items.push({
        type: 'overdue_task',
        title: t.title,
        subtitle: parts.filter(p => p !== '-').join(' · '),
        date: formatDate(t.due_date),
        onClick: () => navigate('/tasks'),
      });
    }

    return items;
  }, [data, navigate]);

  // ── Recent Visits ──
  const recentVisits = useMemo(() => {
    return [...data.visits]
      .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime())
      .slice(0, 5);
  }, [data.visits]);

  // ── Today's Visits ──
  const todaysVisits = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const clientVisits = data.visits
      .filter(v => new Date(v.visit_date).toISOString().split('T')[0] === todayStr)
      .map(v => ({ ...v, _type: 'client' as const }));
    const supplierVisits = data.companyVisits
      .filter(v => new Date(v.date).toISOString().split('T')[0] === todayStr)
      .map(v => ({ ...v, _type: 'supplier' as const }));
    return { clientVisits, supplierVisits };
  }, [data.visits, data.companyVisits]);

  // ── Clients needing attention ──
  const neglectedClientsList = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    const clientLastVisit: Record<string, Date> = {};
    for (const v of data.visits) {
      if (!v.client_id) continue;
      const d = new Date(v.visit_date);
      if (!clientLastVisit[v.client_id] || d > clientLastVisit[v.client_id]) {
        clientLastVisit[v.client_id] = d;
      }
    }

    return Object.entries(clientLastVisit)
      .filter(([, lastDate]) => lastDate < cutoff)
      .map(([clientId, lastDate]) => ({
        id: clientId,
        name: getClientName(clientId),
        lastVisit: lastDate,
        daysAgo: daysSince(lastDate.toISOString()),
      }))
      .sort((a, b) => b.daysAgo - a.daysAgo)
      .slice(0, 5);
  }, [data.visits, data.clients]);

  // ── Recent Activity ──
  const recentActivity = useMemo(() => {
    const items: { type: 'visit' | 'task' | 'report'; icon: string; label: string; detail: string; date: Date; onClick: () => void }[] = [];

    for (const v of data.visits.slice(0, 15)) {
      const clientName = v.client?.name || getClientName(v.client_id);
      const companies = getDisplayReports(v.reports)
        .map((r: any) => r.company?.name || getCompanyName(r.company_id))
        .filter((n: string, i: number, a: string[]) => n !== '-' && a.indexOf(n) === i);

      items.push({
        type: 'visit',
        icon: 'visit',
        label: `Visit registered — ${clientName}`,
        detail: companies.length > 0 ? companies.join(', ') : '',
        date: new Date(v.visit_date),
        onClick: () => navigate(`/visits/${v.id}`),
      });
    }

    for (const t of data.todos.slice(0, 10)) {
      const isDone = t.status === 'done' || t.status === 'completed';
      items.push({
        type: 'task',
        icon: isDone ? 'done' : 'task',
        label: isDone ? `Task completed — ${t.title}` : `Task created — ${t.title}`,
        detail: getClientName(t.client_id),
        date: new Date(t.updated_at || t.created_at || Date.now()),
        onClick: () => navigate('/tasks'),
      });
    }

    return items
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);
  }, [data, navigate]);

  if (isLoading) {
    return <div className="dashboard"><p className="dashboard-loading">Loading...</p></div>;
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <div className="dash-header">
        <div className="dash-header-left">
          <h1>Welcome back, {user?.name?.split(' ')[0]}</h1>
          <p className="dash-header-subtitle">Here's what needs your attention today</p>
        </div>
        <button className="dash-btn-primary" onClick={() => navigate('/visits/new')}>
          + Register New Visit
        </button>
      </div>

      {/* KPI Cards */}
      <div className="dash-kpi-row">
        <div className="dash-kpi" onClick={() => navigate('/visits')}>
          <div className="dash-kpi-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="dash-kpi-body">
            <div className="dash-kpi-value">{kpis.visitsThisMonth}</div>
            <div className="dash-kpi-label">Client Meetings This Month</div>
          </div>
        </div>

        <div className="dash-kpi" onClick={() => navigate('/visits')}>
          <div className="dash-kpi-icon orange">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" y1="18" x2="12" y2="12" /><line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          </div>
          <div className="dash-kpi-body">
            <div className={`dash-kpi-value${kpis.reportsPending > 0 ? ' alert' : ''}`}>{kpis.reportsPending}</div>
            <div className="dash-kpi-label">Reports Pending</div>
          </div>
        </div>

        <div className="dash-kpi" onClick={() => navigate('/tasks')}>
          <div className="dash-kpi-icon red">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          </div>
          <div className="dash-kpi-body">
            <div className={`dash-kpi-value${kpis.openFollowups > 0 ? ' alert' : ''}`}>{kpis.openFollowups}</div>
            <div className="dash-kpi-label">Open Follow-ups</div>
          </div>
        </div>

        <div className="dash-kpi" onClick={() => navigate('/contacts')}>
          <div className="dash-kpi-icon gray">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <div className="dash-kpi-body">
            <div className="dash-kpi-value">{kpis.neglectedClients}</div>
            <div className="dash-kpi-label">Not Visited (60d)</div>
          </div>
        </div>
      </div>

      {/* Task Due Today + Overdue */}
      <div className="dash-task-kpi-row">
        {/* Due Today */}
        <div className="dash-task-kpi-card today">
          <div className="dash-task-kpi-header">
            <div className="dash-task-kpi-icon today">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div>
              <div className="dash-task-kpi-count today">{kpis.tasksDueToday.length}</div>
              <div className="dash-task-kpi-label">Due Today</div>
            </div>
          </div>
          {kpis.tasksDueToday.length === 0 ? (
            <div className="dash-task-kpi-empty">No tasks due today</div>
          ) : (
            <ul className="dash-task-kpi-list">
              {kpis.tasksDueToday.map((t: any) => (
                <li key={t.id} className="dash-task-kpi-item" onClick={() => navigate(`/tasks?highlight=${t.id}`)} style={{ cursor: 'pointer' }}>
                  <span className="dash-task-kpi-dot today" />
                  <div className="dash-task-kpi-body">
                    <span className="dash-task-kpi-title">{t.title}</span>
                    <div className="dash-task-kpi-meta-row">
                      {(t.client?.name || getClientName(t.client_id)) !== '-' && <span className="dash-task-kpi-meta-tag client">{t.client?.name || getClientName(t.client_id)}</span>}
                      {(t.company?.name || getCompanyName(t.company_id)) !== '-' && <span className="dash-task-kpi-meta-tag company">{t.company?.name || getCompanyName(t.company_id)}</span>}
                    </div>
                  </div>
                  {t.assigned_to_user?.name && (
                    <span className="dash-task-kpi-assignee">→ {t.assigned_to_user.name}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Overdue */}
        <div className="dash-task-kpi-card overdue">
          <div className="dash-task-kpi-header">
            <div className="dash-task-kpi-icon overdue">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
            <div>
              <div className="dash-task-kpi-count overdue">{kpis.tasksOverdue.length}</div>
              <div className="dash-task-kpi-label">Overdue Tasks</div>
            </div>
          </div>
          {kpis.tasksOverdue.length === 0 ? (
            <div className="dash-task-kpi-empty">No overdue tasks</div>
          ) : (
            <ul className="dash-task-kpi-list">
              {kpis.tasksOverdue.map((t: any) => (
                <li key={t.id} className="dash-task-kpi-item" onClick={() => navigate(`/tasks?highlight=${t.id}`)} style={{ cursor: 'pointer' }}>
                  <span className="dash-task-kpi-dot overdue" />
                  <div className="dash-task-kpi-body">
                    <span className="dash-task-kpi-title">{t.title}</span>
                    <div className="dash-task-kpi-meta-row">
                      {(t.client?.name || getClientName(t.client_id)) !== '-' && <span className="dash-task-kpi-meta-tag client">{t.client?.name || getClientName(t.client_id)}</span>}
                      {(t.company?.name || getCompanyName(t.company_id)) !== '-' && <span className="dash-task-kpi-meta-tag company">{t.company?.name || getCompanyName(t.company_id)}</span>}
                    </div>
                  </div>
                  {t.assigned_to_user?.name && (
                    <span className="dash-task-kpi-assignee">→ {t.assigned_to_user.name}</span>
                  )}
                  <span className="dash-task-kpi-date">{formatDate(t.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Two-column: Today's Visits + Recent Client Meetings */}
      <div className="dash-columns">
        {/* Today's Visits */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Today's Visits</h3>
            <div className="dash-today-actions">
              <button className="dash-add-btn" onClick={() => navigate('/visits/new')} title="New client visit">+ Client</button>
              <button className="dash-add-btn supplier" onClick={() => navigate('/company-visits/new')} title="New supplier visit">+ Supplier</button>
            </div>
          </div>

          {/* Client Visits */}
          <div className="dash-today-section">
            <div className="dash-today-section-label">
              <span className="dash-today-dot client" />
              Clients ({todaysVisits.clientVisits.length})
            </div>
            {todaysVisits.clientVisits.length === 0 ? (
              <p className="dash-empty-small">No client visits today</p>
            ) : (
              <div className="dash-list">
                {todaysVisits.clientVisits.map(v => {
                  const clientName = v.client?.name || getClientName(v.client_id);
                  const visitorName = v.visited_by_user?.name || getUserName(v.visited_by_user_id);
                  const companies = getDisplayReports(v.reports)
                    .map((r: any) => r.company?.name || getCompanyName(r.company_id))
                    .filter((n: string, i: number, a: string[]) => n !== '-' && a.indexOf(n) === i);
                  const hasReport = getDisplayReports(v.reports).length > 0;
                  const meta = decodeMetadata(v.reports || []);
                  return (
                    <div key={v.id} className="dash-visit-item" onClick={() => navigate(`/visits/${v.id}`)}>
                      <div className="dash-visit-main">
                        <div className="dash-visit-client">{clientName}</div>
                        {companies.length > 0 && <div className="dash-visit-companies">{companies.join(' · ')}</div>}
                        {meta?.purpose && <div className="dash-visit-purpose">{meta.purpose}</div>}
                      </div>
                      <div className="dash-visit-meta">
                        <div className="dash-visit-visitor">
                          <span className="dash-avatar">{getInitials(visitorName)}</span>
                          <span className="dash-visitor-name">{visitorName}</span>
                        </div>
                        <div className="dash-visit-info">
                          <span className={`dash-report-badge ${hasReport ? 'ready' : 'missing'}`}>{hasReport ? 'Report' : 'No report'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Supplier Visits */}
          <div className="dash-today-section">
            <div className="dash-today-section-label">
              <span className="dash-today-dot supplier" />
              Suppliers ({todaysVisits.supplierVisits.length})
            </div>
            {todaysVisits.supplierVisits.length === 0 ? (
              <p className="dash-empty-small">No supplier visits today</p>
            ) : (
              <div className="dash-list">
                {todaysVisits.supplierVisits.map(v => {
                  const companyName = v.company?.name || getCompanyName(v.companyId || v.company_id);
                  const participants = (v.participants || []).map((p: any) => p.user?.name || getUserName(p.userId || p.user_id)).filter(Boolean);
                  return (
                    <div key={v.id} className="dash-visit-item" onClick={() => navigate(`/company-visits/${v.id}`)}>
                      <div className="dash-visit-main">
                        <div className="dash-visit-client">{companyName}</div>
                        {v.subject && <div className="dash-visit-purpose">{v.subject}</div>}
                      </div>
                      <div className="dash-visit-meta">
                        {participants.length > 0 && (
                          <div className="dash-visit-visitor">
                            <span className="dash-avatar">{getInitials(participants[0])}</span>
                            <span className="dash-visitor-name">{participants[0]}</span>
                          </div>
                        )}
                        <div className="dash-visit-info">
                          <span className={`dash-report-badge ${v.report ? 'ready' : 'missing'}`}>{v.report ? 'Report' : 'No report'}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Recent Client Meetings */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Recent Client Meetings</h3>
            <button className="dash-link" onClick={() => navigate('/visits')}>View all</button>
          </div>
          {recentVisits.length === 0 ? (
            <p className="dash-empty">No recent visits found</p>
          ) : (
            <div className="dash-list">
              {recentVisits.map(v => {
                const clientName = v.client?.name || getClientName(v.client_id);
                const visitorName = v.visited_by_user?.name || getUserName(v.visited_by_user_id);
                const companies = getDisplayReports(v.reports)
                  .map((r: any) => r.company?.name || getCompanyName(r.company_id))
                  .filter((n: string, i: number, a: string[]) => n !== '-' && a.indexOf(n) === i);
                const hasReport = getDisplayReports(v.reports).length > 0;
                const meta = decodeMetadata(v.reports || []);

                return (
                  <div key={v.id} className="dash-visit-item" onClick={() => navigate(`/visits/${v.id}`)}>
                    <div className="dash-visit-main">
                      <div className="dash-visit-client">{clientName}</div>
                      {companies.length > 0 && (
                        <div className="dash-visit-companies">{companies.join(' · ')}</div>
                      )}
                      {meta?.purpose && (
                        <div className="dash-visit-purpose">{meta.purpose}</div>
                      )}
                    </div>
                    <div className="dash-visit-meta">
                      <div className="dash-visit-visitor">
                        <span className="dash-avatar">{getInitials(visitorName)}</span>
                        <span className="dash-visitor-name">{visitorName}</span>
                      </div>
                      <div className="dash-visit-info">
                        <span className={`dash-report-badge ${hasReport ? 'ready' : 'missing'}`}>
                          {hasReport ? 'Report' : 'No report'}
                        </span>
                        <span className="dash-visit-date">{formatDate(v.visit_date)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Recent Activity</h3>
          </div>
          <div className="dash-list">
            {recentActivity.map((item, i) => (
              <div key={i} className="dash-activity-item" onClick={item.onClick}>
                <div className={`dash-activity-icon ${item.icon}`}>
                  {item.icon === 'visit' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  )}
                  {item.icon === 'task' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  )}
                  {item.icon === 'done' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                  )}
                </div>
                <div className="dash-activity-content">
                  <div className="dash-activity-label">{item.label}</div>
                  {item.detail && <div className="dash-activity-detail">{item.detail}</div>}
                </div>
                <div className="dash-activity-date">{item.date.toLocaleDateString('it-IT')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
