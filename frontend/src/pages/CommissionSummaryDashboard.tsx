import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import '../styles/CommissionSummaryDashboard.css';

interface CommissionStats {
  total_gross: number;
  total_net: number;
  by_company: Array<{
    company_id: string;
    company_name: string;
    total_gross: number;
    total_net: number;
  }>;
  by_country: Array<{
    country: string;
    total_gross: number;
    total_net: number;
  }>;
}

interface InvoiceStats {
  grand_total: number;
  revenue_by_company: Array<{
    company_id: string;
    company_name: string;
    total: number;
  }>;
  revenue_by_country: Array<{
    country: string;
    total: number;
  }>;
}

interface ExpenseAllocationData {
  total_expenses: number;
  total_allocated_expense: number;
  by_company: Array<{
    company_id: string;
    company_name: string;
    total_commission: number;
    allocated_expense: number;
  }>;
  by_country: Array<{
    country: string;
    total_commission: number;
    allocated_expense: number;
  }>;
}

export const CommissionSummaryDashboard: React.FC = () => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [status, setStatus] = useState<string>('');

  const [commissionStats, setCommissionStats] = useState<CommissionStats | null>(null);
  const [invoiceStats, setInvoiceStats] = useState<InvoiceStats | null>(null);
  const [expenseAllocation, setExpenseAllocation] = useState<ExpenseAllocationData | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const loadData = async () => {
    setLoading(true);
    setError('');

    try {
      const filters: any = {};
      if (startDate) filters.start_date = startDate;
      if (endDate) filters.end_date = endDate;
      if (status) filters.status = status;

      // Fetch commission stats
      const commStatsRes = await apiService.getCommissionStats(filters);
      setCommissionStats(commStatsRes?.data || null);

      // Fetch invoice stats
      const invStatsRes = await apiService.getInvoiceStats(filters);
      setInvoiceStats(invStatsRes?.data || null);

      // Fetch expense allocation
      const expenseRes = await apiService.getExpenseAllocation(filters);
      setExpenseAllocation(expenseRes?.data || null);

      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Errore nel caricamento dei dati. Riprova più tardi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [startDate, endDate, status]);

  const KPICard: React.FC<{ value: number; label: string }> = ({ value, label }) => (
    <div className="summary-kpi-card">
      <div className="summary-kpi-value">{formatCurrency(value)}</div>
      <div className="summary-kpi-label">{label}</div>
    </div>
  );

  const totalFatturato = invoiceStats?.grand_total || 0;
  const totalProvvigioniLorde = commissionStats?.total_gross || 0;
  const totalExpenses = expenseAllocation?.total_allocated_expense || 0;
  const totalProvvigioniNette = totalProvvigioniLorde - totalExpenses;
  const saldo = totalFatturato - totalProvvigioniNette;

  return (
    <div className="summary-container">
      {/* Header with timestamp */}
      <div className="summary-header">
        <div className="summary-timestamp">
          Generato il: <strong>{lastUpdated.toLocaleString('it-IT')}</strong>
        </div>
      </div>

      {/* Filters */}
      <div className="summary-filters">
        <div className="filter-group">
          <label>Data Inizio:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Data Fine:</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="filter-group">
          <label>Stato:</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tutti gli stati</option>
            <option value="aggiunta">Aggiunta</option>
            <option value="controllata">Controllata</option>
            <option value="fatturata">Fatturata</option>
            <option value="pagata">Pagata</option>
            <option value="pagati_subagenti">Pagati Subagenti</option>
          </select>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
      {loading && <div className="loading-message">Caricamento dati...</div>}

      {!loading && commissionStats && invoiceStats && (
        <>
          {/* Totals Row */}
          <h2 className="summary-section-title">Riepilogo Totale</h2>
          <div className="summary-kpi-row">
            <KPICard value={totalFatturato} label="Fatturato Totale" />
            <KPICard value={totalProvvigioniLorde} label="Provvigioni Lorde" />
            <KPICard value={totalProvvigioniNette} label="Provvigioni Nette" />
            <KPICard value={saldo} label="Saldo" />
          </div>

          {/* By Company */}
          {commissionStats.by_company && commissionStats.by_company.length > 0 && (
            <>
              <h2 className="summary-section-title">Per Azienda</h2>
              {commissionStats.by_company.map((company) => {
                const companyFatturato =
                  invoiceStats.revenue_by_company?.find(
                    (c) => c.company_id === company.company_id
                  )?.total || 0;
                const companyExpense =
                  expenseAllocation?.by_company?.find(
                    (c) => c.company_id === company.company_id
                  )?.allocated_expense || 0;
                const companyNetCommission = company.total_gross - companyExpense;
                const companySaldo = companyFatturato - companyNetCommission;

                return (
                  <div key={company.company_id}>
                    <h3 className="summary-section-subtitle">{company.company_name}</h3>
                    <div className="summary-kpi-row">
                      <KPICard value={companyFatturato} label="Fatturato" />
                      <KPICard value={company.total_gross} label="Provvigioni Lorde" />
                      <KPICard value={companyNetCommission} label="Provvigioni Nette" />
                      <KPICard value={companySaldo} label="Saldo" />
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* By Country */}
          {commissionStats.by_country && commissionStats.by_country.length > 0 && (
            <>
              <h2 className="summary-section-title">Per Nazione</h2>
              {commissionStats.by_country.map((country) => {
                const countryFatturato =
                  invoiceStats.revenue_by_country?.find(
                    (c) => c.country === country.country
                  )?.total || 0;
                const countryExpense =
                  expenseAllocation?.by_country?.find(
                    (c) => c.country === country.country
                  )?.allocated_expense || 0;
                const countryNetCommission = country.total_gross - countryExpense;
                const countrySaldo = countryFatturato - countryNetCommission;

                return (
                  <div key={country.country}>
                    <h3 className="summary-section-subtitle">{country.country}</h3>
                    <div className="summary-kpi-row">
                      <KPICard value={countryFatturato} label="Fatturato" />
                      <KPICard value={country.total_gross} label="Provvigioni Lorde" />
                      <KPICard value={countryNetCommission} label="Provvigioni Nette" />
                      <KPICard value={countrySaldo} label="Saldo" />
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default CommissionSummaryDashboard;
