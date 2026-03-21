import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { OrderLineItems } from '../components/OrderLineItems';
import { CustomerOrder, CustomerOrderItem, Visit, Company } from '../types';
import '../styles/OrderForm.css';

export const OrderForm: React.FC = () => {
  const navigate = useNavigate();
  const { visitId: urlVisitId, id } = useParams<{ visitId?: string; id?: string }>();
  const [searchParams] = useSearchParams();
  const supplierIdFromUrl = searchParams.get('supplierId');
  const isEditMode = !!id;
  // In edit mode, visitId comes from the loaded order; in create mode, from URL params
  const [resolvedVisitId, setResolvedVisitId] = useState<string | undefined>(urlVisitId);

  const [visit, setVisit] = useState<Visit | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [formData, setFormData] = useState({
    company_id: '',
    order_date: new Date().toISOString().split('T')[0],
    payment_method: '',
    notes: '',
    status: 'draft',
  });

  const [items, setItems] = useState<CustomerOrderItem[]>([]);

  // Load data on mount (either edit existing order or create new)
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Load companies (always needed)
        const companiesResponse = await apiService.getCompanies();
        if (companiesResponse.success && companiesResponse.data) {
          setCompanies(companiesResponse.data);
          // Pre-select supplier from URL param, or first company as fallback
          if (!isEditMode) {
            if (supplierIdFromUrl && companiesResponse.data.some((c: Company) => c.id === supplierIdFromUrl)) {
              setFormData(prev => ({ ...prev, company_id: supplierIdFromUrl }));
            } else if (companiesResponse.data.length > 0) {
              setFormData(prev => ({ ...prev, company_id: companiesResponse.data[0].id }));
            }
          }
        }

        if (isEditMode && id) {
          // Edit mode: load existing order
          const orderResponse = await apiService.getOrderById(id);
          if (orderResponse.success && orderResponse.data) {
            const existingOrder = orderResponse.data;
            setOrder(existingOrder);
            setItems(existingOrder.items || []);

            // Pre-fill form with order data
            setFormData({
              company_id: existingOrder.supplier_id || '',
              order_date: new Date(existingOrder.order_date).toISOString().split('T')[0],
              payment_method: existingOrder.payment_method || '',
              notes: existingOrder.notes || '',
              status: existingOrder.status || 'draft',
            });

            // Set resolved visit ID from order data
            if (existingOrder.visit_id) {
              setResolvedVisitId(existingOrder.visit_id);
              const visitResponse = await apiService.getVisit(existingOrder.visit_id);
              if (visitResponse.success && visitResponse.data) {
                setVisit(visitResponse.data);
              }
            }
          } else {
            setError('Order not found');
          }
        } else if (urlVisitId) {
          // Create mode: load visit data
          const visitResponse = await apiService.getVisit(urlVisitId);
          if (visitResponse.success && visitResponse.data) {
            setVisit(visitResponse.data);
            // Pre-fill order date with visit date
            const visitDate = new Date(visitResponse.data.visit_date).toISOString().split('T')[0];
            setFormData(prev => ({ ...prev, order_date: visitDate }));
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    if (urlVisitId || id) {
      loadData();
    }
  }, [urlVisitId, id, isEditMode]);

  // Handle form input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Add new order item
  const handleAddItem = async (itemData: any) => {
    if (order) {
      try {
        setIsLoading(true);
        setError(null);
        const response = await apiService.addOrderItem(order.id, itemData);
        if (response.success && response.data) {
          setItems([...items, response.data]);
          setSuccess('Order line added');
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(response.error || 'Error adding order line');
        }
      } catch (err) {
        console.error('Error adding item:', err);
        setError((err as Error).message || 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    } else {
      setError('You must create the order first');
    }
  };

  // Update order item
  const handleUpdateItem = async (itemId: string, itemData: any) => {
    if (order) {
      try {
        setIsLoading(true);
        const response = await apiService.updateOrderItem(order.id, itemId, itemData);
        if (response.success) {
          // Reload items to get updated totals
          const updatedOrder = await apiService.getOrderById(order.id);
          if (updatedOrder.success && updatedOrder.data) {
            setItems(updatedOrder.data.items || []);
            setOrder(updatedOrder.data);
            setSuccess('Order line updated');
            setTimeout(() => setSuccess(null), 3000);
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Delete order item
  const handleDeleteItem = async (itemId: string) => {
    if (!window.confirm('Delete this order line?')) return;

    if (order) {
      try {
        setIsLoading(true);
        const response = await apiService.deleteOrderItem(order.id, itemId);
        if (response.success) {
          setItems(items.filter(i => i.id !== itemId));
          setSuccess('Order line deleted');
          setTimeout(() => setSuccess(null), 3000);
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Create or update order
  const handleSaveOrder = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const activeVisitId = resolvedVisitId || urlVisitId;
      if (!activeVisitId) {
        setError('Visit not found');
        return;
      }

      if (!formData.order_date || !formData.company_id) {
        setError('Please fill required fields: Supplier and Date');
        return;
      }

      const selectedCompany = companies.find(c => c.id === formData.company_id);
      if (!selectedCompany) {
        setError('Invalid supplier selected');
        return;
      }

      if (order) {
        // Update existing order
        const response = await apiService.updateOrder(order.id, {
          order_date: formData.order_date,
          payment_method: formData.payment_method,
          notes: formData.notes,
          status: formData.status,
        });
        if (response.success) {
          setSuccess('Order updated successfully');
          setTimeout(() => {
            navigate(`/visits/${activeVisitId}`);
          }, 1500);
        }
      } else {
        // Create new order
        const response = await apiService.createOrder({
          visit_id: activeVisitId,
          supplier_id: selectedCompany.id,
          supplier_name: selectedCompany.name,
          client_id: visit!.client_id,
          client_name: visit!.client!.name,
          order_date: formData.order_date,
          payment_method: formData.payment_method,
          notes: formData.notes || undefined,
        });

        if (response.success && response.data) {
          setOrder(response.data);
          setItems(response.data.items || []);
          setSuccess('Order created successfully');
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Delete order
  const handleDeleteOrder = async () => {
    if (!window.confirm('Delete this order? This action cannot be undone.')) return;

    try {
      setIsLoading(true);
      if (order) {
        const response = await apiService.deleteOrder(order.id);
        if (response.success) {
          setSuccess('Order deleted');
          setTimeout(() => {
            navigate(resolvedVisitId ? `/visits/${resolvedVisitId}` : '/visits');
          }, 1500);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Export handlers
  const handleExportPdf = async () => {
    try {
      setIsLoading(true);
      if (order) {
        const blob = await apiService.exportOrderPdf(order.id);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order_${order.id.substring(0, 8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setSuccess('PDF downloaded successfully');
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      setError('Error downloading PDF');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportExcel = async () => {
    try {
      setIsLoading(true);
      if (order) {
        const blob = await apiService.exportOrderExcel(order.id);
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `order_${order.id.substring(0, 8)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setSuccess('Excel downloaded successfully');
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      setError('Error downloading Excel');
    } finally {
      setIsLoading(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total_line, 0);

  if (!visit && urlVisitId) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="order-form-page">
      <div className="order-form-container">
        <div className="order-header">
          <h1>📦 {order ? 'Edit' : 'Create'} Customer Order</h1>
          <button onClick={() => navigate(resolvedVisitId ? `/visits/${resolvedVisitId}` : '/visits')} className="btn-back">← Back</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="order-testata">
          <h2>Order Header</h2>

          <div className="testata-grid">
            <div className="testata-field">
              <label>Supplier *</label>
              <select
                name="company_id"
                value={formData.company_id}
                onChange={handleChange}
                disabled={isLoading || order !== null}
              >
                <option value="">-- Select --</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="testata-field">
              <label>Client</label>
              <input type="text" value={visit?.client?.name || ''} disabled className="input-disabled" />
            </div>

            <div className="testata-field">
              <label>Order Date *</label>
              <input
                type="date"
                name="order_date"
                value={formData.order_date}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="testata-field">
              <label>Payment</label>
              <input
                type="text"
                name="payment_method"
                value={formData.payment_method}
                onChange={handleChange}
                placeholder="E.g: Bank Transfer, Cash, Card, etc."
                disabled={isLoading}
              />
            </div>

            <div className="testata-field full-width">
              <label>Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Additional notes..."
                disabled={isLoading}
              />
            </div>

            {order && (
              <div className="testata-field">
                <label>Status</label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  disabled={isLoading}
                >
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="shipped">Shipped</option>
                </select>
              </div>
            )}
          </div>
        </div>

        {order && (
          <OrderLineItems
            items={items}
            orderId={order.id}
            isEditable={!isLoading}
            onAddItem={handleAddItem}
            onUpdateItem={handleUpdateItem}
            onDeleteItem={handleDeleteItem}
          />
        )}

        <div className="order-actions">
          <button
            onClick={handleSaveOrder}
            disabled={isLoading}
            className="btn-save-order"
          >
            {isLoading ? 'Saving...' : order ? 'Update Order' : 'Create Order'}
          </button>

          {order && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={isLoading}
                className="btn-export"
                title="Download order as PDF"
              >
                📄 PDF
              </button>

              <button
                onClick={handleExportExcel}
                disabled={isLoading}
                className="btn-export"
                title="Download order as Excel"
              >
                📊 Excel
              </button>

              <button
                onClick={handleDeleteOrder}
                disabled={isLoading}
                className="btn-delete-order"
              >
                Delete Order
              </button>
            </>
          )}

          <button
            onClick={() => navigate(resolvedVisitId ? `/visits/${resolvedVisitId}` : '/visits')}
            disabled={isLoading}
            className="btn-cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
