import { AppDataSource } from '../config/database';
import { PriceList, PriceListStatus } from '../entities/PriceList';
import { ArticleService } from './ArticleService';
import { S3Service } from './S3Service';
import {
  Cell, CodeCandidate, ColumnMapping, ParsedArticle, analyzeCodeColumns, buildArticles, chunkText, detectHeaderRow, fileKind,
  guessMapping, normalizeCode, parsePdfLines, pdfText, readWorkbook, sheetRows,
} from './PriceListParser';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

const PREVIEW_ROWS = 40;
const UPSERT_CHUNK = 1000;

const MAPPED_FIELDS = ['code', 'description', 'price', 'unit', 'variant', 'internal_code'] as const;
type MappedField = typeof MAPPED_FIELDS[number];

export type SavedMapping = ColumnMapping & {
  header_names?: Partial<Record<MappedField, string>>;
};

export interface PreviewOptions {
  sheet?: string;
  mapping?: Partial<ColumnMapping>;
  // mapping of the previous list of the same supplier, matched again by header text
  previous?: SavedMapping | null;
  // codes written on this supplier's invoices, to recognise the code column
  invoiceCodes?: Set<string>;
}

/** How the code column was chosen, shown in the preview. */
export interface CodeCheck {
  source: 'user' | 'saved' | 'auto';
  confident: boolean;           // false: ask the user to confirm the column
  candidates: CodeCandidate[];  // best first
  invoice_codes: number;        // codes known from this supplier's invoices
}

export interface ImportOptions {
  companyId: string;
  name?: string;
  validFrom?: string | null;
  currency?: string;
  notes?: string;
  mapping?: Partial<ColumnMapping>;
  useAi?: boolean;
  userId: string;
}

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/** Rows of the file plus the mapping to use (given, or guessed). */
async function readRows(file: Express.Multer.File, opts: PreviewOptions) {
  const kind = fileKind(file.originalname, file.mimetype);
  if (!kind) throw new Error('Formato non supportato: carica un file Excel (.xlsx, .xls), CSV o PDF');

  if (kind === 'pdf') {
    const { text, pages } = await pdfText(file.buffer);
    if (!text || text.trim().length < 20) {
      throw new Error('Dal PDF non si legge testo (probabilmente è una scansione). Serve un PDF con testo o il file Excel del listino.');
    }
    const parsed = parsePdfLines(text);
    const mapping: ColumnMapping = { header_row: 0, code: 0, description: 1, unit: 2, price: 3, extra_columns: [] };
    return { kind, sheets: [] as string[], sheet: undefined, rows: parsed.rows, mapping, codeCheck: null as CodeCheck | null, pdf: { pages, lines: parsed.lines, unparsed_samples: parsed.unparsed_samples, text } };
  }

  const wb = readWorkbook(file.buffer, kind);
  const prevSheet = opts.previous?.sheet;
  const wanted = opts.sheet || (prevSheet && wb.SheetNames.includes(prevSheet) ? prevSheet : undefined);
  const sheet = wanted && wb.SheetNames.includes(wanted) ? wanted : wb.SheetNames[0];
  const rows = sheetRows(wb, sheet);
  const headerRow = opts.mapping?.header_row ?? detectHeaderRow(rows);
  const guessed = guessMapping(rows, headerRow);
  const m: Partial<ColumnMapping> = opts.mapping || reuseByHeaderName(rows, headerRow, opts.previous);

  // The code column: chosen by the user, the one used last time for this
  // supplier, or recognised from the data (one code per row, found on invoices)
  const analysis = analyzeCodeColumns(rows, headerRow, opts.invoiceCodes);
  // a price column is never the code
  const priceCol = m.price ?? guessed.price;
  analysis.candidates = analysis.candidates.filter(c => c.index !== priceCol);
  const invoiceCount = opts.invoiceCodes?.size || 0;
  let code = guessed.code;
  let source: CodeCheck['source'] = 'auto';
  let confident = false;
  if (opts.mapping?.code !== undefined) { code = opts.mapping.code; source = 'user'; confident = true; }
  // a saved choice is reused unless that column repeats the same few values on
  // almost every row (e.g. a list imported earlier with the wrong column)
  else if (m.code !== undefined && m.code >= 0 && analysis.candidates.some(c => c.index === m.code && (c.unique_ratio >= 0.1 || c.invoice_hits > 0))) {
    code = m.code; source = 'saved'; confident = true;
  } else {
    const byHeader = analysis.candidates.find(c => c.index === guessed.code);
    const best = analysis.candidates[0];
    // keep the column whose header says "codice" unless almost every row repeats
    // the same few values (a category, e.g. "Cod. merceologico") or the invoices
    // point clearly to another column
    const headerOk = byHeader && byHeader.unique_ratio >= 0.1 && (!best || byHeader.invoice_hits >= best.invoice_hits);
    if (headerOk) {
      // the column named "codice" looks right: keep it
      code = guessed.code;
      confident = byHeader!.invoice_hits > 0 || byHeader!.unique_ratio >= 0.9 || (guessed.internal_code ?? -1) >= 0;
    } else if (best) {
      code = best.index;
      const second = analysis.candidates[1];
      confident = best.invoice_hits > 0
        ? !second || best.invoice_hits >= second.invoice_hits * 2
        : best.unique_ratio >= 0.95 && !analysis.candidates.some(c => c !== best && c.unique_ratio >= 0.9);
    }
  }
  const sameAsHeader = code === guessed.code;
  const mapping: ColumnMapping = {
    sheet,
    header_row: headerRow,
    code,
    description: m.description ?? (guessed.description === code ? -1 : guessed.description),
    price: m.price ?? guessed.price,
    unit: m.unit ?? guessed.unit,
    variant: m.variant ?? (sameAsHeader ? guessed.variant ?? -1 : -1),
    internal_code: m.internal_code ?? (sameAsHeader ? guessed.internal_code ?? -1 : -1),
    extra_columns: m.extra_columns,
  };
  const codeCheck: CodeCheck = { source, confident, candidates: analysis.candidates.slice(0, 6), invoice_codes: invoiceCount };
  return { kind, sheets: wb.SheetNames, sheet, rows, mapping, codeCheck, pdf: null as null | { pages: number; lines: number; unparsed_samples: string[]; text: string } };
}

