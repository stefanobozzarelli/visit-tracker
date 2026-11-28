import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiService } from '../services/api';
import '../styles/Revenue.css';
import '../styles/Articles.css';
import { fmtNum, itNumberFormat } from '../utils/numberFormat';

/* ============================================================
   ARTICOLI — sales and prices of every single article,
   from invoice lines matched to the price lists by code
   ============================================================ */

const eur = (n: any, digits = 2) =>
  n === null || n === undefined ? '–' : itNumberFormat({ style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(Number(n));
const qty = (n: any) => (n === null || n === undefined ? '–' : itNumberFormat({ maximumFractionDigits: 2 }).format(Number(n)));
const pct = (n: any) => (n === null || n === undefined ? '–' : `${fmtNum(Number(n) * 100, { maximumFractionDigits: 1 })}%`);
const date = (d: any) => (d ? new Date(d).toLocaleDateString('it-IT') : '–');
const errorText = (err: any) => err?.response?.data?.error || err?.message || 'Errore';

type View = 'articles' | 'unmatched';

export const ArticlesTab: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [clientId, setClientId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [view, setView] = useState<View>('articles');
  const [summary, setSummary] = useState<any>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    Promise.all([apiService.getCompanies(), apiService.getClients()])
      .then(([c, cl]) => { setCompanies(c.data || []); setClients(cl.data || []); })
      .catch(console.error);
  }, []);

  const filters = useMemo(() => ({
    company_id: companyId || undefined,
    client_id: clientId || undefined,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  }), [companyId, clientId, startDate, endDate]);

  useEffect(() => {
    apiService.getArticlesSummary(filters).then(r => setSummary(r.data)).catch(console.error);
  }, [filters, reloadKey]);

  const matchedShare = summary && summary.lines ? summary.matched_lines / summary.lines : null;
  const revenueShare = summary && summary.revenue ? summary.matched_revenue / summary.revenue : null;

  return (
    <div className="revenue-tab-content">
      <div className="revenue-filters">
        <select value={companyId} onChange={e => setCompanyId(e.target.value)}>
          <option value="">Tutte le Aziende</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={clientId} onChange={e => setClientId(e.target.value)}>
          <option value="">Tutti i Clienti</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} title="Dal" />
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} title="Al" />
      </div>

      {summary && (
        <div className="stats-kpi-row">
          <div className="stats-kpi-card">
            <div className="stats-kpi-value">{fmtNum(summary.catalogue_articles)}</div>
            <div className="stats-kpi-label">ARTICOLI A LISTINO</div>
          </div>
          <div className="stats-kpi-card">
            <div className="stats-kpi-value">{fmtNum(summary.articles_sold)}</div>
            <div className="stats-kpi-label">ARTICOLI VENDUTI</div>
          </div>
          <div className="stats-kpi-card" title={`${summary.matched_lines} righe su ${summary.lines} · ${eur(summary.matched_revenue)} su ${eur(summary.revenue)}`}>
            <div className="stats-kpi-value">{pct(revenueShare)}</div>
            <div className="stats-kpi-label">FATTURATO RICONOSCIUTO A LISTINO</div>
            <div className="art-kpi-sub">{pct(matchedShare)} delle righe</div>
          </div>
          <div className="stats-kpi-card">
            <div className="stats-kpi-value">{pct(summary.avg_discount)}</div>
            <div className="stats-kpi-label">SCONTO MEDIO SU LISTINO</div>
          </div>
        </div>
      )}

      {summary && summary.catalogue_articles === 0 && (
        <div className="pl-message pl-message-ok">
          Non ci sono ancora listini caricati. Caricali nella scheda <strong>Listini</strong>: le righe delle fatture verranno
          collegate agli articoli tramite il codice, anche per le fatture già caricate.
        </div>
      )}

      <div className="art-view-switch">
        <button className={`admin-btn ${view === 'articles' ? 'admin-btn-primary' : 'admin-btn-secondary'}`} onClick={() => setView('articles')}>Articoli</button>
        <button className={`admin-btn ${view === 'unmatched' ? 'admin-btn-primary' : 'admin-btn-secondary'}`} onClick={() => setView('unmatched')}>
          Codici non trovati nei listini{summary?.unmatched_codes ? ` (${summary.unmatched_codes})` : ''}
        </button>
      </div>

      {view === 'articles'
        ? <ArticleList filters={filters} />
        : <UnmatchedList filters={filters} onLinked={() => setReloadKey(k => k + 1)} />}
    </div>
  );
};

