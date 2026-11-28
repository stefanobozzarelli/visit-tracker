import React, { useEffect, useMemo, useState } from 'react';
import {
  LeaveEntry, LeavePerson, LeaveMe, Closure, LeaveCompany,
  LEAVE_TYPES, SCOPES, PERIOD_LABELS, workingDays, fmtDays, errorMessage,
} from '../../utils/ferie';
import { apiService } from '../../services/api';

// ---------- Shell ----------
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, footer, wide }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fe-modal-backdrop" onMouseDown={onClose}>
      <div className={`fe-modal ${wide ? 'wide' : ''}`} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="fe-modal-head">
          <h3>{title}</h3>
          <button className="fe-icon-btn" onClick={onClose} aria-label="Chiudi">✕</button>
        </div>
        <div className="fe-modal-body">{children}</div>
        {footer && <div className="fe-modal-foot">{footer}</div>}
      </div>
    </div>
  );
};

// ---------- Leave ----------
export interface LeaveDraft { id?: string; user_id: string; start_date: string; end_date: string; type: string; period: 'full' | 'am' | 'pm'; note: string }

export const LeaveModal: React.FC<{
  draft: LeaveDraft;
  me: LeaveMe;
  people: LeavePerson[];
  officeHolidays: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}> = ({ draft, me, people, officeHolidays, onClose, onSaved }) => {
  const [d, setD] = useState<LeaveDraft>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = !!draft.id;
  const single = d.start_date === d.end_date;
  const days = useMemo(
    () => (d.start_date && d.end_date && d.end_date >= d.start_date ? workingDays(d.start_date, d.end_date, single ? d.period : 'full', officeHolidays) : 0),
    [d.start_date, d.end_date, d.period, single, officeHolidays],
  );

  const set = (patch: Partial<LeaveDraft>) => setD(prev => {
    const next = { ...prev, ...patch };
    if (patch.start_date && (!next.end_date || next.end_date < patch.start_date)) next.end_date = patch.start_date;
    if (next.start_date !== next.end_date) next.period = 'full';
    return next;
  });

  const save = async () => {
    setError('');
    if (!d.start_date || !d.end_date) return setError('Indica le date');
    if (d.end_date < d.start_date) return setError('La data di fine è prima di quella di inizio');
    setSaving(true);
    try {
      const body = { user_id: d.user_id, start_date: d.start_date, end_date: d.end_date, type: d.type, period: single ? d.period : 'full', note: d.note };
      if (editing) await apiService.updateLeave(d.id!, body);
      else await apiService.createLeave(body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing || !window.confirm('Eliminare questa assenza?')) return;
    setSaving(true);
    try {
      await apiService.deleteLeave(d.id!);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? 'Modifica assenza' : 'Nuova assenza'}
      onClose={onClose}
      footer={<>
        {editing && <button className="fe-btn danger ghost" onClick={remove} disabled={saving}>Elimina</button>}
        <span className="fe-spacer" />
        <button className="fe-btn ghost" onClick={onClose} disabled={saving}>Annulla</button>
        <button className="fe-btn primary" onClick={save} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva'}</button>
      </>}
    >
      {me.admin ? (
        <label className="fe-field">
          <span>Collaboratore</span>
          <select value={d.user_id} onChange={e => set({ user_id: e.target.value })}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      ) : (
        <div className="fe-field"><span>Collaboratore</span><div className="fe-static">{people.find(p => p.id === d.user_id)?.name || me.name}</div></div>
      )}

      <div className="fe-field">
        <span>Tipo</span>
        <div className="fe-type-picker">
          {Object.entries(LEAVE_TYPES).map(([k, t]) => (
            <button
              key={k}
              type="button"
              className={`fe-type-chip ${d.type === k ? 'active' : ''}`}
              style={{ ['--chip' as any]: t.color, ['--chip-soft' as any]: t.soft }}
              onClick={() => set({ type: k })}
            >
              <i />{t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fe-row2">
        <label className="fe-field">
          <span>Dal</span>
          <input type="date" value={d.start_date} onChange={e => set({ start_date: e.target.value })} />
        </label>
        <label className="fe-field">
          <span>Al</span>
          <input type="date" value={d.end_date} min={d.start_date} onChange={e => set({ end_date: e.target.value })} />
        </label>
      </div>

      {single && (
        <div className="fe-field">
          <span>Durata</span>
          <div className="fe-segmented">
            {(['full', 'am', 'pm'] as const).map(p => (
              <button key={p} type="button" className={d.period === p ? 'active' : ''} onClick={() => set({ period: p })}>{PERIOD_LABELS[p]}</button>
            ))}
          </div>
        </div>
      )}

      <label className="fe-field">
        <span>Note <em>(facoltative)</em></span>
        <textarea rows={2} value={d.note} onChange={e => set({ note: e.target.value })} placeholder="Es. viaggio, visita medica…" />
      </label>

      <div className="fe-count">
        <strong>{fmtDays(days)}</strong> {days === 1 ? 'giorno lavorativo' : 'giorni lavorativi'}
        <small>sabati, domeniche e festività italiane esclusi</small>
      </div>
      {error && <div className="fe-error">{error}</div>}
    </Modal>
  );
};

// ---------- Company closure ----------
export interface ClosureDraft { id?: string; company_id: string; start_date: string; end_date: string; scopes: string[]; note: string }

export const ClosureModal: React.FC<{
  draft: ClosureDraft;
  companies: LeaveCompany[];
  canDelete: boolean;
  onClose: () => void;
  onSaved: () => void;
}> = ({ draft, companies, canDelete, onClose, onSaved }) => {
  const [d, setD] = useState<ClosureDraft>(draft);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const editing = !!draft.id;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? companies.filter(c => c.name.toLowerCase().includes(q)) : companies;
  }, [companies, query]);

  const toggleScope = (s: string) => setD(prev => {
    if (s === 'totale') return { ...prev, scopes: prev.scopes.includes('totale') ? [] : ['totale'] };
    const rest = prev.scopes.filter(x => x !== 'totale');
    return { ...prev, scopes: rest.includes(s) ? rest.filter(x => x !== s) : [...rest, s] };
  });

  const save = async () => {
    setError('');
    if (!d.company_id) return setError('Scegli l\'azienda');
    if (!d.scopes.length) return setError('Indica cosa è chiuso');
    if (!d.start_date || !d.end_date || d.end_date < d.start_date) return setError('Controlla le date');
    setSaving(true);
    try {
      const body = { company_id: d.company_id, start_date: d.start_date, end_date: d.end_date, scopes: d.scopes, note: d.note };
      if (editing) await apiService.updateClosure(d.id!, body);
      else await apiService.createClosure(body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Eliminare questa chiusura?')) return;
    setSaving(true);
    try {
      await apiService.deleteClosure(d.id!);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const selected = companies.find(c => c.id === d.company_id);

  return (
    <Modal
      title={editing ? 'Modifica chiusura azienda' : 'Nuova chiusura azienda'}
      onClose={onClose}
      footer={<>
        {editing && canDelete && <button className="fe-btn danger ghost" onClick={remove} disabled={saving}>Elimina</button>}
        <span className="fe-spacer" />
        <button className="fe-btn ghost" onClick={onClose} disabled={saving}>Annulla</button>
        <button className="fe-btn primary" onClick={save} disabled={saving}>{saving ? 'Salvataggio…' : 'Salva'}</button>
      </>}
    >
      <div className="fe-field">
        <span>Azienda</span>
        {selected ? (
          <div className="fe-picked">
            <strong>{selected.name}</strong>{selected.country && <small>{selected.country}</small>}
            <button type="button" className="fe-link" onClick={() => setD(p => ({ ...p, company_id: '' }))}>cambia</button>
          </div>
        ) : (
          <>
            <input autoFocus placeholder="Cerca azienda…" value={query} onChange={e => setQuery(e.target.value)} />
            <div className="fe-picklist">
              {filtered.slice(0, 80).map(c => (
                <button type="button" key={c.id} onClick={() => { setD(p => ({ ...p, company_id: c.id })); setQuery(''); }}>
                  {c.name}<small>{c.country}</small>
                </button>
              ))}
              {!filtered.length && <div className="fe-empty-small">Nessuna azienda trovata</div>}
            </div>
          </>
        )}
      </div>

      <div className="fe-field">
        <span>Cosa è chiuso</span>
        <div className="fe-scope-picker">
          {Object.entries(SCOPES).map(([k, s]) => (
            <button
              key={k}
              type="button"
              className={`fe-scope-chip ${d.scopes.includes(k) ? 'active' : ''}`}
              style={{ ['--chip' as any]: s.color }}
              onClick={() => toggleScope(k)}
            >
              <span className="fe-check">{d.scopes.includes(k) ? '✓' : ''}</span>{s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="fe-row2">
        <label className="fe-field">
          <span>Dal</span>
          <input type="date" value={d.start_date} onChange={e => { const v = e.target.value; setD(p => ({ ...p, start_date: v, end_date: p.end_date && p.end_date >= v ? p.end_date : v })); }} />
        </label>
        <label className="fe-field">
          <span>Al</span>
          <input type="date" value={d.end_date} min={d.start_date} onChange={e => { const v = e.target.value; setD(p => ({ ...p, end_date: v })); }} />
        </label>
      </div>

      <label className="fe-field">
        <span>Note <em>(facoltative)</em></span>
        <textarea rows={2} value={d.note} onChange={e => { const v = e.target.value; setD(p => ({ ...p, note: v })); }} placeholder="Es. ultimo ritiro merce il 20/12, campionature dal 7/1…" />
      </label>
      {error && <div className="fe-error">{error}</div>}
    </Modal>
  );
};

export const closureToDraft = (c: Closure): ClosureDraft => ({ id: c.id, company_id: c.company_id, start_date: c.start_date, end_date: c.end_date, scopes: c.scopes, note: c.note || '' });
export const entryToDraft = (e: LeaveEntry): LeaveDraft => ({ id: e.id, user_id: e.user_id, start_date: e.start_date, end_date: e.end_date, type: e.type, period: e.period, note: e.note || '' });
