import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';

interface Rel {
  id: string;
  from_client_id: string;
  to_client_id: string;
  relationship_type: string;
  notes: string | null;
  from_name: string;
  from_role: string;
  to_name: string;
  to_role: string;
}

const ROLE_LABELS: Record<string, string> = {
  cliente: 'Client', developer: 'Developer', 'architetto-designer': 'Arch/Design',
};

interface Props {
  clientId: string;
  clientName: string;
  allClients: { id: string; name: string; role?: string }[];
  isAdmin: boolean;
}

export const ClientReferrals: React.FC<Props> = ({ clientId, clientName, allClients, isAdmin }) => {
  const navigate = useNavigate();
  const [rels, setRels] = useState<Rel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [linkId, setLinkId] = useState('');
  const [linkNotes, setLinkNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { load(); }, [clientId]);

  const load = async () => {
    try {
      setLoading(true);
      const r = await apiService.getClientReferrals(clientId);
      if (r.success) setRels(r.data || []);
    } catch {}
    finally { setLoading(false); }
  };

  const addRel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkId) return;
    setSaving(true); setError('');
    try {
      const r = await apiService.addClientReferral(clientId, linkId, linkNotes || undefined);
      if (r.success) { setShowAdd(false); setLinkId(''); setLinkNotes(''); load(); }
      else setError(r.error || 'Errore');
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const removeRel = async (relId: string) => {
    if (!window.confirm('Rimuovere questo collegamento?')) return;
    try {
      await apiService.deleteClientReferral(clientId, relId);
      load();
    } catch {}
  };

  const linkedClients = rels.map(r => {
    const isFrom = r.from_client_id === clientId;
    return {
      id: r.id,
      relId: r.id,
      otherId: isFrom ? r.to_client_id : r.from_client_id,
      otherName: isFrom ? r.to_name : r.from_name,
      otherRole: isFrom ? r.to_role : r.from_role,
      direction: isFrom ? 'referral_to' : 'referral_from',
      notes: r.notes,
    };
  });

  const availableClients = allClients.filter(c => c.id !== clientId && !rels.some(r => r.from_client_id === c.id || r.to_client_id === c.id));

  return (
    <div>
      {loading ? (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>Caricamento…</div>
      ) : linkedClients.length === 0 ? (
        <div className="cd-empty">Nessun collegamento referral</div>
      ) : (
        <div className="cd-list">
          {linkedClients.map(lc => (
            <div key={lc.id} className="cd-list-item" style={{ cursor: 'default', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                {/* Direction label */}
                <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: lc.direction === 'referral_to' ? '#3D7DAA' : '#6a7e3d', marginBottom: 4 }}>
                  {lc.direction === 'referral_to' ? '↗ Il suo cliente di riferimento è' : '↙ Cliente di riferimento per:'}
                </div>
                {/* Client name + role — clickable */}
                <div
                  onClick={() => navigate(`/clients/${lc.otherId}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>{lc.otherName}</span>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 20, background: 'var(--color-bg)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {ROLE_LABELS[lc.otherRole] || lc.otherRole || 'Client'}
                  </span>
                </div>
                {lc.notes && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 3 }}>{lc.notes}</div>
                )}
              </div>
              {isAdmin && (
                <button
                  onClick={() => removeRel(lc.relId)}
                  style={{ background: 'none', border: 'none', color: '#c0392b', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 4px', opacity: 0.5, marginTop: 2 }}
                  title="Rimuovi collegamento"
                >×</button>
              )}
            </div>
          ))}
        </div>
      )}

      {isAdmin && (
        <>
          {!showAdd ? (
            <button className="cd-link" onClick={() => setShowAdd(true)} style={{ marginTop: '0.5rem' }}>+ Aggiungi referral</button>
          ) : (
            <form onSubmit={addRel} style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <select
                value={linkId}
                onChange={e => setLinkId(e.target.value)}
                required
                style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--color-border)', borderRadius: 7, fontSize: '0.85rem' }}
              >
                <option value="">— Seleziona cliente —</option>
                {availableClients.sort((a, b) => a.name.localeCompare(b.name)).map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({ROLE_LABELS[c.role || ''] || c.role || 'Client'})</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Note (opzionale)"
                value={linkNotes}
                onChange={e => setLinkNotes(e.target.value)}
                style={{ padding: '0.4rem 0.6rem', border: '1px solid var(--color-border)', borderRadius: 7, fontSize: '0.85rem' }}
              />
              {error && <div style={{ color: '#c0392b', fontSize: '0.78rem' }}>{error}</div>}
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" disabled={saving} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  {saving ? 'Salvo…' : 'Collega'}
                </button>
                <button type="button" onClick={() => { setShowAdd(false); setError(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                  Annulla
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};
