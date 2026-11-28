import React, { useEffect, useMemo, useState } from 'react';
import {
  LeaveEntry, LeavePerson, LeaveMe, Closure, Holiday, Country,
  LEAVE_TYPES, SCOPES, MONTHS, WEEKDAYS, WEEKDAYS_SHORT, PERIOD_LABELS,
  ymd, daysInMonth, weekday, isWeekend, todayStr, initials, fmtRange, fmtDate, fmtDays,
} from '../../utils/ferie';

// Used by pages/Ferie.tsx: month grid of collaborators × days, with Italian and
// Asian holidays, supplier closures and the number of people in the office.
interface Props {
  year: number;
  month: number;
  me: LeaveMe;
  people: LeavePerson[];
  entries: LeaveEntry[];
  closures: Closure[];
  holidays: Holiday[];
  countries: Country[];
  showAsia: boolean;
  onNewLeave: (userId: string, start: string, end: string) => void;
  onEditLeave: (e: LeaveEntry) => void;
  onEditClosure: (c: Closure) => void;
  onNewClosure: (start: string) => void;
}

interface Sel { userId: string; anchor: string; current: string }

export const FeriePlanner: React.FC<Props> = ({
  year, month, me, people, entries, closures, holidays, countries, showAsia,
  onNewLeave, onEditLeave, onEditClosure, onNewClosure,
}) => {
  const today = todayStr();
  const n = daysInMonth(year, month);
  const days = useMemo(() => Array.from({ length: n }, (_, i) => ymd(year, month, i + 1)), [year, month, n]);
  const from = days[0];
  const to = days[n - 1];
  const flags = useMemo(() => new Map(countries.map(c => [c.code, c])), [countries]);

  const [sel, setSel] = useState<Sel | null>(null);
  const [focusDay, setFocusDay] = useState<string>(today >= from && today <= to ? today : from);
  useEffect(() => { setFocusDay(today >= from && today <= to ? today : from); }, [from, to, today]);

  // Finish a drag-selection anywhere on the page
  useEffect(() => {
    if (!sel) return;
    const up = () => {
      const [a, b] = sel.anchor <= sel.current ? [sel.anchor, sel.current] : [sel.current, sel.anchor];
      setSel(null);
      onNewLeave(sel.userId, a, b);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [sel, onNewLeave]);

  const itHol = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of holidays) if (h.country === 'IT') m.set(h.date, [...(m.get(h.date) || []), h]);
    return m;
  }, [holidays]);
  const asiaHol = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    for (const h of holidays) if (h.country !== 'IT') m.set(h.date, [...(m.get(h.date) || []), h]);
    return m;
  }, [holidays]);

  // person|date → entries (a day can have morning + afternoon)
  const cellMap = useMemo(() => {
    const m = new Map<string, LeaveEntry[]>();
    for (const e of entries) {
      if (e.end_date < from || e.start_date > to) continue;
      for (const d of days) {
        if (d < e.start_date || d > e.end_date) continue;
        const k = `${e.user_id}|${d}`;
        m.set(k, [...(m.get(k) || []), e]);
      }
    }
    return m;
  }, [entries, days, from, to]);

  const monthClosures = useMemo(() => closures.filter(c => c.start_date <= to && c.end_date >= from), [closures, from, to]);
  const closureRows = useMemo(() => {
    const byCompany = new Map<string, { name: string; list: Closure[] }>();
    for (const c of monthClosures) {
      const row = byCompany.get(c.company_id) || { name: c.company_name, list: [] };
      row.list.push(c);
      byCompany.set(c.company_id, row);
    }
    return [...byCompany.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => a.name.localeCompare(b.name));
  }, [monthClosures]);

  const isOff = (d: string) => isWeekend(d) || itHol.has(d);
  const presentCount = (d: string) => people.filter(p => {
    const list = cellMap.get(`${p.id}|${d}`) || [];
    return !list.some(e => e.period === 'full') && list.length < 2;
  }).length;

  const canEditRow = (userId: string) => me.admin || userId === me.id;
  const inSel = (userId: string, d: string) => {
    if (!sel || sel.userId !== userId) return false;
    const [a, b] = sel.anchor <= sel.current ? [sel.anchor, sel.current] : [sel.current, sel.anchor];
    return d >= a && d <= b;
  };

  const dayClass = (d: string) => [
    isWeekend(d) ? 'we' : '',
    itHol.has(d) ? 'hol' : '',
    d === today ? 'today' : '',
    d === focusDay ? 'focus' : '',
  ].filter(Boolean).join(' ');

  // ---- Focused day details ----
  const focusAbsent = people
    .map(p => ({ p, list: cellMap.get(`${p.id}|${focusDay}`) || [] }))
    .filter(x => x.list.length);
  const focusClosures = monthClosures.filter(c => c.start_date <= focusDay && c.end_date >= focusDay);
  const focusHol = [...(itHol.get(focusDay) || []), ...(asiaHol.get(focusDay) || [])];

  return (
    <div className="fe-planner-wrap">
      <div className="fe-grid-scroll">
        <table className="fe-grid" style={{ ['--days' as any]: n }}>
          <thead>
            <tr className="fe-row-days">
              <th className="fe-sticky fe-corner">{MONTHS[month]} {year}</th>
              {days.map(d => (
                <th key={d} className={dayClass(d)} onClick={() => setFocusDay(d)} title={fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
                  <span className="wd">{WEEKDAYS_SHORT[weekday(d)]}</span>
                  <span className="dn">{Number(d.slice(8))}</span>
                </th>
              ))}
            </tr>
            <tr className="fe-row-hol">
              <th className="fe-sticky"><span className="fe-row-label">🇮🇹 Festività Italia</span></th>
              {days.map(d => {
                const list = itHol.get(d);
                return (
                  <td key={d} className={dayClass(d)} onClick={() => setFocusDay(d)} title={list?.map(h => h.name).join(' · ')}>
                    {list && <span className="fe-hol-dot" />}
                  </td>
                );
              })}
            </tr>
            {showAsia && (
              <tr className="fe-row-asia">
                <th className="fe-sticky"><span className="fe-row-label">🌏 Festività Asia</span></th>
                {days.map(d => {
                  const list = asiaHol.get(d) || [];
                  const codes = [...new Set(list.map(h => h.country))];
                  return (
                    <td key={d} className={dayClass(d)} onClick={() => setFocusDay(d)}
                      title={list.map(h => `${flags.get(h.country)?.name || h.country}: ${h.name}`).join('\n')}>
                      {codes.length > 0 && (
                        <span className="fe-asia-cell">
                          {codes.slice(0, 2).map(c => <span key={c} className="fe-flag">{flags.get(c)?.flag || c}</span>)}
                          {codes.length > 2 && <span className="fe-more">+{codes.length - 2}</span>}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            )}
          </thead>

          <tbody>
            <tr className="fe-section"><th className="fe-sticky" colSpan={1}>Collaboratori</th><td colSpan={n} /></tr>
            {people.map(p => (
              <tr key={p.id} className={`fe-person ${p.id === me.id ? 'mine' : ''}`}>
                <th className="fe-sticky">
                  <span className="fe-avatar" style={{ background: p.color }}>{initials(p.name)}</span>
                  <span className="fe-person-name">{p.name}</span>
                </th>
                {days.map(d => {
                  const list = cellMap.get(`${p.id}|${d}`) || [];
                  const editable = canEditRow(p.id);
                  if (!list.length) {
                    return (
                      <td
                        key={d}
                        className={`${dayClass(d)} fe-cell ${editable ? 'editable' : ''} ${inSel(p.id, d) ? 'selecting' : ''}`}
                        onMouseDown={e => { if (editable && e.button === 0) { e.preventDefault(); setSel({ userId: p.id, anchor: d, current: d }); } }}
                        onMouseEnter={() => { if (sel && sel.userId === p.id) setSel({ ...sel, current: d }); }}
                        onClick={() => setFocusDay(d)}
                      />
                    );
                  }
                  const full = list.find(e => e.period === 'full');
                  const shown = full ? [full] : list;
                  return (
                    <td key={d} className={`${dayClass(d)} fe-cell has`} onClick={() => setFocusDay(d)}>
                      <div className={`fe-bar-wrap ${full ? 'full' : 'half'}`}>
                        {shown.map(e => {
                          const t = LEAVE_TYPES[e.type] || LEAVE_TYPES.altro;
                          const start = e.start_date === d || d === from;
                          const end = e.end_date === d || d === to;
                          const off = isOff(d) && e.start_date !== e.end_date;
                          return (
                            <button
                              key={e.id}
                              type="button"
                              className={`fe-bar ${start ? 'start' : ''} ${end ? 'end' : ''} ${off ? 'off' : ''} ${e.period}`}
                              style={{ ['--bar' as any]: t.color, ['--bar-soft' as any]: t.soft }}
                              title={`${p.name} · ${t.label}${e.period !== 'full' ? ' (' + PERIOD_LABELS[e.period].toLowerCase() + ')' : ''}\n${fmtRange(e.start_date, e.end_date)} · ${fmtDays(e.working_days)} gg lav.${e.note ? '\n' + e.note : ''}`}
                              onClick={ev => { ev.stopPropagation(); setFocusDay(d); if (canEditRow(p.id)) onEditLeave(e); }}
                            >
                              {start && !off && <span>{t.label[0]}{e.period === 'am' ? '·M' : e.period === 'pm' ? '·P' : ''}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!people.length && (
              <tr><th className="fe-sticky fe-muted">Nessun collaboratore</th><td colSpan={n} className="fe-muted fe-pad">Attiva i collaboratori in “Impostazioni”.</td></tr>
            )}

            <tr className="fe-presence">
              <th className="fe-sticky"><span className="fe-row-label">In ufficio</span></th>
              {days.map(d => {
                if (isOff(d)) return <td key={d} className={dayClass(d)} />;
                const c = presentCount(d);
                const ratio = people.length ? c / people.length : 1;
                return <td key={d} className={`${dayClass(d)} ${ratio < 0.5 ? 'low' : ratio < 0.8 ? 'mid' : ''}`}>{c}</td>;
              })}
            </tr>

            <tr className="fe-section">
              <th className="fe-sticky">
                Chiusure aziende
                <button className="fe-mini-add" onClick={() => onNewClosure(focusDay)} title="Nuova chiusura">+</button>
              </th>
              <td colSpan={n} />
            </tr>
            {closureRows.map(r => (
              <tr key={r.id} className="fe-company">
                <th className="fe-sticky"><span className="fe-company-icon">🏭</span><span className="fe-person-name">{r.name}</span></th>
                {days.map(d => {
                  const c = r.list.find(x => x.start_date <= d && x.end_date >= d);
                  if (!c) return <td key={d} className={dayClass(d)} onClick={() => setFocusDay(d)} />;
                  const total = c.scopes.includes('totale');
                  const start = c.start_date === d || d === from;
                  return (
                    <td key={d} className={`${dayClass(d)} fe-cell has`}>
                      <button
                        type="button"
                        className={`fe-closure ${total ? 'total' : ''} ${start ? 'start' : ''} ${c.end_date === d || d === to ? 'end' : ''}`}
                        title={`${r.name}\n${c.scopes.map(s => SCOPES[s]?.label || s).join(', ')}\n${fmtRange(c.start_date, c.end_date)}${c.note ? '\n' + c.note : ''}`}
                        onClick={() => { setFocusDay(d); onEditClosure(c); }}
                      >
                        {total ? null : c.scopes.map(s => <i key={s} style={{ background: SCOPES[s]?.color }} />)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!closureRows.length && (
              <tr><th className="fe-sticky fe-muted">—</th><td colSpan={n} className="fe-muted fe-pad">Nessuna chiusura aziendale in {MONTHS[month].toLowerCase()}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="fe-legend">
        {Object.entries(LEAVE_TYPES).map(([k, t]) => (
          <span key={k}><i style={{ background: t.color }} />{t.label}</span>
        ))}
        <span><i className="half" />Mezza giornata</span>
        <span className="sep" />
        {Object.entries(SCOPES).map(([k, s]) => (
          <span key={k}><i className="sq" style={{ background: s.color }} />{s.label}</span>
        ))}
        <span className="sep" />
        <span><i className="hol" />Festivo IT</span>
        <span className="fe-hint">Trascina sulla tua riga per segnare più giorni</span>
      </div>

      <div className="fe-day-panel">
        <div className="fe-day-title">
          <strong>{WEEKDAYS[weekday(focusDay)]} {fmtDate(focusDay, { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
          {isOff(focusDay) && <span className="fe-pill red">{itHol.has(focusDay) ? 'Festivo' : 'Weekend'}</span>}
          {focusDay === today && <span className="fe-pill">Oggi</span>}
        </div>
        <div className="fe-day-cols">
          <div>
            <h4>Assenti</h4>
            {focusAbsent.length ? focusAbsent.map(({ p, list }) => (
              <div key={p.id} className="fe-day-item">
                <span className="fe-avatar sm" style={{ background: p.color }}>{initials(p.name)}</span>
                <span>{p.name}</span>
                {list.map(e => (
                  <span key={e.id} className="fe-tag" style={{ background: LEAVE_TYPES[e.type]?.soft, color: LEAVE_TYPES[e.type]?.text }}>
                    {LEAVE_TYPES[e.type]?.label}{e.period !== 'full' ? ` · ${PERIOD_LABELS[e.period].toLowerCase()}` : ''}
                  </span>
                ))}
              </div>
            )) : <p className="fe-muted">Tutti presenti</p>}
          </div>
          <div>
            <h4>Festività</h4>
            {focusHol.length ? focusHol.map((h, i) => (
              <div key={i} className="fe-day-item">
                <span className="fe-flag">{flags.get(h.country)?.flag}</span>
                <span><strong>{flags.get(h.country)?.name}</strong> — {h.name}</span>
              </div>
            )) : <p className="fe-muted">Nessuna</p>}
          </div>
          <div>
            <h4>Aziende chiuse</h4>
            {focusClosures.length ? focusClosures.map(c => (
              <div key={c.id} className="fe-day-item clickable" onClick={() => onEditClosure(c)}>
                <span>🏭</span>
                <span><strong>{c.company_name}</strong></span>
                {c.scopes.map(s => <span key={s} className="fe-tag" style={{ background: SCOPES[s]?.color, color: '#fff' }}>{SCOPES[s]?.label}</span>)}
              </div>
            )) : <p className="fe-muted">Nessuna</p>}
          </div>
        </div>
      </div>
    </div>
  );
};
