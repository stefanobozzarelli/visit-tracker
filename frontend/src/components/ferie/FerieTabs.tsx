import React, { useEffect, useMemo, useState } from 'react';
import {
  LeaveEntry, LeavePerson, LeaveMe, Closure, Holiday, Country,
  LEAVE_TYPES, SCOPES, MONTHS, PERIOD_LABELS,
  fmtRange, fmtDate, fmtDays, initials, errorMessage, todayStr, weekday, WEEKDAYS,
} from '../../utils/ferie';
import { apiService } from '../../services/api';
import { config } from '../../config';

// ============ Elenco assenze + riepilogo per persona ============
export const ListTab: React.FC<{
  year: number; me: LeaveMe; people: LeavePerson[]; entries: LeaveEntry[];
  onEdit: (e: LeaveEntry) => void;
}> = ({ year, me, people, entries, onEdit }) => {
  const [person, setPerson] = useState<string>('');
  const [type, setType] = useState<string>('');
  const byId = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);

  const yearEntries = useMemo(
    () => entries.filter(e => e.start_date <= `${year}-12-31` && e.end_date >= `${year}-01-01`),
    [entries, year],
  );
  const rows = yearEntries
    .filter(e => (!person || e.user_id === person) && (!type || e.type === type))
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  const summary = useMemo(() => people.map(p => {
    const t: Record<string, number> = {};
    for (const e of yearEntries) if (e.user_id === p.id) t[e.type] = (t[e.type] || 0) + e.working_days;
    return { p, t, total: Object.values(t).reduce((a, b) => a + b, 0) };
  }), [people, yearEntries]);

  return (
    <div className="fe-stack">
      <section className="fe-card">
        <div className="fe-card-head"><h3>Riepilogo {year}</h3><small>giorni lavorativi</small></div>
        <div className="fe-table-scroll">
          <table className="fe-table">
            <thead>
              <tr>
                <th>Collaboratore</th>
                {Object.entries(LEAVE_TYPES).map(([k, t]) => <th key={k} className="num"><i className="fe-dot" style={{ background: t.color }} />{t.label}</th>)}
                <th className="num">Totale</th>
              </tr>
            </thead>
            <tbody>
              {summary.map(({ p, t, total }) => (
                <tr key={p.id} className={p.id === me.id ? 'mine' : ''}>
                  <td><span className="fe-avatar sm" style={{ background: p.color }}>{initials(p.name)}</span>{p.name}</td>
                  {Object.keys(LEAVE_TYPES).map(k => <td key={k} className="num">{t[k] ? fmtDays(t[k]) : <span className="fe-muted">–</span>}</td>)}
                  <td className="num"><strong>{fmtDays(total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fe-card">
        <div className="fe-card-head">
          <h3>Assenze {year}</h3>
          <div className="fe-filters">
            <select value={person} onChange={e => setPerson(e.target.value)}>
              <option value="">Tutti i collaboratori</option>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select value={type} onChange={e => setType(e.target.value)}>
              <option value="">Tutti i tipi</option>
              {Object.entries(LEAVE_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </div>
        </div>
        {rows.length ? (
          <div className="fe-table-scroll">
            <table className="fe-table">
              <thead><tr><th>Collaboratore</th><th>Tipo</th><th>Periodo</th><th className="num">Giorni</th><th>Note</th><th /></tr></thead>
              <tbody>
                {rows.map(e => {
                  const p = byId.get(e.user_id);
                  const t = LEAVE_TYPES[e.type] || LEAVE_TYPES.altro;
                  const can = me.admin || e.user_id === me.id;
                  return (
                    <tr key={e.id} className={e.end_date < todayStr() ? 'past' : ''}>
                      <td><span className="fe-avatar sm" style={{ background: p?.color }}>{initials(p?.name || '?')}</span>{p?.name || '—'}</td>
                      <td><span className="fe-tag" style={{ background: t.soft, color: t.text }}>{t.label}</span></td>
                      <td>{fmtRange(e.start_date, e.end_date)}{e.period !== 'full' && <small className="fe-muted"> · {PERIOD_LABELS[e.period].toLowerCase()}</small>}</td>
                      <td className="num">{fmtDays(e.working_days)}</td>
                      <td className="fe-note">{e.note}</td>
                      <td className="act">{can && <button className="fe-btn ghost sm" onClick={() => onEdit(e)}>Modifica</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <div className="fe-empty">Nessuna assenza {person || type ? 'con questi filtri' : `nel ${year}`}.</div>}
      </section>
    </div>
  );
};

// ============ Chiusure aziende ============
export const ClosuresTab: React.FC<{
  year: number; closures: Closure[];
  onNew: () => void; onEdit: (c: Closure) => void;
}> = ({ year, closures, onNew, onEdit }) => {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('');
  const today = todayStr();
  const list = closures
    .filter(c => c.start_date <= `${year}-12-31` && c.end_date >= `${year}-01-01`)
    .filter(c => !q || c.company_name.toLowerCase().includes(q.toLowerCase()))
    .filter(c => !scope || c.scopes.includes(scope) || c.scopes.includes('totale'))
    .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.company_name.localeCompare(b.company_name));
  const closedNow = closures.filter(c => c.start_date <= today && c.end_date >= today);

  return (
    <div className="fe-stack">
      {closedNow.length > 0 && (
        <div className="fe-banner">
          <strong>Chiuse oggi:</strong>
          {closedNow.map(c => (
            <button key={c.id} className="fe-chip" onClick={() => onEdit(c)}>
              {c.company_name} · {c.scopes.map(s => SCOPES[s]?.label).join(', ')}
            </button>
          ))}
        </div>
      )}
      <section className="fe-card">
        <div className="fe-card-head">
          <h3>Chiusure aziende {year}</h3>
          <div className="fe-filters">
            <input placeholder="Cerca azienda…" value={q} onChange={e => setQ(e.target.value)} />
            <select value={scope} onChange={e => setScope(e.target.value)}>
              <option value="">Tutti i reparti</option>
              {Object.entries(SCOPES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
            <button className="fe-btn primary" onClick={onNew}>+ Nuova chiusura</button>
          </div>
        </div>
        {list.length ? (
          <div className="fe-table-scroll">
            <table className="fe-table">
              <thead><tr><th>Azienda</th><th>Periodo</th><th>Chiuso</th><th>Note</th><th /></tr></thead>
              <tbody>
                {list.map(c => (
                  <tr key={c.id} className={c.end_date < today ? 'past' : c.start_date <= today ? 'now' : ''}>
                    <td><strong>{c.company_name}</strong>{c.company_country && <small className="fe-muted"> · {c.company_country}</small>}</td>
                    <td>{fmtRange(c.start_date, c.end_date)}</td>
                    <td>
                      <div className="fe-tags">
                        {c.scopes.map(s => <span key={s} className="fe-tag solid" style={{ background: SCOPES[s]?.color }}>{SCOPES[s]?.label}</span>)}
                      </div>
                    </td>
                    <td className="fe-note">{c.note}</td>
                    <td className="act"><button className="fe-btn ghost sm" onClick={() => onEdit(c)}>Apri</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="fe-empty">Nessuna chiusura {q || scope ? 'con questi filtri' : `nel ${year}`}. Segna qui quando un fornitore chiude uffici, produzione, spedizioni o campionature.</div>}
      </section>
    </div>
  );
};

// ============ Festività ============
export const HolidaysTab: React.FC<{
  year: number; me: LeaveMe; holidays: Holiday[]; countries: Country[]; onChanged: () => void;
}> = ({ year, me, holidays, countries, onChanged }) => {
  const [active, setActive] = useState<string[]>(countries.map(c => c.code));
  const [form, setForm] = useState({ country: 'KH', date: '', name: '' });
  const [error, setError] = useState('');
  const flags = useMemo(() => new Map(countries.map(c => [c.code, c])), [countries]);
  const today = todayStr();

  const list = holidays.filter(h => active.includes(h.country) && h.date.startsWith(String(year)));
  const byMonth = MONTHS.map((m, i) => ({ m, items: list.filter(h => Number(h.date.slice(5, 7)) === i + 1) }));
  const toggle = (c: string) => setActive(a => (a.includes(c) ? a.filter(x => x !== c) : [...a, c]));
  const next = holidays.filter(h => h.date >= today).slice(0, 8);

  const add = async () => {
    setError('');
    try {
      await apiService.createCustomHoliday(form);
      setForm(f => ({ ...f, date: '', name: '' }));
      onChanged();
    } catch (e) { setError(errorMessage(e)); }
  };
  const del = async (h: Holiday) => {
    if (!h.id || !window.confirm(`Eliminare “${h.name}”?`)) return;
    try { await apiService.deleteCustomHoliday(h.id); onChanged(); } catch (e) { alert(errorMessage(e)); }
  };

  return (
    <div className="fe-stack">
      <section className="fe-card">
        <div className="fe-card-head"><h3>Prossime festività</h3></div>
        <div className="fe-next">
          {next.map((h, i) => (
            <div key={i} className={`fe-next-item ${h.country === 'IT' ? 'it' : ''}`}>
              <div className="fe-next-date"><span>{fmtDate(h.date, { day: 'numeric' })}</span><small>{fmtDate(h.date, { month: 'short' })}</small></div>
              <div><div className="fe-next-country">{flags.get(h.country)?.flag} {flags.get(h.country)?.name}</div><div>{h.name}</div></div>
            </div>
          ))}
          {!next.length && <div className="fe-muted">—</div>}
        </div>
      </section>

      <section className="fe-card">
        <div className="fe-card-head">
          <h3>Festività {year}</h3>
          <div className="fe-filters">
            <button className="fe-link" onClick={() => setActive(countries.map(c => c.code))}>tutte</button>
            <button className="fe-link" onClick={() => setActive(['IT'])}>solo Italia</button>
          </div>
        </div>
        <div className="fe-country-chips">
          {countries.map(c => (
            <button key={c.code} className={`fe-chip ${active.includes(c.code) ? 'active' : ''}`} onClick={() => toggle(c.code)}>
              <span className="fe-flag">{c.flag}</span>{c.name}
            </button>
          ))}
        </div>
        <div className="fe-hol-months">
          {byMonth.filter(x => x.items.length).map(({ m, items }) => (
            <div key={m} className="fe-hol-month">
              <h4>{m}</h4>
              {items.map((h, i) => (
                <div key={i} className={`fe-hol-item ${h.country === 'IT' ? 'it' : ''} ${h.date < today ? 'past' : ''}`}>
                  <span className="fe-hol-day">{Number(h.date.slice(8))}<small>{WEEKDAYS[weekday(h.date)].slice(0, 3)}</small></span>
                  <span className="fe-flag" title={flags.get(h.country)?.name}>{flags.get(h.country)?.flag}</span>
                  <span className="fe-hol-name">{h.name}{h.source === 'custom' && <em> · aggiunta</em>}</span>
                  {h.source === 'custom' && me.admin && <button className="fe-icon-btn sm" onClick={() => del(h)} title="Elimina">✕</button>}
                </div>
              ))}
            </div>
          ))}
          {!list.length && <div className="fe-empty">Nessuna festività per i paesi scelti.</div>}
        </div>
      </section>

      {me.admin && (
        <section className="fe-card">
          <div className="fe-card-head"><h3>Aggiungi una festività</h3><small>per date mancanti o feste lunari degli anni futuri (es. Cambogia)</small></div>
          <div className="fe-inline-form">
            <select value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))}>
              {countries.map(c => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
            </select>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            <input placeholder="Nome della festività" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <button className="fe-btn primary" onClick={add} disabled={!form.date || !form.name.trim()}>Aggiungi</button>
          </div>
          {error && <div className="fe-error">{error}</div>}
        </section>
      )}
    </div>
  );
};

// ============ Google Calendar (iCal subscription) ============
function feedBase() {
  const base = config.API_BASE_URL.startsWith('http') ? config.API_BASE_URL : window.location.origin + config.API_BASE_URL;
  return base.replace(/\/$/, '');
}

export const GoogleTab: React.FC = () => {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [opts, setOpts] = useState({ l: true, mine: false, c: true, it: true, asia: true });

  useEffect(() => {
    apiService.getLeaveCalendarToken().then(r => setToken(r.data?.token || '')).catch(e => setError(errorMessage(e)));
  }, []);

  const url = useMemo(() => {
    if (!token) return '';
    const q = (Object.entries(opts) as [string, boolean][]).map(([k, v]) => `${k}=${v ? 1 : 0}`).join('&');
    return `${feedBase()}/leave/calendar/${token}.ics?${q}`;
  }, [token, opts]);
  const webcal = url.replace(/^https?:/, 'webcal:');
  const googleUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); } catch { window.prompt('Copia il link:', url); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const reset = async () => {
    if (!window.confirm('Creare un nuovo link? Quello vecchio smetterà di funzionare e dovrai ricollegare Google Calendar.')) return;
    try { const r = await apiService.getLeaveCalendarToken(true); setToken(r.data?.token || ''); } catch (e) { setError(errorMessage(e)); }
  };
  const opt = (k: keyof typeof opts, label: string, hint?: string) => (
    <label className="fe-check-row">
      <input type="checkbox" checked={opts[k]} onChange={e => setOpts(o => ({ ...o, [k]: e.target.checked }))} />
      <span>{label}{hint && <small>{hint}</small>}</span>
    </label>
  );

  return (
    <div className="fe-stack">
      <section className="fe-card fe-google">
        <div className="fe-card-head"><h3>Collega a Google Calendar</h3></div>
        <p>Ferie, chiusure aziendali e festività compaiono nel tuo Google Calendar (Gmail) e si aggiornano da sole.</p>
        <div className="fe-google-opts">
          {opt('l', 'Assenze')}
          {opts.l && opt('mine', 'Solo le mie', 'altrimenti quelle di tutto l’ufficio')}
          {opt('c', 'Chiusure aziende')}
          {opt('it', 'Festività italiane')}
          {opt('asia', 'Festività dei paesi asiatici')}
        </div>
        {error && <div className="fe-error">{error}</div>}
        {url && (
          <>
            <div className="fe-google-actions">
              <a className="fe-btn primary lg" href={googleUrl} target="_blank" rel="noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                Aggiungi a Google Calendar
              </a>
              <a className="fe-btn ghost" href={webcal}>Apple / Outlook</a>
            </div>
            <div className="fe-url">
              <input readOnly value={url} onFocus={e => e.currentTarget.select()} />
              <button className="fe-btn" onClick={copy}>{copied ? 'Copiato ✓' : 'Copia link'}</button>
            </div>
          </>
        )}
        <ol className="fe-steps">
          <li>Premi <strong>“Aggiungi a Google Calendar”</strong> e conferma con <strong>Aggiungi</strong>.</li>
          <li>Se non funziona: in Google Calendar (computer) vai su <strong>Altri calendari → + → Da URL</strong> e incolla il link.</li>
          <li>Google aggiorna i calendari esterni ogni qualche ora: una modifica fatta qui può comparire con un po’ di ritardo.</li>
        </ol>
        <p className="fe-muted fe-small">Il link è personale e segreto: non condividerlo. Se lo hai condiviso per errore, <button className="fe-link" onClick={reset}>crea un nuovo link</button>.</p>
      </section>
    </div>
  );
};

// ============ Impostazioni (responsabili ferie) ============
export const SettingsTab: React.FC<{ me: LeaveMe; onChanged: () => void }> = ({ me, onChanged }) => {
  const [list, setList] = useState<LeavePerson[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const load = () => apiService.getLeaveUsers().then(r => setList(r.data || [])).catch(e => setError(errorMessage(e)));
  useEffect(() => { load(); }, []);

  const update = async (p: LeavePerson, patch: any) => {
    setError('');
    try {
      const r = await apiService.updateLeaveUser(p.id, patch);
      setList(l => l.map(x => (x.id === p.id ? r.data : x)));
      onChanged();
    } catch (e) { setError(errorMessage(e)); }
  };
  const create = async () => {
    setError('');
    setBusy(true);
    try {
      await apiService.createLeaveUser(form);
      setForm({ name: '', email: '', password: '' });
      await load();
      onChanged();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  };
  const resetPw = async (p: LeavePerson) => {
    const pw = window.prompt(`Nuova password per ${p.name} (almeno 8 caratteri):`);
    if (!pw) return;
    try { await apiService.setLeaveUserPassword(p.id, pw); alert('Password aggiornata'); } catch (e) { alert(errorMessage(e)); }
  };

  const shown = list.filter(p => !q || (p.name + ' ' + p.email).toLowerCase().includes(q.toLowerCase()));
  const enabledCount = list.filter(p => p.leave_enabled).length;

  return (
    <div className="fe-stack">
      <section className="fe-card">
        <div className="fe-card-head">
          <h3>Collaboratori nel calendario <small className="fe-muted">({enabledCount})</small></h3>
          <div className="fe-filters"><input placeholder="Cerca…" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <p className="fe-muted fe-small">
          Attiva chi deve comparire nel calendario ferie. I <strong>responsabili</strong> possono segnare e modificare le ferie di tutti
          {me.master ? '' : ' (li nomina il master admin)'}.
        </p>
        {error && <div className="fe-error">{error}</div>}
        <div className="fe-table-scroll">
          <table className="fe-table">
            <thead><tr><th>Utente</th><th className="ctr">Nel calendario</th><th className="ctr">Colore</th><th className="ctr">Responsabile</th><th /></tr></thead>
            <tbody>
              {shown.map(p => (
                <tr key={p.id} className={p.leave_enabled ? '' : 'off'}>
                  <td>
                    <span className="fe-avatar sm" style={{ background: p.color }}>{initials(p.name)}</span>
                    <span><strong>{p.name}</strong><br /><small className="fe-muted">{p.email}{p.leave_only ? ' · solo Ferie' : ''}</small></span>
                  </td>
                  <td className="ctr"><label className="fe-switch"><input type="checkbox" checked={p.leave_enabled} onChange={e => update(p, { leave_enabled: e.target.checked })} /><span /></label></td>
                  <td className="ctr"><input className="fe-color" type="color" value={p.color} onChange={e => update(p, { leave_color: e.target.value })} /></td>
                  <td className="ctr">
                    {p.role === 'master_admin'
                      ? <span className="fe-pill">Master</span>
                      : <label className="fe-switch"><input type="checkbox" checked={p.leave_admin} disabled={!me.master} onChange={e => update(p, { leave_admin: e.target.checked })} /><span /></label>}
                  </td>
                  <td className="act">{p.leave_only && <button className="fe-btn ghost sm" onClick={() => resetPw(p)}>Password</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fe-card">
        <div className="fe-card-head"><h3>Nuovo collaboratore</h3><small>per chi non ha un account TradeFlow: vedrà solo la sezione Ferie</small></div>
        <div className="fe-inline-form">
          <input placeholder="Nome e cognome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input placeholder="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input placeholder="Password (min 8)" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <button className="fe-btn primary" onClick={create} disabled={busy || !form.name || !form.email || form.password.length < 8}>Crea</button>
        </div>
      </section>
    </div>
  );
};
