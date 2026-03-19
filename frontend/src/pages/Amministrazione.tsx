import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { InvoicesTab, StatisticsTab, AssistantTab } from './Revenue';
import { CommissionDashboard } from './CommissionDashboard';
import { CommissionRates } from './CommissionRates';
import { SubAgents } from './SubAgents';
import { CommissionInvoices } from './CommissionInvoices';
import '../styles/Revenue.css';
import '../styles/Amministrazione.css';

type TopTab = 'fatturato' | 'provvigioni';
type RevenueSubTab = 'invoices' | 'statistics' | 'assistant';
type CommissionSubTab = 'dashboard' | 'aziende' | 'subagenti' | 'fatture';

const canAccess = (user: any) =>
  user?.role === 'master_admin' || (user?.role === 'admin' && user?.can_view_revenue);

export const Amministrazione: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Derive top tab from URL path
  const pathSegment = location.pathname.split('/')[2] || 'fatturato';
  const initialTopTab: TopTab = pathSegment === 'provvigioni' ? 'provvigioni' : 'fatturato';

  const [topTab, setTopTab] = useState<TopTab>(initialTopTab);
  const [revenueSubTab, setRevenueSubTab] = useState<RevenueSubTab>('invoices');
  const [commissionSubTab, setCommissionSubTab] = useState<CommissionSubTab>('dashboard');

  useEffect(() => {
    if (user && !canAccess(user)) navigate('/dashboard');
  }, [user, navigate]);

  useEffect(() => {
    const seg = location.pathname.split('/')[2] || 'fatturato';
    if (seg === 'provvigioni' && topTab !== 'provvigioni') setTopTab('provvigioni');
    else if (seg !== 'provvigioni' && topTab !== 'fatturato') setTopTab('fatturato');
  }, [location.pathname]);

  const handleTopTabChange = (tab: TopTab) => {
    setTopTab(tab);
    navigate(`/amministrazione/${tab}`);
  };

  if (!user || !canAccess(user)) return null;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Amministrazione</h1>
          <p className="admin-subtitle">Gestisci fatturato, provvigioni e subagenti</p>
        </div>
      </div>

      {/* Top-level tabs */}
      <div className="admin-top-tabs">
        <button
          className={`admin-top-tab ${topTab === 'fatturato' ? 'active' : ''}`}
          onClick={() => handleTopTabChange('fatturato')}
        >
          Fatturato
        </button>
        <button
          className={`admin-top-tab ${topTab === 'provvigioni' ? 'active' : ''}`}
          onClick={() => handleTopTabChange('provvigioni')}
        >
          Provvigioni
        </button>
      </div>

      {/* Fatturato section */}
      {topTab === 'fatturato' && (
        <>
          <div className="revenue-tabs">
            {([
              { key: 'invoices' as RevenueSubTab, label: 'Fatture' },
              { key: 'statistics' as RevenueSubTab, label: 'Statistiche' },
              { key: 'assistant' as RevenueSubTab, label: 'Assistente AI' },
            ]).map(tab => (
              <button
                key={tab.key}
                className={`revenue-tab ${revenueSubTab === tab.key ? 'active' : ''}`}
                onClick={() => setRevenueSubTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {revenueSubTab === 'invoices' && <InvoicesTab />}
          {revenueSubTab === 'statistics' && <StatisticsTab />}
          {revenueSubTab === 'assistant' && <AssistantTab />}
        </>
      )}

      {/* Provvigioni section */}
      {topTab === 'provvigioni' && (
        <>
          <div className="admin-sub-tabs">
            {([
              { key: 'dashboard' as CommissionSubTab, label: 'Dashboard' },
              { key: 'aziende' as CommissionSubTab, label: 'Aziende' },
              { key: 'subagenti' as CommissionSubTab, label: 'Subagenti' },
              { key: 'fatture' as CommissionSubTab, label: 'Fatture' },
            ]).map(tab => (
              <button
                key={tab.key}
                className={`admin-sub-tab ${commissionSubTab === tab.key ? 'active' : ''}`}
                onClick={() => setCommissionSubTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {commissionSubTab === 'dashboard' && <CommissionDashboard />}
          {commissionSubTab === 'aziende' && <CommissionRates />}
          {commissionSubTab === 'subagenti' && <SubAgents />}
          {commissionSubTab === 'fatture' && <CommissionInvoices />}
        </>
      )}
    </div>
  );
};

export default Amministrazione;