/* ---------- Article list with detail ---------- */

const ArticleList: React.FC<{ filters: any }> = ({ filters }) => {
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [onlySold, setOnlySold] = useState(true);
  const [sort, setSort] = useState('revenue');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // The table can scroll sideways: keep the open detail as wide as the visible area
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visibleWidth, setVisibleWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setVisibleWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => { const t = setTimeout(() => { setSearchApplied(search); setPage(1); }, 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { setPage(1); }, [filters, onlySold, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiService.getArticles({ ...filters, search: searchApplied || undefined, only_sold: onlySold, sort, page, limit: 50 });
      setData(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filters, searchApplied, onlySold, sort, page]);
  useEffect(() => { load(); }, [load]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="revenue-card">
      <div className="art-toolbar">
        <input className="art-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cerca codice o descrizione…" />
        <label className="pl-checkbox"><input type="checkbox" checked={onlySold} onChange={e => setOnlySold(e.target.checked)} /> Solo articoli venduti</label>
        <select value={sort} onChange={e => setSort(e.target.value)}>
          <option value="revenue">Ordina per fatturato</option>
          <option value="quantity">Ordina per quantità</option>
          <option value="discount">Ordina per sconto medio</option>
          <option value="last">Ordina per ultima vendita</option>
          <option value="price">Ordina per prezzo di listino</option>
          <option value="code">Ordina per codice</option>
        </select>
        <span className="invoice-count art-count">{data ? `${fmtNum(data.total)} articoli` : ''}{loading ? ' · caricamento…' : ''}</span>
      </div>

      {data && data.articles.length === 0 ? (
        <div className="revenue-empty">
          <p>{onlySold ? 'Nessun articolo venduto con questi filtri' : 'Nessun articolo trovato'}</p>
          {onlySold && <p className="empty-hint">Togli "Solo articoli venduti" per vedere tutto il listino</p>}
        </div>
      ) : data && (
        <div className="pl-table-wrap" ref={wrapRef}>
          <table className="revenue-table art-table">
            <thead>
              <tr>
                <th>Codice</th><th>Descrizione</th><th>Azienda</th><th>UM</th>
                <th className="num">Listino</th><th className="num">Qtà venduta</th><th className="num">Fatturato</th>
                <th className="num">Prezzo medio netto</th><th className="num">Sconto medio</th><th className="num">Clienti</th><th>Ultima vendita</th>
              </tr>
            </thead>
            <tbody>
              {data.articles.map((a: any) => (
                <React.Fragment key={a.id}>
                  <tr className={`invoice-row ${openId === a.id ? 'expanded' : ''}`} onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                    <td className="article-code">{a.code}</td>
                    <td>{a.description || '–'}</td>
                    <td>{a.company_name}</td>
                    <td>{a.unit || '–'}</td>
                    <td className="num">{eur(a.list_price, 4)}</td>
                    <td className="num">{a.lines ? qty(a.quantity) : '–'}</td>
                    <td className="num">{a.lines ? eur(a.revenue) : '–'}</td>
                    <td className="num">{eur(a.avg_net_price, 4)}</td>
                    <td className="num">{pct(a.avg_discount)}</td>
                    <td className="num">{a.clients || '–'}</td>
                    <td>{date(a.last_date)}</td>
                  </tr>
                  {openId === a.id && (
                    <tr className="invoice-detail-row">
                      <td colSpan={11} className="art-detail-cell">
                        <div className="art-detail-pin" style={visibleWidth ? { width: visibleWidth - 24 } : undefined}>
                          <ArticleDetail id={a.id} filters={filters} />
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="art-pager">
          <button className="admin-btn admin-btn-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>‹ Precedenti</button>
          <span>Pagina {page} di {pages}</span>
          <button className="admin-btn admin-btn-secondary" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Successivi ›</button>
        </div>
      )}
    </div>
  );
};

/** Price of one purchase with its quantity and date (last / lowest / highest). */
const PricePoint: React.FC<{ p: any; withClient?: boolean }> = ({ p, withClient }) => {
  if (!p) return <span className="pl-muted">–</span>;
  return (
    <span className="art-point">
      <strong>{eur(p.price, 2)}</strong>
      <small>
        {qty(p.quantity)}{p.unit ? ` ${p.unit}` : ''} · {date(p.date)}
      </small>
      <small>
        {withClient && p.client_name ? <>{p.client_name} · </> : null}
        {p.invoice_number ? <>fatt. {p.invoice_number}</> : null}
      </small>
    </span>
  );
};

const ArticleDetail: React.FC<{ id: string; filters: any }> = ({ id, filters }) => {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiService.getArticle(id, { client_id: filters.client_id, start_date: filters.start_date, end_date: filters.end_date })
      .then(r => setD(r.data)).catch(e => setError(errorText(e)));
  }, [id, filters]);
  useEffect(() => { load(); }, [load]);

  const unlink = async (code: string) => {
    if (!window.confirm(`Scollegare il codice ${code} da questo articolo?`)) return;
    try { await apiService.unlinkArticleCode(id, code); load(); } catch (e) { alert(errorText(e)); }
  };

  if (error) return <div className="invoice-error-msg">{error}</div>;
  if (!d) return <div className="pl-muted">Caricamento…</div>;
  const a = d.article;
  const t = d.totals;

  return (
    <div className="art-detail">
      <div className="art-detail-head">
        <div>
          <div className="art-detail-title"><span className="article-code">{a.code}</span> {a.description}</div>
          <div className="pl-muted">
            {a.company_name} · listino attuale: <strong>{eur(a.list_price, 4)}</strong>{a.unit ? ` / ${a.unit}` : ''}
            {a.price_list_name ? ` (${a.price_list_name})` : ''}
          </div>
          {a.extra && Object.keys(a.extra).length > 0 && (
            <div className="art-extra">{Object.entries(a.extra).map(([k, v]) => <span key={k}><em>{k}</em> {String(v)}</span>)}</div>
          )}
          {d.aliases.length > 0 && (
            <div className="art-extra">
              Codici in fattura collegati a mano:{' '}
              {d.aliases.map((c: string) => (
                <span key={c} className="art-alias">{c} <button className="btn-icon" title="Scollega" onClick={() => unlink(c)}>×</button></span>
              ))}
            </div>
          )}
        </div>
        <div className="art-detail-kpis">
          <div><strong>{qty(t.quantity)}</strong><span>quantità</span></div>
          <div><strong>{eur(t.revenue)}</strong><span>fatturato</span></div>
          <div><strong>{eur(t.avg_net_price, 4)}</strong><span>prezzo medio netto</span></div>
          <div><strong>{eur(t.min_net_price, 4)} – {eur(t.max_net_price, 4)}</strong><span>prezzo min – max</span></div>
          <div><strong>{pct(t.avg_discount)}</strong><span>sconto medio</span></div>
          <div><strong>{t.invoices || 0}</strong><span>fatture</span></div>
        </div>
      </div>

      {t.lines > 0 && (
        <div>
          <h4>Prezzi di vendita</h4>
          <div className="art-price-cards">
            <div><span>Ultimo</span><PricePoint p={t.prices?.last} withClient /></div>
            <div><span>Minimo</span><PricePoint p={t.prices?.min} withClient /></div>
            <div><span>Massimo</span><PricePoint p={t.prices?.max} withClient /></div>
            <div><span>Medio</span><span className="art-point"><strong>{eur(t.avg_net_price, 2)}</strong><small>su {qty(t.quantity)} venduti · {t.clients || 0} clienti</small></span></div>
          </div>
        </div>
      )}

      {d.by_client.length > 0 && (
        <div>
          <h4>Clienti che l'hanno comprato ({d.by_client.length})</h4>
          <div className="pl-table-wrap">
            <table className="line-items-table art-clients-table">
              <thead>
                <tr>
                  <th>Cliente</th><th className="num">Fatture</th><th className="num">Qtà</th><th className="num">Fatturato</th>
                  <th className="num">Ultimo prezzo</th><th className="num">Minimo</th><th className="num">Massimo</th>
                  <th className="num">Medio</th><th className="num">Sconto medio</th>
                </tr>
              </thead>
              <tbody>
                {d.by_client.map((c: any, i: number) => (
                  <tr key={c.client_key || i}>
                    <td>{c.client_name}{c.country ? <span className="pl-muted"> · {c.country}</span> : null}</td>
                    <td className="num">{c.invoices}</td>
                    <td className="num">{qty(c.quantity)}</td>
                    <td className="num">{eur(c.revenue)}</td>
                    <td className="num"><PricePoint p={c.prices?.last} /></td>
                    <td className="num"><PricePoint p={c.prices?.min} /></td>
                    <td className="num"><PricePoint p={c.prices?.max} /></td>
                    <td className="num"><strong>{eur(c.avg_net_price, 2)}</strong></td>
                    <td className="num">{pct(c.avg_discount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="art-detail-grid">
        <div>
          <h4>Storico prezzi di listino</h4>
          <table className="line-items-table">
            <thead><tr><th>Listino</th><th>Valido dal</th><th className="num">Prezzo</th></tr></thead>
            <tbody>
              {d.prices.map((p: any) => (
                <tr key={p.price_list_id}><td>{p.name}</td><td>{date(p.valid_from || p.created_at)}</td><td className="num">{eur(p.price, 4)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h4>Per mese</h4>
          {d.by_month.length === 0 ? <p className="no-items">Nessuna vendita</p> : (
            <table className="line-items-table">
              <thead><tr><th>Mese</th><th className="num">Qtà</th><th className="num">Fatturato</th><th className="num">Prezzo medio</th></tr></thead>
              <tbody>
                {d.by_month.map((m: any) => (
                  <tr key={m.month}><td>{m.month}</td><td className="num">{qty(m.quantity)}</td><td className="num">{eur(m.revenue)}</td><td className="num">{eur(m.avg_net_price, 4)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {d.lines.length > 0 && (
        <>
          <h4>Righe fattura</h4>
          <div className="pl-table-wrap">
            <table className="line-items-table">
              <thead>
                <tr><th>Data</th><th>Fattura</th><th>Cliente</th><th>Codice in fattura</th><th className="num">Qtà</th><th>UM</th><th className="num">Prezzo netto</th><th className="num">Listino</th><th className="num">Sconto</th><th className="num">Totale</th></tr>
              </thead>
              <tbody>
                {d.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td>{date(l.invoice_date)}</td><td>{l.invoice_number || '–'}</td><td>{l.client_name || '–'}</td>
                    <td className="article-code">{l.article_code}{l.match_status === 'alias' ? ' ↔' : ''}</td>
                    <td className="num">{qty(l.quantity)}</td><td>{l.unit}</td>
                    <td className="num">{eur(l.net_price, 4)}</td><td className="num">{eur(l.list_price, 4)}</td>
                    <td className="num">{l.list_price && l.net_price !== null ? pct(1 - l.net_price / l.list_price) : '–'}</td>
                    <td className="num">{eur(l.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

/* ---------- Codes on invoices that are not in the price lists ---------- */

const UnmatchedList: React.FC<{ filters: any; onLinked: () => void }> = ({ filters, onLinked }) => {
  const [rows, setRows] = useState<any[] | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [rematching, setRematching] = useState(false);

  const load = useCallback(async () => {
    try { const r = await apiService.getUnmatchedArticleCodes(filters); setRows(r.data || []); } catch (e) { console.error(e); }
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  const rematch = async () => {
    if (!filters.company_id) return;
    setRematching(true);
    try { await apiService.rematchArticles(filters.company_id); await load(); onLinked(); } catch (e) { alert(errorText(e)); }
    setRematching(false);
  };

  return (
    <div className="revenue-card">
      <p className="pl-hint">
        Codici scritti sulle fatture che non corrispondono a nessun articolo dei listini caricati. Di solito sono articoli
        fuori listino o codici scritti in modo diverso: puoi collegarli a mano all'articolo giusto e da quel momento
        tutte le righe con quel codice (anche delle prossime fatture) verranno contate su quell'articolo.
      </p>
      {filters.company_id && (
        <button className="admin-btn admin-btn-secondary art-rematch" onClick={rematch} disabled={rematching}>
          {rematching ? 'Controllo in corso…' : 'Ricontrolla tutte le righe di questa azienda'}
        </button>
      )}
      {!rows ? <div className="revenue-empty">Caricamento…</div> : rows.length === 0 ? (
        <div className="revenue-empty"><p>Nessun codice da sistemare</p></div>
      ) : (
        <div className="pl-table-wrap">
          <table className="revenue-table">
            <thead>
              <tr><th>Azienda</th><th>Codice in fattura</th><th>Descrizione in fattura</th><th className="num">Righe</th><th className="num">Qtà</th><th className="num">Fatturato</th><th>Ultima</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const key = `${r.company_id}:${r.normalized_code}`;
                return (
                  <React.Fragment key={key}>
                    <tr>
                      <td>{r.company_name}</td>
                      <td className="article-code">{r.code}</td>
                      <td>{r.description || '–'}</td>
                      <td className="num">{r.lines}</td>
                      <td className="num">{qty(r.quantity)} {r.unit || ''}</td>
                      <td className="num">{eur(r.revenue)}</td>
                      <td>{date(r.last_date)}</td>
                      <td><button className="suggestion-btn" onClick={() => setLinking(linking === key ? null : key)}>Collega a un articolo</button></td>
                    </tr>
                    {linking === key && (
                      <tr className="invoice-detail-row">
                        <td colSpan={8}>
                          <LinkPicker row={r} onDone={async () => { setLinking(null); await load(); onLinked(); }} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const LinkPicker: React.FC<{ row: any; onDone: () => void }> = ({ row, onDone }) => {
  const [q, setQ] = useState(row.description || row.code || '');
  const [results, setResults] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q.trim()) { setResults([]); return; }
      try {
        const r = await apiService.getArticles({ company_id: row.company_id, search: q.trim(), only_sold: false, sort: 'code', limit: 10 });
        setResults(r.data?.articles || []);
      } catch (e) { console.error(e); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, row.company_id]);

  const link = async (articleId: string) => {
    setSaving(true);
    try {
      await apiService.linkArticleCode({ company_id: row.company_id, code: row.code, article_id: articleId });
      onDone();
    } catch (e) { alert(errorText(e)); }
    setSaving(false);
  };

  return (
    <div className="art-link">
      <div>Cerca nel listino di <strong>{row.company_name}</strong> l'articolo a cui corrisponde il codice <span className="article-code">{row.code}</span>:</div>
      <input className="art-search" value={q} onChange={e => setQ(e.target.value)} autoFocus />
      {results.length === 0 ? <p className="no-items">Nessun articolo trovato: prova con parte del codice o della descrizione.</p> : (
        <ul className="art-link-results">
          {results.map(a => (
            <li key={a.id}>
              <span className="article-code">{a.code}</span> {a.description} <span className="pl-muted">{eur(a.list_price, 4)}</span>
              <button className="suggestion-btn suggestion-btn-primary" disabled={saving} onClick={() => link(a.id)}>Collega</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ArticlesTab;
