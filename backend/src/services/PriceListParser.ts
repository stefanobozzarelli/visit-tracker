import * as XLSX from 'xlsx';
// pdf-parse v1 — simple function: pdfParse(buffer) => { text, numpages, info }
const pdfParse = require('pdf-parse');

/**
 * Pure helpers to read supplier price lists (Excel, CSV, PDF) into rows and
 * turn them into articles through a column mapping. No database access here.
 */

export type Cell = string | number | boolean | null;

export interface ColumnMapping {
  sheet?: string;          // sheet name (Excel); first sheet when missing
  header_row: number;      // 0-based index of the header row; -1 when the file has no header
  code: number;            // column indexes (0-based); -1 = not present
  description: number;
  price: number;
  unit: number;
  // Optional: version/category appended to the code as on invoices ("LEMUD111198" + "_6")
  variant?: number;
  // Optional: the supplier's internal code, when the invoice code repeats on several
  // rows (same item in different materials); it keeps those rows apart
  internal_code?: number;
  extra_columns?: number[]; // other columns to keep in article.extra; all others when missing
}

export interface ParsedArticle {
  code: string;               // code as written on invoices, with the version when there is one
  normalized_code: string;    // unique key of the article for the supplier
  match_code: string;         // normalized invoice code (code + version)
  base_code: string;          // normalized code without the version
  alt_code: string | null;    // normalized internal code
  description: string | null;
  unit: string | null;
  price: number;
  extra: Record<string, any> | null;
}

export interface BuildResult {
  articles: ParsedArticle[];
  rows_read: number;
  rows_skipped: number;
  duplicates: number;
  skipped_samples: { row: number; reason: string; values: Cell[] }[];
}

function numberToCode(n: number): string {
  // Excel stores numeric codes as numbers; avoid "1.2e+12" and float noise
  if (Number.isInteger(n)) return BigInt(Math.round(n)).toString();
  return String(n);
}

/** Code as shown to people: trimmed, numbers without exponent. */
export function displayCode(code: any): string {
  if (code === null || code === undefined) return '';
  return (typeof code === 'number' ? numberToCode(code) : String(code)).trim();
}

/** Upper case, no spaces, dots, dashes, slashes or underscores: "abk-12.3 / a" -> "ABK123A". */
export function normalizeCode(code: any): string {
  return displayCode(code).toUpperCase().replace(/[\s.\-\/_\\]+/g, '');
}

/**
 * Reads a price as written in Italian or English lists: 12,50 · 1.234,56 · 1,234.56 ·
 * "€ 12.50" · "12,50 €/mq". Returns null when there is no number.
 */
