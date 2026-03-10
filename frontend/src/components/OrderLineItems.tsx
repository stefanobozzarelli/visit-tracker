import React, { useState } from 'react';
import { CustomerOrderItem } from '../types';
import '../styles/OrderLineItems.css';

interface OrderLineItemsProps {
  items: CustomerOrderItem[];
  orderId: string;
  isEditable: boolean;
  onAddItem: (item: any) => void;
  onUpdateItem: (itemId: string, item: any) => void;
  onDeleteItem: (itemId: string) => void;
}

export const OrderLineItems: React.FC<OrderLineItemsProps> = ({
  items,
  orderId,
  isEditable,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
}) => {
  const [showNewItemForm, setShowNewItemForm] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [newItem, setNewItem] = useState({
    article_code: '',
    description: '',
    format: '',
    unit_of_measure: 'pezzi',
    quantity: 1,
    unit_price: 0,
    discount: 0,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>({});

  const handleAddItem = async () => {
    if (!newItem.description || !newItem.unit_of_measure) {
      alert('Compilare i campi obbligatori: Descrizione, UM');
      return;
    }
    await onAddItem(newItem);
    setNewItem({
      article_code: '',
      description: '',
      format: '',
      unit_of_measure: 'pezzi',
      quantity: 1,
      unit_price: 0,
      discount: 0,
    });
    setShowNewItemForm(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) {
      alert('Scrivi un commento');
      return;
    }
    await onAddItem({
      article_code: '',
      description: newComment,
      format: '',
      unit_of_measure: '',
      quantity: 0,
      unit_price: 0,
      discount: '',
    });
    setNewComment('');
    setShowCommentForm(false);
  };

  const startEdit = (item: CustomerOrderItem) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const saveEdit = async () => {
    if (editingId) {
      await onUpdateItem(editingId, editData);
      setEditingId(null);
      setEditData({});
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };


  const commonUnitsOfMeasure = ['m2', 'pezzi', 'comp', 'palette', 'container'];

  return (
    <div className="order-line-items">
      <h3>Righe Ordine</h3>

      {items && items.length > 0 ? (
        <div className="items-table-container">
          {/* Riassunto Sconto */}
          <div className="discount-summary">
            <strong>Sconti Applicati: </strong>
            {items.map((item, idx) => item.discount ? `${item.discount}` : null).filter(Boolean).join(' + ') || 'Nessuno'}
          </div>

          <table className="items-table">
            <thead>
              <tr>
                <th>Codice Articolo</th>
                <th>Descrizione</th>
                <th>Formato</th>
                <th>UM</th>
                <th>Quantità</th>
                <th>Prezzo Unitario</th>
                <th>Sconto</th>
                {isEditable && <th>Azioni</th>}
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                // Controlla se è una riga commento (quantity = 0 e unit_of_measure vuoto)
                const isCommentRow = item.quantity === 0 && !item.unit_of_measure;
                const colSpan = isEditable ? 8 : 7;

                return (
                  <tr key={item.id} className={isCommentRow ? 'comment-row' : ''}>
                    {editingId === item.id ? (
                      <>
                        <td>
                          <input
                            type="text"
                            value={editData.article_code}
                            onChange={(e) => setEditData({ ...editData, article_code: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <textarea
                            value={editData.description}
                            onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                            className="edit-input-textarea"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editData.format || ''}
                            onChange={(e) => setEditData({ ...editData, format: e.target.value })}
                            className="edit-input"
                          />
                        </td>
                        <td>
                          <select
                            value={editData.unit_of_measure}
                            onChange={(e) => setEditData({ ...editData, unit_of_measure: e.target.value })}
                            className="edit-input"
                          >
                            {commonUnitsOfMeasure.map(um => (
                              <option key={um} value={um}>{um}</option>
                            ))}
                            <option value="">Altro</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            value={editData.quantity}
                            onChange={(e) => setEditData({ ...editData, quantity: parseFloat(e.target.value) })}
                            className="edit-input"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={editData.unit_price}
                            onChange={(e) => setEditData({ ...editData, unit_price: parseFloat(e.target.value) })}
                            className="edit-input"
                            step="0.01"
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={editData.discount || ''}
                            onChange={(e) => setEditData({ ...editData, discount: e.target.value })}
                            className="edit-input"
                            placeholder="Testo libero"
                          />
                        </td>
                        <td className="azioni-cell">
                          <button onClick={saveEdit} className="btn-save">✓</button>
                          <button onClick={cancelEdit} className="btn-cancel">✕</button>
                        </td>
                      </>
                    ) : isCommentRow ? (
                      <>
                        <td colSpan={colSpan} className="comment-cell">
                          <div className="comment-content">
                            <span className="comment-icon">💬</span>
                            <span>{item.description}</span>
                          </div>
                        </td>
                        {isEditable && (
                          <td className="azioni-cell">
                            <button onClick={() => startEdit(item)} className="btn-edit" title="Modifica">✎</button>
                            <button onClick={() => onDeleteItem(item.id)} className="btn-delete" title="Elimina">🗑</button>
                          </td>
                        )}
                      </>
                    ) : (
                      <>
                        <td>{item.article_code}</td>
                        <td className="description-cell">{item.description}</td>
                        <td>{item.format || '-'}</td>
                        <td>{item.unit_of_measure}</td>
                        <td className="number-cell">{item.quantity}</td>
                        <td className="number-cell">€ {typeof item.unit_price === 'number' ? item.unit_price.toFixed(2) : parseFloat(String(item.unit_price)).toFixed(2)}</td>
                        <td>{item.discount || '-'}</td>
                        {isEditable && (
                          <td className="azioni-cell">
                            <button onClick={() => startEdit(item)} className="btn-edit" title="Modifica">✎</button>
                            <button onClick={() => onDeleteItem(item.id)} className="btn-delete" title="Elimina">🗑</button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-message">Nessuna riga ordine. Aggiungi la prima riga.</p>
      )}

      {isEditable && (
        <>
          {!showNewItemForm && !showCommentForm && (
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowNewItemForm(true)} className="btn-add-item">
                + Aggiungi Riga
              </button>
              <button onClick={() => setShowCommentForm(true)} className="btn-add-item" style={{ backgroundColor: '#6c757d' }}>
                + Aggiungi Commento
              </button>
            </div>
          )}

          {showNewItemForm && (
            <div className="new-item-form">
              <h4>Nuova Riga Ordine</h4>
              <div className="form-row">
                <div className="form-group">
                  <label>Codice Articolo</label>
                  <input
                    type="text"
                    value={newItem.article_code}
                    onChange={(e) => setNewItem({ ...newItem, article_code: e.target.value })}
                    placeholder="es: ART001"
                  />
                </div>

                <div className="form-group">
                  <label>Descrizione *</label>
                  <textarea
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                    placeholder="Descrizione dettagliata dell'articolo"
                  />
                </div>

                <div className="form-group">
                  <label>Formato</label>
                  <input
                    type="text"
                    value={newItem.format}
                    onChange={(e) => setNewItem({ ...newItem, format: e.target.value })}
                    placeholder="es: A4, 50x100cm"
                  />
                </div>

                <div className="form-group">
                  <label>UM *</label>
                  <select
                    value={newItem.unit_of_measure}
                    onChange={(e) => setNewItem({ ...newItem, unit_of_measure: e.target.value })}
                  >
                    {commonUnitsOfMeasure.map(um => (
                      <option key={um} value={um}>{um}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Quantità</label>
                  <input
                    type="number"
                    value={newItem.quantity}
                    onChange={(e) => setNewItem({ ...newItem, quantity: parseFloat(e.target.value) })}
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>Prezzo Unitario</label>
                  <input
                    type="number"
                    value={newItem.unit_price}
                    onChange={(e) => setNewItem({ ...newItem, unit_price: parseFloat(e.target.value) })}
                    step="0.01"
                  />
                </div>

                <div className="form-group">
                  <label>Sconto</label>
                  <input
                    type="text"
                    value={newItem.discount}
                    onChange={(e) => setNewItem({ ...newItem, discount: e.target.value as any })}
                    placeholder="Importo sconto libero"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button onClick={handleAddItem} className="btn-primary">Aggiungi</button>
                <button onClick={() => setShowNewItemForm(false)} className="btn-secondary">Annulla</button>
              </div>
            </div>
          )}

          {showCommentForm && (
            <div className="new-item-form">
              <h4>Aggiungi Commento</h4>
              <div className="form-row">
                <div className="form-group" style={{ width: '100%' }}>
                  <label>Commento</label>
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Scrivi un commento o nota..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button onClick={handleAddComment} className="btn-primary">Aggiungi Commento</button>
                <button onClick={() => setShowCommentForm(false)} className="btn-secondary">Annulla</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
