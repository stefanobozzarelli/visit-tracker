import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import '../styles/Revenue.css';

type Tab = 'invoices' | 'statistics' | 'assistant';

interface InvoiceItem {
  id: string;
  company_id: string;
  client_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  total_amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'processed' | 'error';
  original_filename: string;
  file_size: number;
  error_message?: string;
  created_at: string;
  company?: { id: string; name: string };
  client?: { id: string; name: string };
  uploaded_by_user?: { id: string; name: string };
  items?: LineItem[];
}

interface LineItem {
  id: string;
  line_number: number;
  article_code?: string;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  discount_percent?: number;
  line_total: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const Revenue: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>('invoices');

  useEffect(() => {
    if (user && user.role !== 'admin') navigate('/dashboard');
  }, [user, navigate]);

  if (!user || user.role !== 'admin') return null;

  return (
    <div className="revenue-page">
      <div className="revenue-header">
        <div>
          <h1 className="revenue-title">Revenue</h1>
          <p className="revenue-subtitle">Manage invoices, analyze revenue, and get AI-powered insights</p>
        </div>
      </div>

      <div className="revenue-tabs">
        {(['invoices', 'statistics', 'assistant'] as Tab[]).map(tab => (
          <button
            key={tab}
            className={`revenue-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'invoices' ? 'Invoices' : tab === 'statistics' ? 'Statistics' : 'AI Assistant'}
          </button>
        ))}
      </div>

      {activeTab === 'invoices' && <InvoicesTab />}
      {activeTab === 'statistics' && <StatisticsTab />}
      {activeTab === 'assistant' && <AssistantTab />}
    </div>
  );
};

/* ============================================================
   INVOICES TAB
   ============================================================ */
const InvoicesTab: React.FC = () => {
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<InvoiceItem | null>(null);

  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCompanyId, setUploadCompanyId] = useState('');
  const [uploadClientId, setUploadClientId] = useState('');

  // Filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, compRes, cliRes] = await Promise.all([
        apiService.getInvoices({ company_id: filterCompany || undefined, client_id: filterClient || undefined, status: filterStatus || undefined }),
        apiService.getCompanies(),
        apiService.getClients(),
      ]);
      setInvoices(invRes.data?.invoices || []);
      setCompanies(compRes.data || []);
      setClients(cliRes.data || []);
    } catch (err) {
      console.error('Error loading invoices:', err);
    }
    setLoading(false);
  }, [filterCompany, filterClient, filterStatus]);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh processing invoices
  useEffect(() => {
    const hasProcessing = invoices.some(i => i.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [invoices, loadData]);

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedInvoice(null);
      return;
    }
    setExpandedId(id);
    try {
      const res = await apiService.getInvoice(id);
      setExpandedInvoice(res.data);
    } catch (err) {
      console.error('Error loading invoice detail:', err);
    }
  };

  const handleUpload = async (files: FileList) => {
    if (!uploadCompanyId) { alert('Please select a company first'); return; }
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        await apiService.uploadInvoice(file, uploadCompanyId, uploadClientId || undefined);
      } catch (err) {
        console.error('Upload error:', err);
      }
    }
    setUploading(false);
    await loadData();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this invoice and all extracted data?')) return;
    try {
      await apiService.deleteInvoice(id);
      await loadData();
    } catch (err) { console.error(err); }
  };

  const handleReprocess = async (id: string) => {
    try {
      await apiService.reprocessInvoice(id);
      await loadData();
    } catch (err) { console.error(err); }
  };

  const handleDownload = async (id: string) => {
    try {
      const res = await apiService.getInvoiceDownloadUrl(id);
      if (res.data?.url) window.open(res.data.url, '_blank');
    } catch (err) { console.error(err); }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

  const formatDate = (date?: string) => {
    if (!date) return '–';
    return new Date(date).toLocaleDateString('it-IT');
  };

  const statusConf = (s: string) => {
    switch (s) {
      case 'processed': return { label: 'Processed', cls: 'status-processed' };
      case 'processing': return { label: 'Processing...', cls: 'status-processing' };
      case 'error': return { label: 'Error', cls: 'status-error' };
      default: return { label: 'Pending', cls: 'status-pending' };
    }
  };

  return (
    <div className="revenue-tab-content">
      {/* Upload Section */}
      <div className="revenue-card">
        <h3 className="card-section-title">Upload Invoice</h3>
        <div className="upload-controls">
          <div className="upload-selectors">
            <select value={uploadCompanyId} onChange={e => setUploadCompanyId(e.target.value)}>
              <option value="">Select Company *</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={uploadClientId} onChange={e => setUploadClientId(e.target.value)}>
              <option value="">Select Client (optional)</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div
            className={`upload-zone ${isDragging ? 'dragging' : ''} ${!uploadCompanyId ? 'disabled' : ''}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files); }}
          >
            <input
              type="file"
              accept=".pdf"
              multiple
              id="invoice-upload"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) handleUpload(e.target.files); e.target.value = ''; }}
            />
            {uploading ? (
              <p className="upload-text">Uploading & processing...</p>
            ) : (
              <>
                <svg className="upload-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <p className="upload-text">Drag PDF invoices here or <label htmlFor="invoice-upload" className="upload-link">browse</label></p>
                <p className="upload-hint">PDF files only. AI will extract line items automatically.</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="revenue-filters">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="processed">Processed</option>
          <option value="processing">Processing</option>
          <option value="error">Error</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Invoice List */}
      <div className="revenue-card">
        <div className="invoice-count">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</div>

        {loading && invoices.length === 0 ? (
          <div className="revenue-empty">Loading invoices...</div>
        ) : invoices.length === 0 ? (
          <div className="revenue-empty">
            <p>No invoices found</p>
            <p className="empty-hint">Upload a PDF invoice to get started</p>
          </div>
        ) : (
          <table className="revenue-table">
            <thead>
              <tr>
                <th>INVOICE</th>
                <th>COMPANY</th>
                <th>CLIENT</th>
                <th>DATE</th>
                <th>TOTAL</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(inv => {
                const sc = statusConf(inv.status);
                const isExpanded = expandedId === inv.id;
                return (
                  <React.Fragment key={inv.id}>
                    <tr className={`invoice-row ${isExpanded ? 'expanded' : ''}`} onClick={() => handleExpand(inv.id)}>
                      <td>
                        <div className="invoice-cell-primary">{inv.invoice_number || 'N/A'}</div>
                        <div className="invoice-cell-secondary">{inv.original_filename}</div>
                      </td>
                      <td>{inv.company?.name || '–'}</td>
                      <td>{inv.client?.name || '–'}</td>
                      <td>{formatDate(inv.invoice_date)}</td>
                      <td className="invoice-amount">{formatCurrency(inv.total_amount)}</td>
                      <td><span className={`invoice-status ${sc.cls}`}>{sc.label}</span></td>
                      <td className="invoice-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn-icon" title="Download PDF" onClick={() => handleDownload(inv.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                        {inv.status === 'error' && (
                          <button className="btn-icon" title="Reprocess" onClick={() => handleReprocess(inv.id)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                          </button>
                        )}
                        <button className="btn-icon btn-icon-danger" title="Delete" onClick={() => handleDelete(inv.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </td>
                    </tr>
                    {isExpanded && expandedInvoice && (
                      <tr className="invoice-detail-row">
                        <td colSpan={7}>
                          <InvoiceDetail invoice={expandedInvoice} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

/* Invoice Detail (expanded row) */
const InvoiceDetail: React.FC<{ invoice: InvoiceItem }> = ({ invoice }) => {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount);

  return (
    <div className="invoice-detail">
      {invoice.error_message && (
        <div className="invoice-error-msg">
          <strong>Error:</strong> {invoice.error_message}
        </div>
      )}

      <div className="invoice-detail-header">
        <div className="detail-meta">
          <span>Invoice #{invoice.invoice_number || 'N/A'}</span>
          <span>Company: <strong>{invoice.company?.name || '–'}</strong></span>
          <span>Client: <strong>{invoice.client?.name || '–'}</strong></span>
          <span>Uploaded by: {invoice.uploaded_by_user?.name || '–'}</span>
        </div>
      </div>

      {invoice.items && invoice.items.length > 0 ? (
        <table className="line-items-table">
          <thead>
            <tr>
              <th>#</th>
              <th>ARTICLE</th>
              <th>DESCRIPTION</th>
              <th>QTY</th>
              <th>UNIT</th>
              <th>PRICE</th>
              <th>DISCOUNT</th>
              <th>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map(item => (
              <tr key={item.id}>
                <td>{item.line_number}</td>
                <td className="article-code">{item.article_code || '–'}</td>
                <td>{item.description}</td>
                <td className="num">{Number(item.quantity).toFixed(2)}</td>
                <td>{item.unit}</td>
                <td className="num">{formatCurrency(item.unit_price)}</td>
                <td className="num">{item.discount_percent ? `${item.discount_percent}%` : '–'}</td>
                <td className="num">{formatCurrency(item.line_total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="total-label">Total</td>
              <td className="num total-value">{formatCurrency(invoice.total_amount)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="no-items">No line items extracted yet.</p>
      )}
    </div>
  );
};

/* ============================================================
   STATISTICS TAB
   ============================================================ */
const StatisticsTab: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, compRes] = await Promise.all([
        apiService.getInvoiceStats({
          company_id: filterCompany || undefined,
          start_date: filterStartDate || undefined,
          end_date: filterEndDate || undefined,
        }),
        apiService.getCompanies(),
      ]);
      setStats(statsRes.data);
      setCompanies(compRes.data || []);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [filterCompany, filterStartDate, filterEndDate]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(amount) || 0);

  const formatNum = (n: number) =>
    new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(Number(n) || 0);

  if (loading) return <div className="revenue-tab-content"><div className="revenue-empty">Loading statistics...</div></div>;
  if (!stats) return <div className="revenue-tab-content"><div className="revenue-empty">No data available</div></div>;

  return (
    <div className="revenue-tab-content">
      {/* Filters */}
      <div className="revenue-filters">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">All Companies</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} placeholder="Start date" />
        <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} placeholder="End date" />
      </div>

      {/* Summary KPI */}
      <div className="stats-kpi-row">
        <div className="stats-kpi-card">
          <div className="stats-kpi-value">{formatCurrency(stats.grand_total)}</div>
          <div className="stats-kpi-label">TOTAL REVENUE</div>
        </div>
        <div className="stats-kpi-card">
          <div className="stats-kpi-value">{stats.invoice_count}</div>
          <div className="stats-kpi-label">INVOICES</div>
        </div>
        <div className="stats-kpi-card">
          <div className="stats-kpi-value">
            {formatNum(stats.unit_totals?.find((u: any) => u.unit === 'm2')?.total_quantity || 0)} m²
          </div>
          <div className="stats-kpi-label">TOTAL M²</div>
        </div>
        <div className="stats-kpi-card">
          <div className="stats-kpi-value">
            {stats.invoice_count > 0 ? formatCurrency(stats.grand_total / stats.invoice_count) : '–'}
          </div>
          <div className="stats-kpi-label">AVG INVOICE</div>
        </div>
      </div>

      {/* Revenue by Company */}
      {stats.revenue_by_company?.length > 0 && (
        <div className="revenue-card">
          <h3 className="card-section-title">Revenue by Company</h3>
          <table className="revenue-table stats-table">
            <thead>
              <tr><th>COMPANY</th><th>INVOICES</th><th className="num">REVENUE</th></tr>
            </thead>
            <tbody>
              {stats.revenue_by_company.map((r: any) => (
                <tr key={r.company_id}>
                  <td><strong>{r.company_name}</strong></td>
                  <td>{r.count}</td>
                  <td className="num">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue by Client */}
      {stats.revenue_by_client?.length > 0 && (
        <div className="revenue-card">
          <h3 className="card-section-title">Revenue by Client</h3>
          <table className="revenue-table stats-table">
            <thead>
              <tr><th>CLIENT</th><th>INVOICES</th><th className="num">REVENUE</th></tr>
            </thead>
            <tbody>
              {stats.revenue_by_client.map((r: any) => (
                <tr key={r.client_id}>
                  <td><strong>{r.client_name}</strong></td>
                  <td>{r.count}</td>
                  <td className="num">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revenue by Month */}
      {stats.revenue_by_month?.length > 0 && (
        <div className="revenue-card">
          <h3 className="card-section-title">Revenue by Month</h3>
          <table className="revenue-table stats-table">
            <thead>
              <tr><th>MONTH</th><th>INVOICES</th><th className="num">REVENUE</th></tr>
            </thead>
            <tbody>
              {stats.revenue_by_month.map((r: any) => (
                <tr key={r.month}>
                  <td>{r.month}</td>
                  <td>{r.count}</td>
                  <td className="num">{formatCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Top Articles */}
      {stats.top_articles?.length > 0 && (
        <div className="revenue-card">
          <h3 className="card-section-title">Top Articles</h3>
          <table className="revenue-table stats-table">
            <thead>
              <tr><th>ARTICLE</th><th>DESCRIPTION</th><th>UNIT</th><th className="num">QTY</th><th className="num">AVG PRICE</th><th className="num">REVENUE</th></tr>
            </thead>
            <tbody>
              {stats.top_articles.map((a: any, idx: number) => (
                <tr key={idx}>
                  <td className="article-code">{a.article_code}</td>
                  <td>{a.description}</td>
                  <td>{a.unit}</td>
                  <td className="num">{formatNum(a.total_quantity)}</td>
                  <td className="num">{formatCurrency(a.avg_price)}</td>
                  <td className="num">{formatCurrency(a.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Unit Totals */}
      {stats.unit_totals?.length > 0 && (
        <div className="revenue-card">
          <h3 className="card-section-title">Totals by Unit</h3>
          <table className="revenue-table stats-table">
            <thead>
              <tr><th>UNIT</th><th className="num">TOTAL QTY</th><th className="num">TOTAL REVENUE</th></tr>
            </thead>
            <tbody>
              {stats.unit_totals.map((u: any) => (
                <tr key={u.unit}>
                  <td>{u.unit}</td>
                  <td className="num">{formatNum(u.total_quantity)}</td>
                  <td className="num">{formatCurrency(u.total_revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/* ============================================================
   AI ASSISTANT TAB
   ============================================================ */
const AssistantTab: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const examplePrompts = [
    "Qual è il fatturato totale per ogni azienda?",
    "Quali sono i 10 articoli più venduti in m²?",
    "Confronta il fatturato di questo mese con il mese scorso",
    "Quale cliente ha generato il fatturato più alto?",
    "Qual è il prezzo medio delle piastrelle 60x120?",
    "Quanti m² sono stati venduti in totale?",
  ];

  const handleSend = async (question?: string) => {
    const q = question || input.trim();
    if (!q) return;

    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiService.askInvoiceQuestion(q);
      setMessages(prev => [...prev, { role: 'assistant', content: res.data?.answer || 'No response.' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error processing request. Please try again.' }]);
    }
    setLoading(false);
  };

  return (
    <div className="revenue-tab-content assistant-tab">
      <div className="assistant-messages">
        {messages.length === 0 && (
          <div className="assistant-welcome">
            <div className="welcome-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </div>
            <h3>AI Revenue Assistant</h3>
            <p>Ask questions about your invoice data in natural language</p>
            <div className="example-prompts">
              {examplePrompts.map((p, i) => (
                <button key={i} className="example-chip" onClick={() => handleSend(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? 'Tu' : 'AI'}
            </div>
            <div className="message-content">
              <pre>{msg.content}</pre>
            </div>
          </div>
        ))}

        {loading && (
          <div className="chat-message assistant">
            <div className="message-avatar">AI</div>
            <div className="message-content loading-dots">Analyzing...</div>
          </div>
        )}
      </div>

      <div className="assistant-input-bar">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask a question about your revenue data..."
          disabled={loading}
        />
        <button onClick={() => handleSend()} disabled={loading || !input.trim()} className="send-btn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
    </div>
  );
};