export function parsePrice(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim();
  if (!s) return null;
  const m = s.match(/-?\d[\d.,'\s]*/);
  if (!m) return null;
  s = m[0].replace(/[\s']/g, '');
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // the separator that comes last is the decimal one
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const commas = (s.match(/,/g) || []).length;
    if (commas > 1) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (lastDot >= 0) {
    const dots = (s.match(/\./g) || []).length;
    // "1.234.567" = thousands; a single dot is a decimal point ("12.50")
    if (dots > 1) s = s.replace(/\./g, '');
  }
  s = s.replace(/[.,]$/, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const UNIT_ALIASES: Record<string, string> = {
  mq: 'm2', m2: 'm2', 'm²': 'm2', sqm: 'm2', 'm.q.': 'm2', 'mq.': 'm2',
  pz: 'pz', 'pz.': 'pz', pezzi: 'pz', pezzo: 'pz', pc: 'pz', pcs: 'pz', nr: 'pz', 'nr.': 'pz', cad: 'pz', 'cad.': 'pz',
  ml: 'ml', 'm.l.': 'ml', mt: 'ml', 'mt.': 'ml', lm: 'ml',
  kg: 'kg', lt: 'lt',
  cf: 'cf', conf: 'cf', 'conf.': 'cf', sc: 'cf', scatola: 'cf', box: 'cf', ct: 'cf',
};

export function normalizeUnit(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().toLowerCase();
  if (!s) return null;
  return UNIT_ALIASES[s] || s.substring(0, 20);
}

/* ─────────────── Spreadsheets (xlsx, xls, ods, csv) ─────────────── */

export function fileKind(filename: string, mimetype?: string): 'excel' | 'csv' | 'pdf' | null {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf' || mimetype === 'application/pdf') return 'pdf';
  if (ext === 'csv' || ext === 'txt' || mimetype === 'text/csv') return 'csv';
  if (['xlsx', 'xls', 'xlsm', 'xlsb', 'ods'].includes(ext)) return 'excel';
  return null;
}

function decodeText(buffer: Buffer): string {
  const utf8 = buffer.toString('utf8');
  // invalid UTF-8 shows up as U+FFFD: files saved by Excel on Windows are often Latin-1
  if (utf8.includes('�')) return buffer.toString('latin1');
  return utf8.replace(/^﻿/, '');
}

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 20);
  let best = ';';
  let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map(l => l.split(d).length - 1).filter(c => c > 0);
    if (!counts.length) continue;
    const freq = new Map<number, number>();
    counts.forEach(c => freq.set(c, (freq.get(c) || 0) + 1));
    const [mode, times] = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    // the same count on every line beats a high count on one line
    const score = times * 10 + mode;
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

export function readWorkbook(buffer: Buffer, kind: 'excel' | 'csv'): XLSX.WorkBook {
  if (kind === 'csv') {
    const text = decodeText(buffer);
    // raw: keep every cell as text so codes like 0013288 keep their zeros
    return XLSX.read(text, { type: 'string', FS: detectDelimiter(text), raw: true } as any);
  }
  return XLSX.read(buffer, { type: 'buffer', cellDates: false });
}

export function sheetRows(wb: XLSX.WorkBook, sheetName?: string): Cell[][] {
  const name = sheetName && wb.SheetNames.includes(sheetName) ? sheetName : wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
  return rows.map(r => r.map(c => (typeof c === 'string' ? c.trim() : c)));
}

/* ─────────────── Header and column detection ─────────────── */

const HEADER_HINTS: Record<'code' | 'description' | 'price' | 'unit', RegExp[]> = {
  code: [/^cod(ice)?\.?\s*comm/, /^cod(ice)?\.?\s*(art(icolo)?\.?)?$/, /^cod(ice)?\b/, /^art(icolo)?\.?$/, /^(item|sku|ref(erence)?|riferimento|article|code|product code|part)\b/],
  description: [/^desc(rizione)?\.?/, /^(description|denominazione|prodotto|product|nome|name)/],
  price: [/prezzo|listino|price|€|\beur(o)?\b|importo|valore|tariff/],
  unit: [/^u\.?\s?m\.?$/, /^(unit(à|a)?|uom|misura|unit of measure)$/],
};

function textOf(c: Cell | undefined): string {
  return c === null || c === undefined ? '' : String(c).trim().toLowerCase();
}

/** Index of the row that looks like the header (within the first 40 rows), -1 if none. */
export function detectHeaderRow(rows: Cell[][]): number {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, 40).forEach((row, idx) => {
    const texts = row.map(textOf);
    let score = 0;
    for (const field of Object.keys(HEADER_HINTS) as (keyof typeof HEADER_HINTS)[]) {
      if (texts.some(t => t && t.length < 60 && HEADER_HINTS[field].some(re => re.test(t)))) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = idx; }
  });
  return bestScore >= 2 ? best : -1;
}

const looksNumeric = (v: Cell) =>
  typeof v === 'number' || (typeof v === 'string' && /^[\s€$]*-?\d[\d.,'\s]*(€|eur)?[\s/a-z²]*$/i.test(v) && parsePrice(v) !== null);

const VARIANT_HINTS = [/^vrs\.?$/, /^var\.?$/];
const INTERNAL_CODE_HINTS = [/^cod(ice)?\.?\s*int/, /^cod(ice)?\.?\s*(art(icolo)?\.?)?$/, /^cod(ice)?\b/];

/** Best guess of which columns hold code, description, price and unit. */
export function guessMapping(rows: Cell[][], headerRow: number): Omit<ColumnMapping, 'sheet'> {
  const width = Math.max(0, ...rows.slice(0, 200).map(r => r.length));
  const headers = headerRow >= 0 ? (rows[headerRow] || []).map(textOf) : [];
  const used = new Set<number>();
  const pick = (field: keyof typeof HEADER_HINTS): number => {
    for (const re of HEADER_HINTS[field]) {
      const idx = headers.findIndex((h, i) => !used.has(i) && !!h && h.length < 60 && re.test(h));
      if (idx >= 0) { used.add(idx); return idx; }
    }
    return -1;
  };
  // order matters: "codice articolo" must go to code before anything else looks at it
  let code = pick('code');
  const pickBy = (res: RegExp[]): number => {
    for (const re of res) {
      const idx = headers.findIndex((h, i) => !used.has(i) && !!h && h.length < 60 && re.test(h));
      if (idx >= 0) { used.add(idx); return idx; }
    }
    return -1;
  };
  // A "commercial code" column is the one printed on invoices; the plain "codice"
  // next to it is then the internal code (e.g. Antoniolupi: COD.COMM. + CODICE)
  const internal_code = code >= 0 && /comm/.test(headers[code] || '') ? pickBy(INTERNAL_CODE_HINTS) : -1;
  const variant = code >= 0 ? pickBy(VARIANT_HINTS) : -1;
  let price = pick('price');
  const unit = pick('unit');
  let description = pick('description');

  // Fall back on the data itself when headers say nothing
  const sample = rows.slice(headerRow + 1, headerRow + 101);
  const stats = Array.from({ length: width }, (_, i) => {
    const vals = sample.map(r => r[i]).filter(v => v !== null && v !== undefined && v !== '');
    const numeric = vals.filter(looksNumeric).length;
    const avgLen = vals.reduce<number>((s, v) => s + String(v).length, 0) / (vals.length || 1);
    const distinct = new Set(vals.map(v => String(v))).size;
    return { i, filled: vals.length, numeric, avgLen, distinct };
  });
  if (code < 0) {
    const c = stats.find(s => !used.has(s.i) && s.filled > 0 && s.distinct >= s.filled * 0.9 && s.avgLen < 25);
    if (c) { code = c.i; used.add(c.i); }
  }
  if (description < 0) {
    const d = stats.filter(s => !used.has(s.i) && s.filled > 0 && s.numeric < s.filled / 2).sort((a, b) => b.avgLen - a.avgLen)[0];
    if (d) { description = d.i; used.add(d.i); }
  }
  if (price < 0) {
    const p = [...stats].reverse().find(s => !used.has(s.i) && s.filled > 0 && s.numeric >= s.filled * 0.8);
    if (p) { price = p.i; used.add(p.i); }
  }
  return { header_row: headerRow, code, description, price, unit, variant, internal_code };
}

/** Code plus version as printed on invoices: "LEMUD111198" + "_6" → "LEMUD111198_6". */
export function codeWithVariant(code: any, variant: any): string {
  const c = displayCode(code);
  const v = displayCode(variant);
  if (!v) return c;
  return /^[_\-.\/\s]/.test(v) ? c + v : `${c}_${v}`;
}

/* ─────────────── Rows → articles ─────────────── */

export function buildArticles(rows: Cell[][], mapping: ColumnMapping): BuildResult {
  const headers = mapping.header_row >= 0 ? (rows[mapping.header_row] || []) : [];
  const start = mapping.header_row + 1;
  const mapped = new Set([mapping.code, mapping.description, mapping.price, mapping.unit].filter(i => i >= 0));
  const width = Math.max(0, ...rows.map(r => r.length));
  const extraCols = (mapping.extra_columns ?? Array.from({ length: width }, (_, i) => i)).filter(i => !mapped.has(i));
  const headerName = (i: number) => {
    const h = headers[i];
    return h !== null && h !== undefined && String(h).trim() ? String(h).trim().substring(0, 60) : `Colonna ${i + 1}`;
  };
  const codeHeader = mapping.code >= 0 ? textOf(headers[mapping.code]) : '';

  const byCode = new Map<string, ParsedArticle>();
  let rowsRead = 0;
  let skipped = 0;
  let duplicates = 0;
  const skippedSamples: BuildResult['skipped_samples'] = [];

  for (let r = start; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => c === null || c === undefined || c === '')) continue;
    rowsRead++;
    const rawCode = mapping.code >= 0 ? row[mapping.code] : null;
    const variantIdx = mapping.variant ?? -1;
    const internalIdx = mapping.internal_code ?? -1;
    const fullCode = codeWithVariant(rawCode, variantIdx >= 0 ? row[variantIdx] : null);
    const matchCode = normalizeCode(fullCode);
    const internal = internalIdx >= 0 ? normalizeCode(row[internalIdx]) : '';
    const normalized = matchCode && internal && internal !== matchCode ? `${matchCode}#${internal}` : matchCode;
    const price = mapping.price >= 0 ? parsePrice(row[mapping.price]) : null;
    let reason = '';
    if (!normalized) reason = 'manca il codice';
    else if (codeHeader && textOf(rawCode) === codeHeader) reason = 'riga di intestazione';
    else if (price === null) reason = 'manca il prezzo';
    else if (normalized.length > 120) reason = 'codice troppo lungo';
    if (reason) {
      skipped++;
      if (skippedSamples.length < 20) skippedSamples.push({ row: r + 1, reason, values: row.slice(0, 8) });
      continue;
    }
    const extra: Record<string, any> = {};
    for (const i of extraCols) {
      const v = row[i];
      if (v !== null && v !== undefined && v !== '') extra[headerName(i)] = v;
    }
    if (byCode.has(normalized)) duplicates++;
    const d = mapping.description >= 0 ? row[mapping.description] : null;
    byCode.set(normalized, {
      code: fullCode.substring(0, 100),
      normalized_code: normalized,
      match_code: matchCode,
      base_code: normalizeCode(rawCode),
      alt_code: internal || null,
      description: d !== null && d !== undefined && String(d).trim() ? String(d).trim() : null,
      unit: mapping.unit >= 0 ? normalizeUnit(row[mapping.unit]) : null,
      price: price as number,
      extra: Object.keys(extra).length ? extra : null,
    });
  }
  return { articles: [...byCode.values()], rows_read: rowsRead, rows_skipped: skipped, duplicates, skipped_samples: skippedSamples };
}

/* ─────────────── PDF ─────────────── */

/**
 * Text of a PDF. pdf-parse 1.1.1 sometimes fails on a valid file with
 * "bad XRef entry" (seen on the first calls after the server starts), so a
 * failed read is tried again before giving up.
 */
export async function pdfText(buffer: Buffer, attempts = 3): Promise<{ text: string; pages: number }> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const data = await pdfParse(Buffer.from(buffer));
      return { text: data.text || '', pages: data.numpages || 0 };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

const DECIMAL_TOKEN = /^(€|eur)?-?\d{1,3}(?:[.']\d{3})*,\d{1,4}€?$|^(€|eur)?-?\d+[.,]\d{1,4}€?$|^(€|eur)?-?\d{1,3}(?:,\d{3})*\.\d{1,4}€?$/i;
const CODE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9.\-\/_]{1,39}$/;

/**
 * Best-effort reading of a PDF price list: every line that starts with a code
 * and ends with a price becomes a row [code, description, unit, price].
 * Lists laid out in columns usually come out this way from pdf-parse; lists
 * that don't can be read with the AI option instead.
 */
export function parsePdfLines(text: string): { rows: Cell[][]; lines: number; unparsed_samples: string[] } {
  const lines = text.split(/\r?\n/).map(l => l.replace(/ /g, ' ').trim()).filter(Boolean);
  const rows: Cell[][] = [['Codice', 'Descrizione', 'UM', 'Prezzo']];
  const unparsed: string[] = [];
  const skip = (line: string) => { if (unparsed.length < 15 && line.length > 3) unparsed.push(line); };
  for (const line of lines) {
    // "12,50 €" → "12,50€" so the price is one token
    const tokens = line.replace(/(\d)\s+€/g, '$1€').replace(/€\s+(\d)/g, '€$1').split(/\s+/);
    if (tokens.length < 2) { skip(line); continue; }
    // price: a decimal amount among the last three tokens
    let pi = -1;
    for (let i = tokens.length - 1; i >= Math.max(1, tokens.length - 3); i--) {
      if (DECIMAL_TOKEN.test(tokens[i])) { pi = i; break; }
    }
    const code = tokens[0];
    if (pi < 1 || !CODE_TOKEN.test(code) || !/\d/.test(code) || DECIMAL_TOKEN.test(code)) { skip(line); continue; }
    const middle = tokens.slice(1, pi);
    let unit: string | null = null;
    const after = tokens[pi + 1];
    const before = middle[middle.length - 1];
    const asUnit = (t?: string) => t ? UNIT_ALIASES[t.toLowerCase().replace(/^€?\//, '')] : undefined;
    if (asUnit(after)) unit = asUnit(after)!;
    else if (asUnit(before)) { unit = asUnit(before)!; middle.pop(); }
    rows.push([code, middle.join(' ') || null, unit, parsePrice(tokens[pi])]);
  }
  return { rows, lines: lines.length, unparsed_samples: unparsed };
}

/** Splits text in chunks of about maxChars at line boundaries (for AI extraction). */
export function chunkText(text: string, maxChars = 12000): string[] {
  const chunks: string[] = [];
  let cur = '';
  for (const l of text.split(/\r?\n/)) {
    if (cur.length + l.length + 1 > maxChars && cur) { chunks.push(cur); cur = ''; }
    cur += l + '\n';
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}
