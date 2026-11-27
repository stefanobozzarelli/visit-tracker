import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiService } from '../services/api';
import '../styles/Revenue.css';
import '../styles/Articles.css';

/* ============================================================
   LISTINI — upload supplier price lists (Excel, CSV, PDF)
   ============================================================ */

interface Mapping {
  sheet?: string;
  header_row: number;
  code: number;
  description: number;
  price: number;
  unit: number;
  variant?: number;
  internal_code?: number;
  extra_columns?: number[];
}

interface Preview {
  kind: 'excel' | 'csv' | 'pdf';
  sheets: string[];
  sheet?: string;
  total_rows: number;
  width: number;
  rows: any[][];
  mapping: Mapping;
  result: {
    articles: number;
    rows_read: number;
    rows_skipped: number;
    duplicates: number;
    sample: { code: string; description: string | null; unit: string | null; price: number; extra: any }[];
    skipped_samples: { row: number; reason: string; values: any[] }[];
  };
  pdf: { pages: number; lines: number; unparsed_samples: string[] } | null;
  ai_available: boolean;
}

const colName = (i: number) => {
  let s = '';
  let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

const formatPrice = (n: number | null | undefined) =>
  n === null || n === undefined ? '–' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 4 }).format(Number(n));

const formatDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('it-IT') : '–');

const errorText = (err: any) => err?.response?.data?.error || err?.message || 'Errore';

