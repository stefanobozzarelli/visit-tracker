import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import '../styles/Dashboard.css';

interface DashboardData {
  visits: any[];
  todos: any[];
  companies: any[];
  clients: any[];
}

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData>({ visits: [], todos: [], companies: [], clients: [] });
  const [isLoading, setIsLoading] = useState(true);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const results: DashboardData = { visits: [], todos: [], companies: [], clients: [] };

      try {
        const res = await apiService.getVisits(isAdmin ? undefined : { user_id: user?.id });
        if (res.success && res.data) results.visits = res.data;
      } catch (e) { /* offline graceful */ }

      try {
        const res = isAdmin ? await apiService.getTodos() : await apiService.getMyTodos();
        if (res.success && res.data) results.todos = Array.isArray(res.data) ? res.data : [];
      } catch (e) { /* offline graceful */ }

      try {
        const res = await apiService.getCompanies();
        if (res.success && res.data) results.companies = res.data;
      } catch (e) { /* offline graceful */ }

      try {
        const res = await apiService.getClients();
        if (res.success && res.data) results.clients = res.data;
      } catch (e) { /* offline graceful */ }

      setData(results);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Computed KPIs ────────────────────────────────
  const kpis = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const visitsThisMonth = data.visits.filter(v => {
      const d = new Date(v.visit_date);
      return d >= startOfMonth;
    }).length;

    const openTodos = data.todos.filter(t =>
      t.status !== 'done' && t.status !== 'completed'
    ).length;

    const overdueTodos = data.todos.filter(t => {
      if (t.status === 'done' || t.status === 'completed') return false;
      if (!t.due_date) return false;
      return new Date(t.due_date) < today;
    }).length;

    const totalCompanies = data.companies.length;

    return { visitsThisMonth, openTodos, overdueTodos, totalCompanies };
  }, [data]);

  // ─── Upcoming Visits (next 7 days) ───────────────
  const upcomingVisits = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekFromNow = new Date(today.getTime() + 7 * 86400000);

    return data.visits
      .filter(v => {
        const d = new Date(v.visit_date);
        return d >= today && d <= weekFromNow;
      })
      .sort((a, b) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime())
      .slice(0, 5);
  }, [data.visits]);

  // ─── Overdue Tasks ───────────────────────────────
  const overdueTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return data.todos
      .filter(t => {
        if (t.status === 'done' || t.status === 'completed') return false;
        if (!t.due_date) return false;
        return new Date(t.due_date) < today;
      })
      .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
      .slice(0, 5);
  }, [data.todos]);

  // ─── Companies needing attention (no visit in 60+ days) ─
  const neglectedCompanies = useMemo(() => {
    if (data.companies.length === 0) return [];

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 60);

    // Build map: company_id → latest visit_date
    const companyLastVisit: Record<string, Date> = {};
    for (const v of data.visits) {
      if (!v.company_id) continue;
      const d = new Date(v.visit_date);
      if (!companyLastVisit[v.company_id] || d > companyLastVisit[v.company_id]) {
        companyLastVisit[v.company_id] = d;
      }
    }

    return data.companies
      .filter(c => {
        const lastVisit = companyLastVisit[c.id];
        return !lastVisit || lastVisit < cutoff;
      })
      .slice(0, 5);
  }, [data.companies, data.visits]);

  // ─── Recent Activity ─────────────────────────────
  const recentActivity = useMemo(() => {
    const items: { type: string; label: string; date: Date; onClick: () => void }[] = [];

    for (const v of data.visits.slice(0, 20)) {
      items.push({
        type: 'visit',
        label: `Visit: ${v.client?.name || 'Unknown'} — ${v.company?.name || ''}`,
        date: new Date(v.visit_date),
        onClick: () => navigate(`/visits/${v.id}`),
      });
    }

    for (const t of data.todos.slice(0, 20)) {
      items.push({
        type: 'task',
        label: `Task: ${t.title}`,
        date: new Date(t.created_at || t.due_date || Date.now()),
        onClick: () => navigate('/tasks'),
      });
    }

    return items
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);
  }, [data.visits, data.todos, navigate]);

  const getClientName = (id: string) => data.clients.find(c => c.id === id)?.name || id;

  if (isLoading) {
    return <div className="dashboard"><p className="dashboard-loading">Loading...</p></div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">Welcome back, {user?.name}</p>
        </div>
        <button className="dash-btn-primary" onClick={() => navigate('/visits/new')}>
          + New Visit
        </button>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="kpi-card" onClick={() => navigate('/visits')}>
          <div className="kpi-icon kpi-blue">📅</div>
          <div className="kpi-body">
            <div className="kpi-value">{kpis.visitsThisMonth}</div>
            <div className="kpi-label">Visits this month</div>
          </div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/tasks')}>
          <div className="kpi-icon kpi-orange">✅</div>
          <div className="kpi-body">
            <div className="kpi-value">{kpis.openTodos}</div>
            <div className="kpi-label">Open tasks</div>
          </div>
        </div>
        <div className="kpi-card kpi-alert" onClick={() => navigate('/tasks')}>
          <div className="kpi-icon kpi-red">⚠️</div>
          <div className="kpi-body">
            <div className="kpi-value">{kpis.overdueTodos}</div>
            <div className="kpi-label">Overdue tasks</div>
          </div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/companies')}>
          <div className="kpi-icon kpi-green">🏢</div>
          <div className="kpi-body">
            <div className="kpi-value">{kpis.totalCompanies}</div>
            <div className="kpi-label">Companies</div>
          </div>
        </div>
      </div>

      {/* Two-column section */}
      <div className="dashboard-columns">
        {/* Left: Upcoming Visits */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Upcoming Visits</h3>
            <button className="dash-link" onClick={() => navigate('/visits')}>View all</button>
          </div>
          {upcomingVisits.length === 0 ? (
            <p className="dash-empty">No upcoming visits in the next 7 days</p>
          ) : (
            <div className="dash-list">
              {upcomingVisits.map(v => (
                <div key={v.id} className="dash-list-item" onClick={() => navigate(`/visits/${v.id}`)}>
                  <div className="dash-list-main">
                    <div className="dash-list-title">{v.client?.name || 'Unknown'}</div>
                    <div className="dash-list-sub">{v.company?.name || ''}</div>
                  </div>
                  <div className="dash-list-date">{new Date(v.visit_date).toLocaleDateString('it-IT')}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Overdue Tasks */}
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Overdue Tasks</h3>
            <button className="dash-link" onClick={() => navigate('/tasks')}>View all</button>
          </div>
          {overdueTasks.length === 0 ? (
            <p className="dash-empty">No overdue tasks</p>
          ) : (
            <div className="dash-list">
              {overdueTasks.map(t => (
                <div key={t.id} className="dash-list-item" onClick={() => navigate('/tasks')}>
                  <div className="dash-list-main">
                    <div className="dash-list-title">{t.title}</div>
                    <div className="dash-list-sub">{getClientName(t.client_id)}</div>
                  </div>
                  <div className="dash-list-date dash-overdue">
                    {t.due_date ? new Date(t.due_date).toLocaleDateString('it-IT') : '-'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Companies needing attention */}
      {neglectedCompanies.length > 0 && (
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Companies needing attention</h3>
            <button className="dash-link" onClick={() => navigate('/companies')}>View all</button>
          </div>
          <p className="dash-card-hint">No visit in 60+ days</p>
          <div className="dash-chips">
            {neglectedCompanies.map(c => (
              <span key={c.id} className="dash-chip">{c.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Recent Activity</h3>
          </div>
          <div className="dash-list">
            {recentActivity.map((item, i) => (
              <div key={i} className="dash-list-item" onClick={item.onClick}>
                <div className="dash-list-main">
                  <span className={`dash-activity-type ${item.type}`}>
                    {item.type === 'visit' ? '📅' : '✅'}
                  </span>
                  <div className="dash-list-title">{item.label}</div>
                </div>
                <div className="dash-list-date">{item.date.toLocaleDateString('it-IT')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