const headerKey = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Columns chosen for the previous list of the same supplier, found again by
 * their header text (the new file may have a different title block or column order).
 */
function reuseByHeaderName(rows: Cell[][], headerRow: number, previous?: SavedMapping | null): Partial<ColumnMapping> {
  const names = previous?.header_names;
  if (!names || headerRow < 0) return {};
  const headers = (rows[headerRow] || []).map(headerKey);
  const out: Partial<ColumnMapping> = {};
  for (const field of MAPPED_FIELDS) {
    const name = names[field];
    if (!name) continue;
    const idx = headers.indexOf(headerKey(name));
    if (idx >= 0) out[field] = idx;
  }
  return out;
}

/** Header text of the mapped columns, saved with the list to propose them next time. */
function withHeaderNames(rows: Cell[][], mapping: ColumnMapping): SavedMapping {
  const headers = mapping.header_row >= 0 ? rows[mapping.header_row] || [] : [];
  const name = (i: number) => (i >= 0 && headers[i] !== null && headers[i] !== undefined && String(headers[i]).trim() ? String(headers[i]).trim() : undefined);
  return {
    ...mapping,
    header_names: Object.fromEntries(MAPPED_FIELDS.map(f => [f, name(mapping[f] ?? -1)])),
  };
}

export class PriceListService {
  private repo = AppDataSource.getRepository(PriceList);
  private articles = new ArticleService();
  private s3 = new S3Service();

  /** What the file contains and what an import with this mapping would give. */
  async preview(file: Express.Multer.File, opts: PreviewOptions & { companyId?: string }) {
    const invoiceCodes = opts.companyId ? await this.invoiceCodes(opts.companyId) : undefined;
    const r = await readRows(file, { ...opts, invoiceCodes });
    const result = buildArticles(r.rows, r.mapping);
    const width = Math.max(0, ...r.rows.slice(0, 200).map(row => row.length));
    return {
      kind: r.kind,
      sheets: r.sheets,
      sheet: r.sheet,
      total_rows: r.rows.length,
      width,
      rows: r.rows.slice(0, Math.max(PREVIEW_ROWS, r.mapping.header_row + PREVIEW_ROWS)),
      mapping: r.mapping,
      result: {
        articles: result.articles.length,
        rows_read: result.rows_read,
        rows_skipped: result.rows_skipped,
        duplicates: result.duplicates,
        sample: result.articles.slice(0, 15),
        skipped_samples: result.skipped_samples,
        skipped_reasons: result.skipped_reasons,
      },
      code_check: r.codeCheck,
      pdf: r.pdf ? { pages: r.pdf.pages, lines: r.pdf.lines, unparsed_samples: r.pdf.unparsed_samples } : null,
      ai_available: !!process.env.ANTHROPIC_API_KEY,
    };
  }