export const PriceListsTab: React.FC = () => {
  const [companies, setCompanies] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCompany, setFilterCompany] = useState('');

  // upload / preview state
  const [companyId, setCompanyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [name, setName] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [useAi, setUseAi] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadLists = useCallback(async () => {
    try {
      const res = await apiService.getPriceLists(filterCompany || undefined);
      setLists(res.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filterCompany]);

  useEffect(() => {
    apiService.getCompanies().then(r => setCompanies(r.data || [])).catch(console.error);
  }, []);
  useEffect(() => { loadLists(); }, [loadLists]);

  // Background (AI) imports: refresh until they finish
  useEffect(() => {
    if (!lists.some(l => l.status === 'processing')) return;
    const t = setInterval(loadLists, 4000);
    return () => clearInterval(t);
  }, [lists, loadLists]);

  const runPreview = async (f: File, opts: { sheet?: string; mapping?: Mapping; previous?: any } = {}) => {
    setPreviewing(true);
    setMessage(null);
    try {
      const res = await apiService.previewPriceList(f, opts);
      setPreview(res.data);
      setMapping(res.data.mapping);
    } catch (err) {
      setPreview(null);
      setMessage({ type: 'error', text: errorText(err) });
    }
    setPreviewing(false);
  };

  const chooseFile = async (f: File) => {
    if (!companyId) { setMessage({ type: 'error', text: "Scegli prima l'azienda del listino." }); return; }
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, ''));
    setUseAi(false);
    // Propose the columns used last time for this supplier: the server finds them again by header name
    let previous: any;
    try {
      const last = await apiService.getLastPriceListMapping(companyId);
      if (last.data && !/\.pdf$/i.test(f.name)) previous = last.data;
    } catch { /* no previous list */ }
    await runPreview(f, previous ? { previous } : {});
  };

  const changeMapping = (patch: Partial<Mapping>) => {
    if (!file || !mapping) return;
    const next = { ...mapping, ...patch };
    setMapping(next);
    runPreview(file, { sheet: next.sheet, mapping: next });
  };

  // Another sheet: let the server find its header and columns again
  const changeSheet = (sheet: string) => {
    if (!file) return;
    runPreview(file, { sheet });
  };

  const resetUpload = () => {
    setFile(null); setPreview(null); setMapping(null); setName(''); setValidFrom(''); setUseAi(false);
  };

  const doImport = async () => {
    if (!file || !companyId || !mapping) return;
    if (!useAi && (mapping.code < 0 || mapping.price < 0)) {
      setMessage({ type: 'error', text: 'Indica le colonne del codice e del prezzo.' });
      return;
    }
    setImporting(true);
    setMessage(null);
    try {
      const res = await apiService.importPriceList(file, {
        company_id: companyId, name, valid_from: validFrom || undefined, mapping, use_ai: useAi,
      });
      const d = res.data;
      if (d.background) {
        setMessage({ type: 'ok', text: "Lettura del PDF con l'AI avviata: il listino si completa da solo, puoi seguirne l'avanzamento qui sotto." });
      } else if (d.price_list.status === 'error') {
        setMessage({ type: 'error', text: d.price_list.error_message });
      } else {
        const m = d.match || {};
        setMessage({
          type: 'ok',
          text: `Listino "${d.price_list.name}" caricato: ${Number(d.price_list.article_count).toLocaleString('it-IT')} articoli.` +
            (m.matched !== undefined ? ` Righe fattura di questa azienda abbinate: ${m.matched}, non trovate a listino: ${m.unmatched}.` : ''),
        });
      }
      resetUpload();
      await loadLists();
    } catch (err) {
      setMessage({ type: 'error', text: errorText(err) });
    }
    setImporting(false);
  };

  const removeList = async (l: any) => {
    if (!window.confirm(`Eliminare il listino "${l.name}"? Gli articoli presenti solo in questo listino verranno tolti e le righe fattura collegate andranno ricontrollate.`)) return;
    try {
      await apiService.deletePriceList(l.id);
      await loadLists();
    } catch (err) { alert(errorText(err)); }
  };

  const saveValidFrom = async (l: any, value: string) => {
    try {
      await apiService.updatePriceList(l.id, { valid_from: value || null });
      await loadLists();
    } catch (err) { alert(errorText(err)); }
  };

  const download = async (l: any) => {
    try {
      const res = await apiService.getPriceListDownloadUrl(l.id);
      if (res.data?.url) window.open(res.data.url, '_blank');
    } catch (err) { alert(errorText(err)); }
  };

  const columnOptions = (width: number) => (
    <>
      <option value={-1}>– nessuna –</option>
      {Array.from({ length: width }, (_, i) => {
        const header = preview && mapping && mapping.header_row >= 0 ? preview.rows[mapping.header_row]?.[i] : null;
        return <option key={i} value={i}>{colName(i)}{header ? ` · ${String(header).substring(0, 30)}` : ''}</option>;
      })}
    </>
  );

  const roleOf = (i: number) => {
    if (!mapping) return '';
    if (i === mapping.code) return 'col-code';
    if (i === mapping.price) return 'col-price';
    if (i === mapping.description) return 'col-desc';
    if (i === mapping.unit) return 'col-unit';
    if (i === mapping.variant || i === mapping.internal_code) return 'col-code2';
    return '';
  };

  const isPdf = preview?.kind === 'pdf';

  return (
    <div className="revenue-tab-content">
      {/* Upload */}
      <div className="revenue-card">
        <h3 className="card-section-title">Carica listino</h3>
        <p className="pl-hint">
          Excel (.xlsx, .xls), CSV o PDF. Prima di salvare vedi un'anteprima e scegli quali colonne sono codice, descrizione,
          unità e prezzo. Se carichi un nuovo listino della stessa azienda, i prezzi vengono aggiornati e quelli vecchi restano
          nello storico: ogni fattura usa il prezzo del listino valido alla sua data.
        </p>
        <div className="upload-controls">
          <div className="upload-selectors">
            <select value={companyId} onChange={e => { setCompanyId(e.target.value); resetUpload(); }} disabled={importing}>
              <option value="">Seleziona Azienda *</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {!preview && (
            <div
              className={`upload-zone ${isDragging ? 'dragging' : ''} ${!companyId ? 'disabled' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files[0]) chooseFile(e.dataTransfer.files[0]); }}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".xlsx,.xls,.xlsm,.ods,.csv,.txt,.pdf"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) chooseFile(e.target.files[0]); e.target.value = ''; }}
              />
              {previewing ? (
                <p className="upload-text">Lettura del file in corso…</p>
              ) : (
                <>
                  <svg className="upload-icon" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  <p className="upload-text">
                    Trascina qui il listino o{' '}
                    <span className="upload-link" onClick={() => companyId && fileInput.current?.click()}>sfoglia</span>
                  </p>
                  <p className="upload-hint">Anche listini molto grandi (20.000+ articoli).</p>
                </>
              )}
            </div>
          )}
        </div>

        {message && <div className={`pl-message pl-message-${message.type}`}>{message.text}</div>}

        {preview && mapping && (
          <div className="pl-preview">
            <div className="pl-preview-head">
              <strong>{file?.name}</strong>
              <span className="pl-muted">
                {isPdf
                  ? `${preview.pdf?.pages} pagine · ${preview.pdf?.lines} righe di testo`
                  : `${preview.total_rows.toLocaleString('it-IT')} righe`}
              </span>
              {previewing && <span className="pl-muted">aggiornamento…</span>}
            </div>

            {!isPdf && (
              <div className="pl-mapping">
                {preview.sheets.length > 1 && (
                  <label>Foglio
                    <select value={mapping.sheet} onChange={e => changeSheet(e.target.value)}>
                      {preview.sheets.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                )}
                <label>Riga intestazione
                  <select value={mapping.header_row} onChange={e => changeMapping({ header_row: Number(e.target.value) })}>
                    <option value={-1}>nessuna</option>
                    {preview.rows.slice(0, 40).map((_, i) => <option key={i} value={i}>riga {i + 1}</option>)}
                  </select>
                </label>
                <label className="pl-required" title="Il codice come è scritto in fattura">Codice in fattura *
                  <select value={mapping.code} onChange={e => changeMapping({ code: Number(e.target.value) })}>{columnOptions(preview.width)}</select>
                </label>
                <label className="pl-required">Prezzo *
                  <select value={mapping.price} onChange={e => changeMapping({ price: Number(e.target.value) })}>{columnOptions(preview.width)}</select>
                </label>
                <label>Descrizione
                  <select value={mapping.description} onChange={e => changeMapping({ description: Number(e.target.value) })}>{columnOptions(preview.width)}</select>
                </label>
                <label>Unità
                  <select value={mapping.unit} onChange={e => changeMapping({ unit: Number(e.target.value) })}>{columnOptions(preview.width)}</select>
                </label>
                <label title="Versione o categoria aggiunta al codice in fattura, es. _6 in LEMUD111198_6">Versione
                  <select value={mapping.variant ?? -1} onChange={e => changeMapping({ variant: Number(e.target.value) })}>{columnOptions(preview.width)}</select>
                </label>
                <label title="Codice interno del fornitore: separa le righe con lo stesso codice in fattura (es. stesso lavabo in materiali diversi)">Codice interno
                  <select value={mapping.internal_code ?? -1} onChange={e => changeMapping({ internal_code: Number(e.target.value) })}>{columnOptions(preview.width)}</select>
                </label>
              </div>
            )}

            {!isPdf && (
              <div className="pl-raw-wrap">
                <table className="pl-raw">
                  <thead>
                    <tr>
                      <th></th>
                      {Array.from({ length: preview.width }, (_, i) => <th key={i} className={roleOf(i)}>{colName(i)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.slice(0, Math.max(12, mapping.header_row + 10)).map((row, r) => (
                      <tr key={r} className={r === mapping.header_row ? 'pl-header-row' : r < mapping.header_row ? 'pl-ignored-row' : ''}>
                        <td className="pl-rownum">{r + 1}</td>
                        {Array.from({ length: preview.width }, (_, i) => (
                          <td key={i} className={roleOf(i)}>{row[i] === null || row[i] === undefined ? '' : String(row[i]).substring(0, 40)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {isPdf && (
              <div className="pl-pdf-info">
                <p>
                  Lettura automatica del PDF: <strong>{preview.result.articles.toLocaleString('it-IT')} articoli</strong> riconosciuti
                  (righe che iniziano con un codice e finiscono con un prezzo). Controlla gli esempi qui sotto.
                </p>
                {preview.pdf?.unparsed_samples?.length ? (
                  <details>
                    <summary>Esempi di righe non riconosciute</summary>
                    <ul>{preview.pdf.unparsed_samples.map((l, i) => <li key={i}><code>{l}</code></li>)}</ul>
                  </details>
                ) : null}
                {preview.ai_available ? (
                  <label className="pl-checkbox">
                    <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} />
                    Leggi il PDF con l'AI invece della lettura automatica (più preciso per listini impaginati in modo complesso;
                    richiede qualche minuto per i listini lunghi e usa l'API Anthropic)
                  </label>
                ) : (
                  <p className="pl-muted">La lettura con AI non è disponibile (manca la chiave API Anthropic sul server).</p>
                )}
                <p className="pl-muted">Se l'azienda ha il listino anche in Excel, conviene caricare quello: è sempre più preciso.</p>
              </div>
            )}

            <div className="pl-result">
              {useAi ? (
                <span>Gli articoli verranno letti dall'AI dopo il caricamento.</span>
              ) : (
                <>
                  <span className="pl-result-main">{preview.result.articles.toLocaleString('it-IT')} articoli pronti</span>
                  <span className="pl-muted">
                    {preview.result.rows_skipped > 0 && ` · ${preview.result.rows_skipped.toLocaleString('it-IT')} righe scartate`}
                    {preview.result.duplicates > 0 && ` · ${preview.result.duplicates} codici ripetuti (vale l'ultima riga)`}
                  </span>
                </>
              )}
            </div>

            {!useAi && preview.result.sample.length > 0 && (
              <div className="pl-table-wrap">
                <table className="revenue-table pl-sample">
                  <thead><tr><th>Codice</th><th>Descrizione</th><th>Unità</th><th className="num">Prezzo</th><th>Altri dati</th></tr></thead>
                  <tbody>
                    {preview.result.sample.map((a, i) => (
                      <tr key={i}>
                        <td className="article-code">{a.code}</td>
                        <td>{a.description || '–'}</td>
                        <td>{a.unit || '–'}</td>
                        <td className="num">{formatPrice(a.price)}</td>
                        <td className="pl-muted">{a.extra ? Object.entries(a.extra).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(' · ') : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!useAi && preview.result.skipped_samples.length > 0 && (
              <details className="pl-skipped">
                <summary>Righe scartate (esempi)</summary>
                <ul>
                  {preview.result.skipped_samples.map((s, i) => (
                    <li key={i}>Riga {s.row}: {s.reason} — <span className="pl-muted">{s.values.filter(v => v !== null && v !== '').join(' | ').substring(0, 120)}</span></li>
                  ))}
                </ul>
              </details>
            )}

            <div className="pl-save">
              <label>Nome listino
                <input value={name} onChange={e => setName(e.target.value)} placeholder="es. Listino 2027" />
              </label>
              <label>Valido dal
                <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} />
              </label>
              <div className="pl-save-buttons">
                <button className="admin-btn admin-btn-secondary" onClick={resetUpload} disabled={importing}>Annulla</button>
                <button
                  className="admin-btn admin-btn-primary"
                  onClick={doImport}
                  disabled={importing || previewing || (!useAi && preview.result.articles === 0)}
                >
                  {importing ? 'Caricamento…' : useAi ? 'Carica e leggi con AI' : `Carica ${preview.result.articles.toLocaleString('it-IT')} articoli`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Existing lists */}
      <div className="revenue-filters">
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}>
          <option value="">Tutte le Aziende</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="revenue-card">
        <div className="invoice-count">{lists.length} listin{lists.length === 1 ? 'o' : 'i'}</div>
        {loading ? (
          <div className="revenue-empty">Caricamento…</div>
        ) : lists.length === 0 ? (
          <div className="revenue-empty">
            <p>Nessun listino caricato</p>
            <p className="empty-hint">Carica il listino di un'azienda per avere prezzi e statistiche dei singoli articoli</p>
          </div>
        ) : (
          <div className="pl-table-wrap">
            <table className="revenue-table">
              <thead>
                <tr><th>Listino</th><th>Azienda</th><th>Valido dal</th><th className="num">Articoli</th><th>Stato</th><th>Caricato</th><th>Azioni</th></tr>
              </thead>
              <tbody>
                {lists.map(l => (
                  <tr key={l.id}>
                    <td>
                      <div className="invoice-cell-primary">{l.name}</div>
                      <div className="invoice-cell-secondary">{l.original_filename} · {l.source_type === 'pdf_ai' ? 'PDF letto con AI' : String(l.source_type).toUpperCase()}</div>
                    </td>
                    <td>{l.company?.name || '–'}</td>
                    <td>
                      <input
                        type="date"
                        className="pl-inline-date"
                        defaultValue={l.valid_from || ''}
                        onBlur={e => { if ((e.target.value || null) !== (l.valid_from || null)) saveValidFrom(l, e.target.value); }}
                        title="Data da cui valgono i prezzi"
                      />
                    </td>
                    <td className="num">
                      {Number(l.article_count).toLocaleString('it-IT')}
                      {l.rows_skipped > 0 && <div className="invoice-cell-secondary">{l.rows_skipped} righe scartate</div>}
                    </td>
                    <td>
                      {l.status === 'ready' && <span className="invoice-status status-processed">Pronto</span>}
                      {l.status === 'processing' && <span className="invoice-status status-processing">In lettura… {l.progress}%</span>}
                      {l.status === 'error' && <span className="invoice-status status-error">Errore</span>}
                      {l.status === 'error' && l.error_message && <div className="invoice-cell-secondary">{l.error_message}</div>}
                    </td>
                    <td>
                      <div>{formatDate(l.created_at)}</div>
                      <div className="invoice-cell-secondary">{l.uploaded_by_user?.name || ''}</div>
                    </td>
                    <td className="invoice-actions">
                      {l.s3_key && (
                        <button className="btn-icon" title="Scarica il file originale" onClick={() => download(l)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                      )}
                      <button className="btn-icon btn-icon-danger" title="Elimina listino" onClick={() => removeList(l)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceListsTab;
