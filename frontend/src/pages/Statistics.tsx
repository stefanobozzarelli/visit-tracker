import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/Statistics.css';
import { apiService } from '../services/api';

export const Statistics: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Default date range: last 30 days
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiService.getStatistics({ startDate, endDate });
      if (res.success) setData(res.data || []);
      else setError(res.error || 'Error loading statistics');
    } catch (e) {
      setError('Error loading statistics');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  // Format currency
  const fmtCurrency = (val: number) => val ? `\u20AC ${Number(val).toLocaleString('it-IT', { minimumFractionDigits: 0 })}` : '-';

  // Format date
  const fmtDate = (val: string) => {
    if (!val) return '-';
    try { return new Date(val).toLocaleDateString('it-IT'); } catch { return '-'; }
  };

  // Completion rate color
  const rateColor = (rate: number) => {
    if (rate >= 70) return '#4A7653';
    if (rate >= 40) return '#B09840';
    return '#9B3B3B';
  };

  return (
    <div className="stats-page">
      <div className="stats-header">
        <h1>Statistics</h1>
        <p className="stats-subtitle">Per-user activity statistics</p>
      </div>

      <div className="stats-filters">
        <div className="stats-filter-group">
          <label>Start Date</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>
        <div className="stats-filter-group">
          <label>End Date</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
        </div>
        <button className="stats-apply-btn" onClick={loadData}>Apply Filters</button>
      </div>

      {error && <div className="stats-error">{error}</div>}

      <div className="stats-summary">{data.length} users</div>

      {loading ? (
        <p style={{ textAlign: 'center', padding: '2rem' }}>Loading...</p>
      ) : (
        <div className="stats-table-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th className="stats-col-name">User</th>
                <th className="stats-col-num">Visits</th>
                <th className="stats-col-num">Reports</th>
                <th className="stats-col-num">Tasks Created</th>
                <th className="stats-col-num">Tasks Assigned</th>
                <th className="stats-col-num">Completion %</th>
                <th className="stats-col-num">Offers</th>
                <th className="stats-col-num">Offer Value</th>
                <th className="stats-col-num">Orders</th>
                <th className="stats-col-num">Order Value</th>
                <th className="stats-col-num">Claims</th>
                <th className="stats-col-num">Company Visits</th>
                <th className="stats-col-num">Showrooms</th>
                <th className="stats-col-num">Files</th>
                <th className="stats-col-num">Logins</th>
                <th>Last Login</th>
              </tr>
            </thead>
            <tbody>
              {data.map((u: any) => {
                const completionRate = u.tasks_assigned > 0
                  ? Math.round((u.tasks_completed / u.tasks_assigned) * 100)
                  : 0;
                return (
                  <tr key={u.id}>
                    <td>
                      <span className="stats-user-name">{u.name}</span>
                      <span className="stats-role-badge">{u.role}</span>
                    </td>
                    <td className="stats-col-num">{u.visits_count || 0}</td>
                    <td className="stats-col-num">{u.reports_count || 0}</td>
                    <td className="stats-col-num">{u.tasks_created || 0}</td>
                    <td className="stats-col-num">{u.tasks_assigned || 0}</td>
                    <td className="stats-col-num">
                      <span style={{ color: rateColor(completionRate), fontWeight: 600 }}>
                        {u.tasks_assigned > 0 ? `${completionRate}%` : '-'}
                      </span>
                    </td>
                    <td className="stats-col-num">{u.offers_count || 0}</td>
                    <td className="stats-col-num">{fmtCurrency(u.offers_total_value)}</td>
                    <td className="stats-col-num">{u.orders_count || 0}</td>
                    <td className="stats-col-num">{fmtCurrency(u.orders_total_value)}</td>
                    <td className="stats-col-num">{u.claims_count || 0}</td>
                    <td className="stats-col-num">{u.company_visits_count || 0}</td>
                    <td className="stats-col-num">{u.showrooms_count || 0}</td>
                    <td className="stats-col-num">{u.files_uploaded || 0}</td>
                    <td className="stats-col-num">{u.login_count || 0}</td>
                    <td>{fmtDate(u.last_login)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Statistics;