  async import(file: Express.Multer.File, opts: ImportOptions) {
    const r = await readRows(file, { sheet: opts.mapping?.sheet, mapping: opts.mapping });
    const useAi = r.kind === 'pdf' && !!opts.useAi;

    const priceList = this.repo.create({
      company_id: opts.companyId,
      name: (opts.name || file.originalname.replace(/\.[^.]+$/, '')).substring(0, 200),
      valid_from: opts.validFrom || null,
      currency: opts.currency || 'EUR',
      source_type: useAi ? 'pdf_ai' : r.kind,
      original_filename: file.originalname,
      status: PriceListStatus.PROCESSING,
      progress: 0,
      column_mapping: useAi || r.kind === 'pdf' ? null : withHeaderNames(r.rows, r.mapping),
      notes: opts.notes || null,
      uploaded_by_user_id: opts.userId,
    });
    await this.repo.save(priceList);

    // Keep the original file (best effort: the import works without S3)
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      try {
        const ext = (file.originalname.split('.').pop() || 'bin').toLowerCase();
        const key = `price-lists/${uuidv4()}.${ext}`;
        await this.s3.uploadFile(key, file.buffer, MIME[r.kind] || 'application/octet-stream');
        priceList.s3_key = key;
        await this.repo.save(priceList);
      } catch (e) {
        console.warn('[PRICELIST] S3 upload failed:', (e as Error).message);
      }
    }

    if (useAi) {
      // Large PDFs take minutes: run in the background, the page polls the status
      this.importWithAi(priceList.id, r.pdf!.text).catch(err => console.error('[PRICELIST] AI import failed:', err.message));
      return { price_list: priceList, background: true };
    }

