import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiService } from '../services/api';
import {
  LeaveEntry, LeavePerson, LeaveMe, Closure, Holiday, Country, LeaveCompany,
  MONTHS, LEAVE_TYPES, SCOPES, todayStr, addDays, ymd, daysInMonth, errorMessage, initials, fmtRange, fmtDate, fmtDays,
} from '../utils/ferie';
import { FeriePlanner } from '../components/ferie/FeriePlanner';
import { LeaveModal, LeaveDraft, ClosureModal, ClosureDraft, Modal, entryToDraft, closureToDraft } from '../components/ferie/FerieModals';
import { ListTab, ClosuresTab, HolidaysTab, GoogleTab, SettingsTab } from '../components/ferie/FerieTabs';
import { exportFerieExcel, exportFeriePdf } from '../utils/exportFerie';
import '../styles/Ferie.css';

type Tab = 'planner' | 'list' | 'closures' | 'holidays' | 'google' | 'settings';

interface Boot { me: LeaveMe; people: LeavePerson[]; companies: LeaveCompany[]; countries: Country[] }
interface YearData { entries: LeaveEntry[]; closures: Closure[]; holidays: Holiday[] }

const readPref = (k: string, def: string) => { try { return localStorage.getItem(k) ?? def; } catch { return def; } };
const writePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const Ferie: React.FC = () => {
  const now = new Date();
  const [boot, setBoot] = useState<Boot | null>(null);
  const [bootError, setBootError] = useState('');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [tab, setTab] = useState<Tab>(() => (readPref('ferie-tab', 'planner') as Tab));
  const [data, setData] = useState<YearData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [showAsia, setShowAsia] = useState(() => readPref('ferie-asia', '1') === '1');
  const [leaveDraft, setLeaveDraft] = useState<LeaveDraft | null>(null);
  const [closureDraft, setClosureDraft] = useState<ClosureDraft | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => writePref('ferie-tab', tab), [tab]);
  useEffect(() => writePref('ferie-asia', showAsia ? '1' : '0'), [showAsia]);

  const loadBoot = useCallback(async () => {
    try {
      const r = await apiService.leaveBootstrap();
      setBoot(r.data);
    } catch (e) {
      setBootError(errorMessage(e, 'Impossibile caricare il calendario ferie'));
    }
  }, []);

  const loadYear = useCallback(async (y: number) => {
    setLoading(true);
    setLoadError('');
    try {
      // The year plus a little margin, for periods across New Year
      const r = await apiService.leaveOverview(`${y - 1}-12-01`, `${y + 1}-01-31`);
      setData(r.data);
    } catch (e) {
      setLoadError(errorMessage(e, 'Impossibile caricare i dati'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadBoot(); }, [loadBoot]);
  useEffect(() => { if (boot) loadYear(year); }, [boot, year, loadYear]);

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const refresh = () => loadYear(year);

  const holidays = data?.holidays || [];
  const officeHolidays = useMemo(() => new Set(holidays.filter(h => h.country === 'IT').map(h => h.date)), [holidays]);

  const goMonth = (delta: number) => {
    let m = month + delta;
    let y = year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    setMonth(m);
    setYear(y);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const newLeave = useCallback((userId?: string, start?: string, end?: string) => {
    if (!boot) return;
    const s = start || todayStr();
    const uid = userId || (boot.me.enabled ? boot.me.id : boot.people[0]?.id);
    if (!uid) { flash('Prima attiva almeno un collaboratore in Impostazioni'); return; }
    setLeaveDraft({ user_id: uid, start_date: s, end_date: end || s, type: 'ferie', period: 'full', note: '' });
  }, [boot]);
  const newClosure = (start?: string) => {
    const s = start || todayStr();
    setClosureDraft({ company_id: '', start_date: s, end_date: s, scopes: ['totale'], note: '' });
  };

  if (bootError) {
    return (
      <div className="fe-page">
        <div className="fe-card fe-empty-state">
          <div className="fe-empty-icon">🏖️</div>
          <h2>Calendario ferie</h2>
          <p>{bootError}</p>
          <p className="fe-muted">Chiedi a un responsabile ferie di attivarti nel calendario.</p>
        </div>
      </div>
    );
  }
  if (!boot) return <div className="fe-page"><div className="fe-loading">Caricamento…</div></div>;

  const { me, people, companies, countries } = boot;
  const entries = data?.entries || [];
  const closures = data?.closures || [];
  const today = todayStr();
  const flags = new Map(countries.map(c => [c.code, c]));

  // ---- Top cards ----
  const absentToday = people
    .map(p => ({ p, list: entries.filter(e => e.user_id === p.id && e.start_date <= today && e.end_date >= today) }))
    .filter(x => x.list.length);
  const upcomingMine = entries
    .filter(e => e.user_id === me.id && e.end_date >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const closedToday = closures.filter(c => c.start_date <= today && c.end_date >= today);
  const horizon = addDays(today, 14);
  const asiaSoon = holidays.filter(h => h.country !== 'IT' && h.date >= today && h.date <= horizon);
  const asiaSoonCountries = [...new Set(asiaSoon.map(h => h.country))];

  const tabs: { key: Tab; label: string; admin?: boolean }[] = [
    { key: 'planner', label: 'Calendario' },
    { key: 'list', label: 'Elenco e riepilogo' },
    { key: 'closures', label: 'Chiusure aziende' },
    { key: 'holidays', label: 'Festività' },
    { key: 'google', label: 'Google Calendar' },
    { key: 'settings', label: 'Impostazioni', admin: true },
  ];
  const activeTab: Tab = tab === 'settings' && !me.admin ? 'planner' : tab;

  return (
    <div className="fe-page">
      <header className="fe-header">
        <div>
          <h1>Ferie Primula</h1>
          <p className="fe-sub">
            {me.admin ? 'Responsabile ferie: puoi segnare e modificare le assenze di tutti' : 'Segna le tue ferie e consulta quelle dei colleghi'}
          </p>
        </div>
        <div className="fe-header-actions">
          <button className="fe-btn ghost" onClick={() => setExportOpen(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Esporta Excel / PDF
          </button>
          <button className="fe-btn ghost" onClick={() => newClosure()}>+ Chiusura azienda</button>
          {(me.enabled || me.admin) && <button className="fe-btn primary" onClick={() => newLeave()}>+ Nuova assenza</button>}
        </div>
      </header>

      <div className="fe-cards">
        <div className="fe-stat">
          <div className="fe-stat-label">Assenti oggi</div>
          {absentToday.length ? (
            <div className="fe-faces">
              {absentToday.slice(0, 6).map(({ p, list }) => (
                <span key={p.id} className="fe-face" title={`${p.name} · ${LEAVE_TYPES[list[0].type]?.label}`}>
                  <span className="fe-avatar" style={{ background: p.color }}>{initials(p.name)}</span>
                  <span>{p.name.split(' ')[0]}</span>
                </span>
              ))}
              {absentToday.length > 6 && <span className="fe-more">+{absentToday.length - 6}</span>}
            </div>
          ) : <div className="fe-stat-value ok">Tutti in ufficio</div>}
        </div>
        <div className="fe-stat">
          <div className="fe-stat-label">Le mie prossime ferie</div>
          {upcomingMine ? (
            <button className="fe-stat-link" onClick={() => setLeaveDraft(entryToDraft(upcomingMine))}>
              <div className="fe-stat-value">{fmtRange(upcomingMine.start_date, upcomingMine.end_date)}</div>
              <small>{LEAVE_TYPES[upcomingMine.type]?.label} · {fmtDays(upcomingMine.working_days)} gg lavorativi</small>
            </button>
          ) : <div className="fe-stat-value muted">{me.enabled ? 'Nessuna in programma' : '—'}</div>}
        </div>
        <div className="fe-stat">
          <div className="fe-stat-label">Aziende chiuse oggi</div>
          {closedToday.length ? (
            <div className="fe-stat-list">
              {closedToday.slice(0, 3).map(c => (
                <button key={c.id} className="fe-stat-row" onClick={() => setClosureDraft(closureToDraft(c))}>
                  <strong>{c.company_name}</strong>
                  <span>{c.scopes.map(s => SCOPES[s]?.short).join(' · ')}</span>
                </button>
              ))}
              {closedToday.length > 3 && <small>e altre {closedToday.length - 3}</small>}
            </div>
          ) : <div className="fe-stat-value muted">Nessuna</div>}
        </div>
        <div className="fe-stat">
          <div className="fe-stat-label">Festività Asia · prossimi 14 giorni</div>
          {asiaSoon.length ? (
            <div className="fe-stat-list">
              {asiaSoonCountries.slice(0, 4).map(code => {
                const first = asiaSoon.find(h => h.country === code)!;
                return (
                  <div key={code} className="fe-stat-row static" title={asiaSoon.filter(h => h.country === code).map(h => `${fmtDate(h.date)} ${h.name}`).join('\n')}>
                    <span>{flags.get(code)?.flag} <strong>{flags.get(code)?.name}</strong></span>
                    <span>{fmtDate(first.date, { day: 'numeric', month: 'short' })}</span>
                  </div>
                );
              })}
              {asiaSoonCountries.length > 4 && <small>e altri {asiaSoonCountries.length - 4} paesi</small>}
            </div>
          ) : <div className="fe-stat-value muted">Nessuna</div>}
        </div>
      </div>

      <nav className="fe-tabs" role="tablist">
        {tabs.filter(t => !t.admin || me.admin).map(t => (
          <button key={t.key} role="tab" aria-selected={activeTab === t.key} className={activeTab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      {activeTab !== 'google' && activeTab !== 'settings' && (
        <div className="fe-toolbar">
          {activeTab === 'planner' ? (
            <div className="fe-nav">
              <button className="fe-icon-btn" onClick={() => goMonth(-1)} aria-label="Mese precedente">‹</button>
              <select value={month} onChange={e => setMonth(Number(e.target.value))} aria-label="Mese">
                {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Anno">
                {Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button className="fe-icon-btn" onClick={() => goMonth(1)} aria-label="Mese successivo">›</button>
              <button className="fe-btn ghost sm" onClick={goToday}>Oggi</button>
            </div>
          ) : (
            <div className="fe-nav">
              <button className="fe-icon-btn" onClick={() => setYear(year - 1)} aria-label="Anno precedente">‹</button>
              <strong className="fe-year">{year}</strong>
              <button className="fe-icon-btn" onClick={() => setYear(year + 1)} aria-label="Anno successivo">›</button>
            </div>
          )}
          {activeTab === 'planner' && (
            <label className="fe-toggle">
              <input type="checkbox" checked={showAsia} onChange={e => setShowAsia(e.target.checked)} />
              <span>Mostra festività Asia</span>
            </label>
          )}
          {loading && <span className="fe-muted fe-small">Aggiornamento…</span>}
        </div>
      )}

      {loadError && <div className="fe-error">{loadError} <button className="fe-link" onClick={refresh}>Riprova</button></div>}

      {activeTab === 'planner' && (
        <FeriePlanner
          year={year}
          month={month}
          me={me}
          people={people}
          entries={entries}
          closures={closures}
          holidays={holidays}
          countries={countries}
          showAsia={showAsia}
          onNewLeave={newLeave}
          onEditLeave={e => setLeaveDraft(entryToDraft(e))}
          onEditClosure={c => setClosureDraft(closureToDraft(c))}
          onNewClosure={s => newClosure(s)}
        />
      )}
      {activeTab === 'list' && <ListTab year={year} me={me} people={people} entries={entries} onEdit={e => setLeaveDraft(entryToDraft(e))} />}
      {activeTab === 'closures' && <ClosuresTab year={year} closures={closures} onNew={() => newClosure()} onEdit={c => setClosureDraft(closureToDraft(c))} />}
      {activeTab === 'holidays' && <HolidaysTab year={year} me={me} holidays={holidays} countries={countries} onChanged={refresh} />}
      {activeTab === 'google' && <GoogleTab />}
      {activeTab === 'settings' && <SettingsTab me={me} onChanged={() => { loadBoot(); refresh(); }} />}

      {leaveDraft && (
        <LeaveModal
          draft={leaveDraft}
          me={me}
          people={people}
          officeHolidays={officeHolidays}
          onClose={() => setLeaveDraft(null)}
          onSaved={() => { setLeaveDraft(null); flash('Salvato'); refresh(); }}
        />
      )}
      {closureDraft && (
        <ClosureModal
          draft={closureDraft}
          companies={companies}
          canDelete={me.admin || closures.find(c => c.id === closureDraft.id)?.created_by === me.id}
          onClose={() => setClosureDraft(null)}
          onSaved={() => { setClosureDraft(null); flash('Salvato'); refresh(); }}
        />
      )}
      {exportOpen && (
        <ExportModal
          year={year}
          month={month}
          onClose={() => setExportOpen(false)}
          onExport={async (format, from, to, label) => {
            const r = await apiService.leaveOverview(from, to);
            const payload = { from, to, label, people, countries, ...r.data };
            if (format === 'xlsx') exportFerieExcel(payload); else exportFeriePdf(payload);
          }}
        />
      )}
      {toast && <div className="fe-toast">{toast}</div>}
    </div>
  );
};

// ---- Export: period + format ----
const ExportModal: React.FC<{
  year: number; month: number; onClose: () => void;
  onExport: (format: 'xlsx' | 'pdf', from: string, to: string, label: string) => Promise<void>;
}> = ({ year, month, onClose, onExport }) => {
  const [mode, setMode] = useState<'month' | 'year' | 'custom'>('month');
  const [from, setFrom] = useState(ymd(year, month, 1));
  const [to, setTo] = useState(ymd(year, month, daysInMonth(year, month)));
  const [busy, setBusy] = useState<'' | 'xlsx' | 'pdf'>('');
  const [error, setError] = useState('');

  const range = (): [string, string, string] => {
    if (mode === 'month') return [ymd(year, month, 1), ymd(year, month, daysInMonth(year, month)), `${MONTHS[month]} ${year}`];
    if (mode === 'year') return [`${year}-01-01`, `${year}-12-31`, `Anno ${year}`];
    return [from, to, `${from}_${to}`];
  };
  const run = async (format: 'xlsx' | 'pdf') => {
    const [f, t, label] = range();
    if (!f || !t || t < f) return setError('Controlla il periodo');
    setError('');
    setBusy(format);
    try { await onExport(format, f, t, label); onClose(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(''); }
  };

  return (
    <Modal title="Esporta" onClose={onClose}>
      <div className="fe-field">
        <span>Periodo</span>
        <div className="fe-segmented">
          <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>{MONTHS[month]} {year}</button>
          <button className={mode === 'year' ? 'active' : ''} onClick={() => setMode('year')}>Anno {year}</button>
          <button className={mode === 'custom' ? 'active' : ''} onClick={() => setMode('custom')}>Altro periodo</button>
        </div>
      </div>
      {mode === 'custom' && (
        <div className="fe-row2">
          <label className="fe-field"><span>Dal</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label>
          <label className="fe-field"><span>Al</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
        </div>
      )}
      <p className="fe-muted fe-small">Contiene il calendario mese per mese, l’elenco delle assenze, il riepilogo per persona, le chiusure aziende e le festività.</p>
      <div className="fe-export-btns">
        <button className="fe-export-btn xlsx" onClick={() => run('xlsx')} disabled={!!busy}>
          <span className="fe-file-badge">XLS</span>
          <span><strong>Excel</strong><small>{busy === 'xlsx' ? 'Preparazione…' : 'Per filtrare e rielaborare'}</small></span>
        </button>
        <button className="fe-export-btn pdf" onClick={() => run('pdf')} disabled={!!busy}>
          <span className="fe-file-badge">PDF</span>
          <span><strong>PDF</strong><small>{busy === 'pdf' ? 'Preparazione…' : 'Da stampare o inviare'}</small></span>
        </button>
      </div>
      {error && <div className="fe-error">{error}</div>}
    </Modal>
  );
};

export default Ferie;
