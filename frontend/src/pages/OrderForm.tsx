import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { OrderLineItems } from '../components/OrderLineItems';
import { CustomerOrder, CustomerOrderItem, Visit, Company } from '../types';
import '../styles/OrderForm.css';

export const OrderForm: React.FC = () => {
  const navigate = useNavigate();
  const { visitId: urlVisitId, id } = useParams<{ visitId?: string; id?: string }>();
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
          // Pre-select first company if available
          if (companiesResponse.data.length > 0 && !isEditMode) {
            setFormData(prev => ({ ...prev, company_id: companiesResponse.data[0].id }));
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
            setError('Ordine non trovato');
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
          setSuccess('Riga ordine aggiunta');
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(response.error || 'Errore nell\'aggiunta della riga');
        }
      } catch (err) {
        console.error('Error adding item:', err);
        setError((err as Error).message || 'Errore sconosciuto');
      } finally {
        setIsLoading(false);
      }
    } else {
      setError('Devi prima creare l\'ordine');
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
            setSuccess('Riga ordine aggiornata');
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
    if (!window.confirm('Eliminare questa riga ordine?')) return;

    if (order) {
      try {
        setIsLoading(true);
        const response = await apiService.deleteOrderItem(order.id, itemId);
        if (response.success) {
          setItems(items.filter(i => i.id !== itemId));
          setSuccess('Riga ordine eliminata');
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
        setError('Visita non trovata');
        return;
      }

      if (!formData.order_date || !formData.company_id) {
        setError('Compilare i campi obbligatori: Azienda e Data');
        return;
      }

      const selectedCompany = companies.find(c => c.id === formData.company_id);
      if (!selectedCompany) {
        setError('Azienda selezionata non valida');
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
          setSuccess('Ordine aggiornato con successo');
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
          setSuccess('Ordine creato con successo');
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
    if (!window.confirm('Eliminare questo ordine? Questa azione non può essere annullata.')) return;

    try {
      setIsLoading(true);
      if (order) {
        const response = await apiService.deleteOrder(order.id);
        if (response.success) {
          setSuccess('Ordine eliminato');
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
        link.download = `ordine_${order.id.substring(0, 8)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setSuccess('PDF scaricato con successo');
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      setError('Errore nel download del PDF');
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
        link.download = `ordine_${order.id.substring(0, 8)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        setSuccess('Excel scaricato con successo');
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      setError('Errore nel download di Excel');
    } finally {
      setIsLoading(false);
    }
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total_line, 0);

  if (!visit && visitId) {
    return <div className="loading">Caricamento...</div>;
  }

  return (
    <div className="order-form-page">
      <div className="order-form-container">
        <div className="order-header">
          <h1>📦 {order ? 'Modifica' : 'Crea'} Ordine Cliente</h1>
          <button onClick={() => navigate(resolvedVisitId ? `/visits/${resolvedVisitId}` : '/visits')} className="btn-back">← Indietro</button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="order-testata">
          <h2>Intestazione Ordine</h2>

          <div className="testata-grid">
            <div className="testata-field">
              <label>Azienda Fornitrice *</label>
              <select
                name="company_id"
                value={formData.company_id}
                onChange={handleChange}
                disabled={isLoading || order !== null}
              >
                <option value="">-- Seleziona --</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="testata-field">
              <label>Cliente</label>
              <input type="text" value={visit?.client?.name || ''} disabled className="input-disabled" />
            </div>

            <div className="testata-field">
              <label>Data Ordine *</label>
              <input
                type="date"
                name="order_date"
                value={formData.order_date}
                onChange={handleChange}
                disabled={isLoading}
              />
            </div>

            <div className="testata-field">
              <label>Pagamento</label>
              <input
                type="text"
                name="payment_method"
                value={formData.payment_method}
                onChange={handleChange}
                placeholder="Es: Bonifico, Contanti, Carta, etc."
                disabled={isLoading}
              />
            </div>

            <div className="testata-field full-width">
              <label>Note</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="Note aggiuntive..."
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
                  <option value="draft">Bozza</option>
                  <option value="confirmed">Confermato</option>
                  <option value="completed">Completato</option>
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
            {isLoading ? 'Salvataggio...' : order ? 'Aggiorna Ordine' : 'Crea Ordine'}
          </button>

          {order && (
            <>
              <button
                onClick={handleExportPdf}
                disabled={isLoading}
                className="btn-export"
                title="Scarica ordine in PDF"
              >
                📄 PDF
              </button>

              <button
                onClick={handleExportExcel}
                disabled={isLoading}
                className="btn-export"
                title="Scarica ordine in Excel"
              >
                📊 Excel
              </button>

              <button
                onClick={handleDeleteOrder}
                disabled={isLoading}
                className="btn-delete-order"
              >
                Elimina Ordine
              </button>
            </>
          )}

          <button
            onClick={() => navigate(resolvedVisitId ? `/visits/${resolvedVisitId}` : '/visits')}
            disabled={isLoading}
            className="btn-cancel"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
};
