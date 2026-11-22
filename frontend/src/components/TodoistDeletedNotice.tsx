import React, { useState } from 'react';
import { apiService } from '../services/api';

interface Props {
  todoId: string;
  deletedAt: string;
  /** Chiamata dopo il ripristino (deleted=false) o l'eliminazione definitiva (deleted=true). */
  onResolved: (deleted: boolean) => void;
  compact?: boolean;
}

/**
 * Avviso per un task cancellato su Todoist: l'utente sceglie se ripristinarlo
 * (torna anche su Todoist) o eliminarlo definitivamente da Tradeflow.
 */
export const TodoistDeletedNotice: React.FC<Props> = ({ todoId, deletedAt, onResolved, compact }) => {
  const [busy, setBusy] = useState(false);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const restore = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      const res = await apiService.restoreTodoistTodo(todoId);
      if (res.success) {
        if (!res.data?.onTodoist) {
          window.alert('Task ripristinato in Tradeflow. Non è stato ricreato su Todoist (task completato o Todoist non collegato per l\'assegnatario).');
        }
        onResolved(false);
      } else {
        window.alert(res.error || 'Errore durante il ripristino');
      }
    } catch (err: any) {
      window.alert(err?.response?.data?.error || 'Errore durante il ripristino');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Eliminare definitivamente questo task da Tradeflow? Verranno persi anche gli allegati.')) return;
    setBusy(true);
    try {
      const res = await apiService.deleteTodo(todoId);
      if (res.success) onResolved(true);
      else window.alert(res.error || 'Errore durante l\'eliminazione');
    } catch (err: any) {
      window.alert(err?.response?.data?.error || 'Errore durante l\'eliminazione');
    } finally {
      setBusy(false);
    }
  };

  const when = new Date(deletedAt).toLocaleDateString('it-IT');

  return (
    <div
      onClick={stop}
      onDoubleClick={stop}
      style={{
        marginTop: compact ? 6 : 0,
        marginBottom: compact ? 0 : '1rem',
        padding: compact ? '6px 8px' : '0.75rem 1rem',
        background: '#fff4e5',
        border: '1px solid #f5c27a',
        borderRadius: 6,
        color: '#7a4a00',
        fontSize: compact ? '0.78rem' : '0.9rem',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
      }}
    >
      <span style={{ fontWeight: 600 }}>Cancellato da Todoist</span>
      <span style={{ opacity: 0.8 }}>({when})</span>
      <span style={{ flex: 1 }} />
      <button
        type="button"
        onClick={restore}
        disabled={busy}
        style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #2E7D32', background: '#2E7D32', color: '#fff', cursor: 'pointer', fontSize: 'inherit' }}
      >
        Ripristina
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid #c62828', background: '#fff', color: '#c62828', cursor: 'pointer', fontSize: 'inherit' }}
      >
        Elimina definitivamente
      </button>
    </div>
  );
};

export default TodoistDeletedNotice;
