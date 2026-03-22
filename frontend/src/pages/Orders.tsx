import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { downloadBlob } from '../utils/downloadBlob';
import '../styles/CrudPages.css';

const formatDate = (d: string) => new Date(d).toLocaleDateString('it-IT');

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft: { bg: '#fff3cd', color: '#856404' },
  confirmed: { bg: '#d1ecf1', color: '#0c5460' },
  shipped: { bg: '#d4edda', color: '#155724' },
};

export const Orders: React.FC = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showShipped, setShowShipped] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      setIsLoading(true);
      const res = await apiService.getOrders(statusFilter ? { status: statusFilter } : undefined);
      if (res.success && res.data) {
        setOrders(Array.isArray(res.data) ? res.data : []);
      }
    } catch (err) {
      setError('Error loading orders');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter]);

  const filtered = orders.filter(o => {
    // Hide shipped by default unless toggle is on or filter is specifically "shipped"
    if (!showShipped && statusFilter !== 'shipped' && o.status === 'shipped') return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!(
        (o.supplier_name || '').toLowerCase().includes(term) ||
        (o.client_name || '').toLowerCase().includes(term) ||
        (o.id || '').toLowerCase().includes(term) ||
        (o.payment_method || '').toLowerCase().includes(term)
      )) return false;
    }
    return true;
  });

  const totalAmount = filtered.reduce((sum, o) => {
    const amt = typeof o.total_amount === 'number' ? o.total_amount : parseFloat(String(o.total_amount || 0));
    return sum + (isNaN(amt) ? 0 : amt);
  }, 0);

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      const blob = format === 'pdf'
        ? await apiService.exportFilteredOrdersPdf(filters)
        : await apiService.exportFilteredOrdersExcel(filters);
      downloadBlob(blob, `orders-report-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;

  return (
    <div className="crud-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Orders</h1>
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
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by supplier, client, order ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ flex: '1 1 250px', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.9rem' }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: '4px', fontSize: '0.9rem' }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="shipped">Shipped</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', color: '#666', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showShipped}
            onChange={(e) => setShowShipped(e.target.checked)}
          />
          Show shipped
        </label>
        <div style={{ fontSize: '0.9rem', color: '#666' }}>
          {filtered.length} orders | Total: <strong style={{ color: 'var(--color-info)' }}>€ {totalAmount.toFixed(2)}</strong>
        </div>
      </div>

      {/* Orders table */}
      <div style={{ background: 'white', border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e0e0e0', background: '#fafafa' }}>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Order #</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Supplier</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Client</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Date</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Payment</th>
              <th style={{ padding: '0.75rem', textAlign: 'right', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Amount</th>
              <th style={{ padding: '0.75rem', textAlign: 'left', fontWeight: '600', fontSize: '0.75rem', textTransform: 'uppercase', color: '#666' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: '#999' }}>No orders found</td></tr>
            ) : (
              filtered.map(order => {
                const status = order.status || 'draft';
                const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.draft;
                const amount = typeof order.total_amount === 'number' ? order.total_amount : parseFloat(String(order.total_amount || 0));
                return (
                  <tr
                    key={order.id}
                    style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', transition: 'background-color 0.15s' }}
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8f8f8')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '')}
                  >
                    <td style={{ padding: '0.75rem', fontWeight: '600', color: 'var(--color-info)' }}>
                      #{order.id.substring(0, 8)}
                    </td>
                    <td style={{ padding: '0.75rem', fontWeight: '500' }}>
                      {order.supplier_name || '-'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {order.client_name || '-'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {order.order_date ? formatDate(order.order_date) : '-'}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      {order.payment_method || '-'}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-info)' }}>
                      € {isNaN(amount) ? '0.00' : amount.toFixed(2)}
                    </td>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.color,
                      }}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
