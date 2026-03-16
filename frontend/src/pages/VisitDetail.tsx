import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import { Visit, VisitReport, CustomerOrder } from '../types';
import '../styles/CrudPages.css';

export const VisitDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [visit, setVisit] = useState<Visit | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadVisit();
  }, [id]);

  const loadVisit = async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const response = await apiService.getVisit(id);
      if (response.success && response.data) {
        setVisit(response.data);
        // Load associated orders
        const ordersResponse = await apiService.getOrdersByVisit(id);
        if (ordersResponse.success && ordersResponse.data) {
          setOrders(ordersResponse.data);
        }
      }
    } catch (err) {
      setError('Error loading visit');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditReport = (report: VisitReport) => {
    setEditingReportId(report.id);
    setEditContent(report.content);
  };

  const handleSaveReport = async (reportId: string) => {
    if (!id) return;
    try {
      await apiService.updateVisitReport(id, reportId, { content: editContent });
      setEditingReportId(null);
      loadVisit();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (!id || !confirm('Are you sure?')) return;
    try {
      await apiService.deleteVisitReport(id, reportId);
      loadVisit();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleDeleteVisit = async () => {
    if (!id) return;
    try {
      setIsDeleting(true);
      setError('');

      // Check if visit can be deleted
      const checkResponse = await apiService.canDeleteVisit(id);
      if (!checkResponse.success || !checkResponse.data) {
        setError('Error checking visit');
        setIsDeleting(false);
        return;
      }

      const { canDelete, reportCount } = checkResponse.data;

      // If there are reports, ask for confirmation
      if (!canDelete && reportCount > 0) {
        const confirmDelete = window.confirm(
          `There are still ${reportCount} associated reports. Do you want to delete them and cancel the visit?`
        );
        if (!confirmDelete) {
          setIsDeleting(false);
          return;
        }
      }

      // Delete the visit
      const deleteResponse = await apiService.deleteVisit(id);
      if (deleteResponse.success) {
        navigate('/visits', {
          state: { message: 'Visit cancelled successfully' }
        });
      } else {
        setError(deleteResponse.error || 'Error deleting visit');
        setIsDeleting(false);
      }
    } catch (err) {
      setError((err as Error).message);
      setIsDeleting(false);
    }
  };

  if (isLoading) return <p>Loading...</p>;
  if (!visit) return <p>Visit not found</p>;

  return (
    <div className="crud-page">
      <div className="page-header">
        <h1>Visit - {visit.client?.name}</h1>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button
            onClick={() => navigate(`/orders/new/${id}`)}
            className="btn-primary"
            title="Create a new customer order"
          >
            📦 Create Order
          </button>
          <button
            onClick={handleDeleteVisit}
            disabled={isDeleting}
            className="btn-danger"
            title={visit.reports?.length ? `${visit.reports.length} associated reports` : 'Cancel this visit'}
          >
            {isDeleting ? 'Cancelling...' : '🗑️ Cancel Visit'}
          </button>
          <button onClick={() => navigate('/visits')} className="btn-secondary">
            ← Back to Visits
          </button>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      <div className="form-card">
        <h3>Visit Information</h3>
        <div className="info-group">
          <div>
            <label>Client</label>
            <p>{visit.client?.name}</p>
          </div>
          <div>
            <label>Date</label>
            <p>{new Date(visit.visit_date).toLocaleDateString('it-IT')}</p>
          </div>
          <div>
            <label>Visited By</label>
            <p>{visit.visited_by_user?.name}</p>
          </div>
        </div>
      </div>

      <h2>Company Reports</h2>

      {visit.reports && visit.reports.length > 0 ? (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {visit.reports.map((report) => (
            <div key={report.id} className="form-card">
              <div style={{ marginBottom: '1rem' }}>
                <h3>
                  {report.company?.name} - {report.section}
                </h3>
                <span
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    backgroundColor:
                      report.status === 'draft'
                        ? '#fff3cd'
                        : report.status === 'submitted'
                          ? '#d1ecf1'
                          : '#d4edda',
                    color:
                      report.status === 'draft'
                        ? '#856404'
                        : report.status === 'submitted'
                          ? '#0c5460'
                          : '#155724',
                    fontSize: '0.9rem',
                  }}
                >
                  {report.status}
                </span>
              </div>

              {editingReportId === report.id ? (
                <div className="form-group">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={5}
                  />
                  <div className="form-actions" style={{ marginTop: '1rem' }}>
                    <button
                      onClick={() => handleSaveReport(report.id)}
                      className="btn-primary"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingReportId(null)}
                      className="btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p style={{ whiteSpace: 'pre-wrap', color: '#555' }}>{report.content}</p>
                  <div className="form-actions">
                    <button
                      onClick={() => handleEditReport(report)}
                      className="btn-warning"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteReport(report.id)}
                      className="btn-danger"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => navigate(`/visits/${id}/reports/${report.id}`)}
                      className="btn-info"
                    >
                      Attachments
                    </button>
                    <button
                      onClick={() =>
                        navigate(
                          `/todos/new?visitReportId=${report.id}&clientId=${visit.client_id}&companyId=${report.company_id}`
                        )
                      }
                      className="btn-primary"
                    >
                      📋 Create TODO
                    </button>
                  </div>
                </div>
              )}

              {report.attachments && report.attachments.length > 0 && (
                <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #ddd' }}>
                  <h4>Attachments ({report.attachments.length})</h4>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {report.attachments.map((att) => (
                      <li key={att.id} style={{ marginBottom: '0.5rem' }}>
                        📄 {att.filename}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p>No reports registered</p>
      )}

      <h2 style={{ marginTop: '2rem' }}>📦 Customer Orders</h2>
      {orders && orders.length > 0 ? (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {orders.map((order) => (
            <div key={order.id} className="form-card">
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 0.5rem 0' }}>Order #{order.id.substring(0, 8)}</h3>
                  <p style={{ margin: 0, color: '#666', fontSize: '0.9rem' }}>
                    Date: {new Date(order.order_date).toLocaleDateString('it-IT')} | Payment: {order.payment_method}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    backgroundColor:
                      order.status === 'draft' ? '#fff3cd' :
                        order.status === 'confirmed' ? '#d1ecf1' : '#d4edda',
                    color:
                      order.status === 'draft' ? '#856404' :
                        order.status === 'confirmed' ? '#0c5460' : '#155724',
                    fontSize: '0.9rem',
                  }}>
                    {order.status}
                  </span>
                  <button
                    onClick={() => navigate(`/orders/${order.id}/edit`)}
                    className="btn-primary"
                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                  >
                    ✎ Edit
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div>
                  <label>Lines</label>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2rem' }}>{order.items?.length || 0}</p>
                </div>
                <div>
                  <label>Total Amount</label>
                  <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2rem', color: '#007aff' }}>€ {typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : parseFloat(String(order.total_amount)).toFixed(2)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>No orders registered</p>
      )}
    </div>
  );
};