    const built = buildArticles(r.rows, r.mapping);
    if (!built.articles.length) {
      priceList.status = PriceListStatus.ERROR;
      priceList.error_message = 'Nessun articolo trovato: controlla le colonne di codice e prezzo.';
      priceList.rows_read = built.rows_read;
      priceList.rows_skipped = built.rows_skipped;
      await this.repo.save(priceList);
      return { price_list: priceList, background: false };
    }
    const saved = await this.saveArticles(priceList, built.articles, built.rows_read, built.rows_skipped);
    return { price_list: saved.priceList, match: saved.match, duplicates: built.duplicates, background: false };
  }

  /** Writes the articles of a list in bulk (chunks of 1000 rows), then re-links invoice lines. */
  private async saveArticles(priceList: PriceList, list: ParsedArticle[], rowsRead: number, rowsSkipped: number) {
    const started = Date.now();
    await AppDataSource.transaction(async (m) => {
      for (let i = 0; i < list.length; i += UPSERT_CHUNK) {
        const chunk = list.slice(i, i + UPSERT_CHUNK);
        const values: any[] = [];
        const tuples = chunk.map((a, j) => {
          const b = j * 10;
          values.push(uuidv4(), priceList.company_id, a.code, a.normalized_code, a.description, a.unit, a.extra ? JSON.stringify(a.extra) : null,
            a.match_code, a.base_code, a.alt_code);
          return `($${b + 1}::uuid, $${b + 2}::uuid, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}::jsonb, $${b + 8}, $${b + 9}, $${b + 10}, now(), now())`;
        });
        const ids: { id: string; normalized_code: string }[] = await m.query(
          `INSERT INTO articles (id, company_id, code, normalized_code, description, unit, extra, match_code, base_code, alt_code, created_at, updated_at)
           VALUES ${tuples.join(',')}
           ON CONFLICT (company_id, normalized_code) DO UPDATE SET
             code = EXCLUDED.code,
             description = COALESCE(EXCLUDED.description, articles.description),
             unit = COALESCE(EXCLUDED.unit, articles.unit),
             extra = COALESCE(EXCLUDED.extra, articles.extra),
             match_code = EXCLUDED.match_code,
             base_code = EXCLUDED.base_code,
             alt_code = EXCLUDED.alt_code,
             manual = false,
             updated_at = now()
           RETURNING id, normalized_code`, values);
        const idByCode = new Map(ids.map(x => [x.normalized_code, x.id]));
        const pv: any[] = [];
        const pt = chunk.map((a, j) => {
          pv.push(uuidv4(), idByCode.get(a.normalized_code), priceList.id, a.price);
          return `($${j * 4 + 1}::uuid, $${j * 4 + 2}::uuid, $${j * 4 + 3}::uuid, $${j * 4 + 4})`;
        });
        await m.query(
          `INSERT INTO article_prices (id, article_id, price_list_id, price) VALUES ${pt.join(',')}
           ON CONFLICT (price_list_id, article_id) DO UPDATE SET price = EXCLUDED.price`, pv);
      }
      await m.query(
        `UPDATE price_lists SET status = 'ready', progress = 100, error_message = NULL,
           article_count = $2, rows_read = $3, rows_skipped = $4, updated_at = now() WHERE id = $1`,
        [priceList.id, list.length, rowsRead, rowsSkipped]);
      await this.articles.refreshCurrentPrices(priceList.company_id, m);
    });
    console.log(`[PRICELIST] ${priceList.id}: ${list.length} articles saved in ${Date.now() - started} ms`);
    const match = await this.articles.matchLineItems({ companyId: priceList.company_id });
    const fresh = await this.repo.findOneByOrFail({ id: priceList.id });
    return { priceList: fresh, match };
  }

  /** Reads a PDF price list with Claude, a chunk of text at a time. */
  private async importWithAi(priceListId: string, text: string) {
    const priceList = await this.repo.findOneByOrFail({ id: priceListId });
    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('Assistente AI non configurato (manca ANTHROPIC_API_KEY)');
      const client = new Anthropic({ apiKey });
      const chunks = chunkText(text, 8000);
      const rows: Cell[][] = [['Codice', 'Descrizione', 'UM', 'Prezzo']];
      let done = 0;
      const worker = async (queue: string[]) => {
        while (queue.length) {
          const chunk = queue.shift()!;
          rows.push(...await this.extractChunk(client, chunk));
          done++;
          await this.repo.update(priceListId, { progress: Math.min(99, Math.round((done / chunks.length) * 100)) });
        }
      };
      const queue = [...chunks];
      await Promise.all([worker(queue), worker(queue), worker(queue)]);
      const built = buildArticles(rows, { header_row: 0, code: 0, description: 1, unit: 2, price: 3, extra_columns: [] });
      if (!built.articles.length) throw new Error("L'AI non ha trovato articoli con codice e prezzo in questo PDF.");
      await this.saveArticles(priceList, built.articles, built.rows_read, built.rows_skipped);
    } catch (err) {
      await this.repo.update(priceListId, { status: PriceListStatus.ERROR, error_message: (err as Error).message });
      throw err;
    }
  }

  private async extractChunk(client: Anthropic, chunk: string): Promise<Cell[][]> {
    const response = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'low' },
      messages: [{
        role: 'user',
        content: `This is part of a supplier price list (listino prezzi) extracted from a PDF. List every article in it.

TEXT:
"""
${chunk}
"""

Return ONLY valid JSON: {"articles": [{"code": "article code exactly as printed", "description": "string or null", "unit": "mq | pz | ml | kg | cf | other or null", "price": number}]}

- Include only rows that have both an article code and a price. Skip headers, page numbers, notes, totals.
- If a row has several prices (e.g. per m² and per box), use the main list price per unit of sale.
- Prices may use a comma as decimal separator (24,50 = 24.5) and a dot for thousands (1.234,00 = 1234).
- If the text has no articles, return {"articles": []}.`,
      }],
    });
    const block = response.content.find(b => b.type === 'text');
    const textOut = block?.type === 'text' ? block.text : '';
    const json = textOut.match(/\{[\s\S]*\}/);
    if (!json) return [];
    try {
      const parsed = JSON.parse(json[0]);
      return (parsed.articles || []).map((a: any) => [a.code ?? null, a.description ?? null, a.unit ?? null, a.price ?? null]);
    } catch {
      return [];
    }
  }

  async list(companyId?: string) {
    const qb = this.repo.createQueryBuilder('pl')
      .leftJoinAndSelect('pl.company', 'company')
      .leftJoin('pl.uploaded_by_user', 'u').addSelect(['u.id', 'u.name'])
      .orderBy('pl.created_at', 'DESC');
    if (companyId) qb.where('pl.company_id = :companyId', { companyId });
    return qb.getMany();
  }

  /** Mapping of the last list imported for the company, to propose it again. */
  /** Article codes written on the invoices of a supplier (normalized, also without "_x"). */
  private async invoiceCodes(companyId: string): Promise<Set<string>> {
    const rows: { code: string }[] = await AppDataSource.query(
      `SELECT DISTINCT li.article_code AS code FROM invoice_line_items li
       JOIN invoices inv ON inv.id::text = li.invoice_id::text
       JOIN companies c ON c.id::text = inv.company_id::text
       -- also the invoices of companies that use this company's price lists (e.g. a group)
       WHERE (c.id::text = $1 OR $1 = ANY(c.price_list_sources)
              OR EXISTS (SELECT 1 FROM companies g WHERE $1 = ANY(g.group_members) AND c.id::text = ANY(g.group_members)))
         AND li.article_code IS NOT NULL AND li.article_code <> ''
       LIMIT 50000`, [companyId]);
    const set = new Set<string>();
    for (const r of rows) {
      const nc = normalizeCode(r.code);
      if (nc) set.add(nc);
      if (r.code.includes('_')) { const base = normalizeCode(r.code.replace(/_[^_]*$/, '')); if (base) set.add(base); }
    }
    return set;
  }

  async lastMapping(companyId: string): Promise<ColumnMapping | null> {
    const last = await this.repo.createQueryBuilder('pl')
      .where('pl.company_id = :companyId', { companyId })
      .andWhere("pl.status = 'ready'").andWhere('pl.column_mapping IS NOT NULL')
      .orderBy('pl.created_at', 'DESC').getOne();
    return last?.column_mapping || null;
  }

  async get(id: string) {
    return this.repo.findOne({ where: { id }, relations: ['company'] });
  }

  async update(id: string, data: { name?: string; valid_from?: string | null; notes?: string | null }) {
    const pl = await this.repo.findOneByOrFail({ id });
    if (data.name !== undefined) pl.name = data.name;
    if (data.valid_from !== undefined) pl.valid_from = data.valid_from || null;
    if (data.notes !== undefined) pl.notes = data.notes;
    await this.repo.save(pl);
    // the validity date decides which list is current and which price applies to each invoice
    await this.articles.refreshCurrentPrices(pl.company_id);
    await this.articles.matchLineItems({ companyId: pl.company_id });
    return pl;
  }

  /**
   * Removes a list and its prices. Articles that were only in this list are
   * removed too; the others go back to the price of the latest remaining list.
   */
  async remove(id: string) {
    const pl = await this.repo.findOneByOrFail({ id });
    await AppDataSource.transaction(async (m) => {
      await m.query(`DELETE FROM price_lists WHERE id = $1`, [id]); // cascades to article_prices
      await m.query(
        `DELETE FROM articles a WHERE a.company_id::text = $1 AND NOT a.manual
           AND NOT EXISTS (SELECT 1 FROM article_prices ap WHERE ap.article_id = a.id)`, [pl.company_id]);
      await this.articles.refreshCurrentPrices(pl.company_id, m);
    });
    if (pl.s3_key) { try { await this.s3.deleteFile(pl.s3_key); } catch { /* ignore */ } }
    await this.articles.matchLineItems({ companyId: pl.company_id });
  }

  async downloadUrl(id: string) {
    const pl = await this.repo.findOneByOrFail({ id });
    if (!pl.s3_key) throw new Error('Il file originale non è stato salvato');
    return this.s3.getDownloadUrl(pl.s3_key);
  }
}
