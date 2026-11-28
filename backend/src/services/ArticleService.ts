import { AppDataSource } from '../config/database';
import { normalizeCode } from './PriceListParser';
import { v4 as uuidv4 } from 'uuid';

/**
 * Articles of the supplier price lists, their link to invoice lines, and the
 * per-article sales statistics.
 *
 * Matching rule for an invoice line (same company as the invoice), first hit wins:
 *   1. code equals an article's invoice code (code + version) or internal code → matched
 *   2. code is an alias linked by hand to an article                         → alias
 *   3. code equals an article's code without version (list has versions,
 *      invoice not)                                                           → matched
 *   4. code without a trailing "_x" (price category, LEMUD111198_6 →
 *      LEMUD111198) equals an article's invoice code or code without version  → matched
 *   5. equal after dropping leading zeros                                     → matched
 *   otherwise → unmatched (or no_code when the line has no code).
 * When a step finds several articles (the same code in different materials or
 * finishes) the one whose description shares most words with the line wins.
 * The list price stored on the line is the one valid on the invoice date.
 */

// Same normalization as normalizeCode() in PriceListParser, in SQL
const SQL_NORMALIZE = (col: string) => `upper(regexp_replace(coalesce(${col}, ''), '[[:space:]./_\\\\-]+', '', 'g'))`;

export interface SalesFilters {
  company_id?: string;
  company_ids?: string[];
  client_id?: string;
  start_date?: string;
  end_date?: string;
}

// Words of a description, for choosing between articles with the same code
function wordsOf(text: string): Set<string> {
  return new Set(String(text).toUpperCase().split(/[^A-Z0-9Ø]+/).filter(w => w.length >= 2));
}

// One buyer: the client record, or the name on the invoice when no client is linked
const CLIENT_KEY = `COALESCE(inv.client_id::text, 'name:' || COALESCE(inv.customer_name, ''))`;

const num = (v: any) => (v === null || v === undefined ? 0 : Number(v));
const numOrNull = (v: any) => (v === null || v === undefined ? null : Number(v));

function salesWhere(f: SalesFilters, params: any[], alias = 'inv'): string {
  const w: string[] = [`${alias}.status = 'processed'`];
  if (f.company_id) { params.push(f.company_id); w.push(`${alias}.company_id::text = $${params.length}`); }
  if (f.company_ids?.length) { params.push(f.company_ids); w.push(`${alias}.company_id::text = ANY($${params.length}::text[])`); }
  if (f.client_id) { params.push(f.client_id); w.push(`${alias}.client_id::text = $${params.length}`); }
  if (f.start_date) { params.push(f.start_date); w.push(`${alias}.invoice_date >= $${params.length}`); }
  if (f.end_date) { params.push(f.end_date); w.push(`${alias}.invoice_date <= $${params.length}`); }
  return w.join(' AND ');
}

/**
 * The companies whose articles can be used for each company's invoices: the
 * company itself first, then the ones chosen in "price_list_sources".
 */
export async function articleCompanies(companyIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!companyIds.length) return out;
  const rows: { id: string; sources: string[] | null }[] = await AppDataSource.query(
    `SELECT id::text AS id, price_list_sources AS sources FROM companies WHERE id::text = ANY($1::text[])`, [companyIds]);
  for (const id of companyIds) out.set(id, [id]);
  for (const r of rows) out.set(r.id, [r.id, ...new Set((r.sources || []).filter(x => x && x !== r.id))]);
  return out;
}

/** Companies that use the price lists of companyId (besides itself). */
async function companiesUsing(companyId: string): Promise<string[]> {
  const rows = await AppDataSource.query(
    `SELECT id::text AS id FROM companies WHERE $1 = ANY(price_list_sources)`, [companyId]);
  return rows.map((r: any) => r.id).filter((id: string) => id !== companyId);
}

export class ArticleService {
  /**
   * Links invoice lines to articles. Pass invoiceIds to match some invoices,
   * or companyId to (re)match every line of a supplier, e.g. after a new list.
   */
  async matchLineItems(scope: { invoiceIds?: string[]; companyId?: string; normalizedCode?: string }): Promise<{ matched: number; unmatched: number; no_code: number }> {
    const params: any[] = [];
    const where: string[] = [];
    if (scope.invoiceIds?.length) { params.push(scope.invoiceIds); where.push(`li.invoice_id::text = ANY($${params.length}::text[])`); }
    if (scope.companyId) {
      // also the companies that use this company's price lists
      params.push([scope.companyId, ...await companiesUsing(scope.companyId)]);
      where.push(`inv.company_id::text = ANY($${params.length}::text[])`);
    }
    if (scope.normalizedCode) { params.push(scope.normalizedCode); where.push(`${SQL_NORMALIZE('li.article_code')} = $${params.length}`); }
    if (!where.length) throw new Error('matchLineItems needs a scope');

    const lines: { id: string; company_id: string; article_code: string | null; description: string | null }[] = await AppDataSource.query(
      `SELECT li.id::text AS id, inv.company_id::text AS company_id, li.article_code, li.description
       FROM invoice_line_items li
       JOIN invoices inv ON inv.id::text = li.invoice_id::text
       WHERE ${where.join(' AND ')}`,
      params,
    );
    if (!lines.length) return { matched: 0, unmatched: 0, no_code: 0 };

    const keysOf = (code: string | null) => {
      const nc = normalizeCode(code);
      const raw = code || '';
      const base = raw.includes('_') ? normalizeCode(raw.replace(/_[^_]*$/, '')) : '';
      return { nc, base: base && base !== nc ? base : '', nozeros: nc.replace(/^0+/, '') };
    };
    const invoiceCompanies = [...new Set(lines.map(l => l.company_id))];
    const sourcesOf = await articleCompanies(invoiceCompanies);
    const companies = [...new Set([...sourcesOf.values()].flat())];
    const keys = new Set<string>();
    const zkeys = new Set<string>();
    for (const l of lines) {
      const k = keysOf(l.article_code);
      if (k.nc) keys.add(k.nc);
      if (k.base) keys.add(k.base);
      if (k.nozeros) zkeys.add(k.nozeros);
    }

    type Cand = { id: string; company_id: string; match_code: string | null; base_code: string | null; alt_code: string | null; words: Set<string> };
    const candidates: Cand[] = [];
    const keyList = [...keys];
    for (let i = 0; i < Math.max(keyList.length, 1); i += 5000) {
      const chunk = keyList.slice(i, i + 5000);
      const zchunk = i === 0 ? [...zkeys] : [];
      if (!chunk.length && !zchunk.length) break;
      const rows = await AppDataSource.query(
        `SELECT id::text AS id, company_id::text AS company_id, match_code, base_code, alt_code, description, extra
         FROM articles
         WHERE company_id::text = ANY($1::text[])
           AND (match_code = ANY($2::text[]) OR alt_code = ANY($2::text[]) OR base_code = ANY($2::text[])
                OR ltrim(match_code, '0') = ANY($3::text[]))`,
        [companies, chunk, zchunk],
      );
      for (const r of rows) {
        const text = [r.description, ...Object.values(r.extra || {})].filter(v => typeof v === 'string').join(' ');
        candidates.push({ id: r.id, company_id: r.company_id, match_code: r.match_code, base_code: r.base_code, alt_code: r.alt_code, words: wordsOf(text) });
      }
    }
    const aliasRows: { company_id: string; normalized_code: string; article_id: string }[] = keyList.length
      ? await AppDataSource.query(
        `SELECT company_id::text AS company_id, normalized_code, article_id::text AS article_id
         FROM article_aliases WHERE company_id::text = ANY($1::text[]) AND normalized_code = ANY($2::text[])`,
        [invoiceCompanies, keyList])
      : [];
    const aliases = new Map(aliasRows.map(a => [`${a.company_id}|${a.normalized_code}`, a.article_id]));

    const pick = (found: Cand[], description: string | null): string | null => {
      if (!found.length) return null;
      if (found.length === 1) return found[0].id;
      const words = wordsOf(description || '');
      let best = found[0];
      let bestScore = -1;
      for (const c of [...found].sort((a, b) => a.id.localeCompare(b.id))) {
        let score = 0;
        words.forEach(w => { if (c.words.has(w)) score++; });
        if (score > bestScore) { best = c; bestScore = score; }
      }
      return best.id;
    };

    const ids: string[] = [];
    const articleIds: (string | null)[] = [];
    const statuses: string[] = [];
    const counts = { matched: 0, unmatched: 0, no_code: 0 };
    for (const l of lines) {
      const k = keysOf(l.article_code);
      let articleId: string | null = null;
      let status = 'unmatched';
      if (!k.nc) {
        status = 'no_code';
      } else {
        // the company's own articles first, then those of the companies whose
        // price lists it uses (e.g. a group invoicing its brands' articles)
        const own = candidates.filter(c => c.company_id === l.company_id);
        const others = (sourcesOf.get(l.company_id) || []).slice(1);
        const group = candidates.filter(c => others.includes(c.company_id));
        const find = (test: (c: Cand) => boolean) => pick(own.filter(test), l.description) || pick(group.filter(test), l.description);
        const steps: (() => string | null)[] = [
          () => find(c => c.match_code === k.nc) || find(c => c.alt_code === k.nc),
          () => aliases.get(`${l.company_id}|${k.nc}`) || null,
          () => find(c => c.base_code === k.nc),
          () => k.base ? find(c => c.match_code === k.base || c.base_code === k.base) : null,
          () => k.nozeros ? find(c => (c.match_code || '').replace(/^0+/, '') === k.nozeros) : null,
        ];
        for (let s = 0; s < steps.length && !articleId; s++) {
          articleId = steps[s]();
          if (articleId) status = s === 1 ? 'alias' : 'matched';
        }
      }
      ids.push(l.id);
      articleIds.push(articleId);
      statuses.push(status);
      if (status === 'no_code') counts.no_code++;
      else if (status === 'unmatched') counts.unmatched++;
      else counts.matched++;
    }

    // Codes still not found: try the same number written another way (e.g.
    // 0013288 on the invoice, PF60013288 in the list), but only when the
    // descriptions say it is the same article
    const pending = lines.map((l, i) => ({ l, i })).filter(x => statuses[x.i] === 'unmatched');
    if (pending.length) {
      const found = await this.similarCodeMatches(pending.map(x => x.l), sourcesOf);
      pending.forEach((x, j) => {
        if (!found[j]) return;
        articleIds[x.i] = found[j];
        statuses[x.i] = 'matched';
        counts.unmatched--;
        counts.matched++;
      });
    }

    await AppDataSource.query(
      `UPDATE invoice_line_items t
       SET article_id = v.article_id::uuid, match_status = v.status
       FROM unnest($1::text[], $2::text[], $3::text[]) AS v(id, article_id, status)
       WHERE t.id::text = v.id`,
      [ids, articleIds, statuses],
    );
    await AppDataSource.query(
      `UPDATE invoice_line_items t
       SET list_price = CASE WHEN t.article_id IS NULL THEN NULL ELSE (
         SELECT ap.price FROM article_prices ap
         JOIN price_lists pl ON pl.id = ap.price_list_id
         WHERE ap.article_id = t.article_id
         ORDER BY (COALESCE(pl.valid_from, pl.created_at::date) <= COALESCE(inv.invoice_date, current_date)) DESC,
                  CASE WHEN COALESCE(pl.valid_from, pl.created_at::date) <= COALESCE(inv.invoice_date, current_date)
                       THEN COALESCE(pl.valid_from, pl.created_at::date) END DESC NULLS LAST,
                  COALESCE(pl.valid_from, pl.created_at::date) ASC,
                  pl.created_at DESC
         LIMIT 1) END
       FROM invoices inv
       WHERE inv.id::text = t.invoice_id::text AND t.id::text = ANY($1::text[])`,
      [ids],
    );
    return counts;
  }

  /**
   * For each line, the article whose code ends with the invoice code (or the
   * other way round), ignoring leading zeros and letters such as "PF600", when
   * the descriptions match too. Null when there is no such article or more than one.
   */
  private async similarCodeMatches(
    lines: { company_id: string; article_code: string | null; description: string | null }[],
    sourcesOf: Map<string, string[]>,
  ): Promise<(string | null)[]> {
    const MIN = 5; // shorter numbers match too many articles
    const tail = (code: string) => code.replace(/^0+/, '');
    const usable = lines.map(l => {
      const nc = normalizeCode(l.article_code);
      const words = wordsOf(l.description || '');
      return nc && tail(nc).length >= MIN && words.size >= 2 ? { nc, words } : null;
    });
    const companies = [...new Set(lines.filter((_, i) => usable[i]).flatMap(l => sourcesOf.get(l.company_id) || [l.company_id]))];
    if (!companies.length) return lines.map(() => null);

    const articles: { id: string; company_id: string; match_code: string; description: string | null }[] = await AppDataSource.query(
      `SELECT id::text AS id, company_id::text AS company_id, match_code, description
       FROM articles WHERE company_id::text = ANY($1::text[]) AND match_code IS NOT NULL`, [companies]);
    // only the keys the invoices need: their code, and its endings for list
    // codes shorter than the invoice code
    const wanted = new Set<string>();
    const wantedEndings = new Set<string>();
    for (const u of usable) {
      if (!u) continue;
      wanted.add(tail(u.nc));
      for (let k = 1; k <= u.nc.length - MIN; k++) wantedEndings.add(tail(u.nc.slice(k)));
    }
    const byEnding = new Map<string, number[]>();
    const byCode = new Map<string, number[]>();
    const add = (map: Map<string, number[]>, key: string, i: number) => {
      const list = map.get(key);
      if (!list) map.set(key, [i]);
      else if (list[list.length - 1] !== i) list.push(i);
    };
    articles.forEach((a, i) => {
      const code = a.match_code;
      for (let k = 0; k <= code.length - MIN; k++) {
        const end = tail(code.slice(k));
        if (wanted.has(end)) add(byEnding, end, i);
      }
      const whole = tail(code);
      if (wantedEndings.has(whole)) add(byCode, whole, i);
    });

    return lines.map((l, j) => {
      const u = usable[j];
      if (!u) return null;
      const allowed = sourcesOf.get(l.company_id) || [l.company_id];
      const found = new Set<number>(byEnding.get(tail(u.nc)) || []);
      // the invoice code is the longer one: the list code is one of its endings
      for (let k = 1; k <= u.nc.length - MIN; k++) (byCode.get(tail(u.nc.slice(k))) || []).forEach(i => found.add(i));
      const good = [...found]
        .filter(i => allowed.includes(articles[i].company_id))
        .filter(i => {
          const words = wordsOf(articles[i].description || '');
          let same = 0;
          u.words.forEach(w => { if (words.has(w)) same++; });
          return same / u.words.size >= 0.7;
        });
      if (!good.length) return null;
      // prefer the company's own articles; more than one candidate is a doubt
      const own = good.filter(i => articles[i].company_id === l.company_id);
      const pickFrom = own.length ? own : good;
      return pickFrom.length === 1 ? articles[pickFrom[0]].id : null;
    });
  }

  /** Updates articles.list_price / price_list_id to the most recent list of the company. */
  async refreshCurrentPrices(companyId: string, runner = AppDataSource.manager): Promise<void> {
    await runner.query(
      `UPDATE articles a SET list_price = x.price, price_list_id = x.price_list_id, updated_at = now()
       FROM (
         SELECT DISTINCT ON (ap.article_id) ap.article_id, ap.price, ap.price_list_id
         FROM article_prices ap JOIN price_lists pl ON pl.id = ap.price_list_id
         WHERE pl.company_id::text = $1 AND pl.status = 'ready'
         ORDER BY ap.article_id, COALESCE(pl.valid_from, pl.created_at::date) DESC, pl.created_at DESC
       ) x
       WHERE a.id = x.article_id AND (a.list_price IS DISTINCT FROM x.price OR a.price_list_id IS DISTINCT FROM x.price_list_id)`,
      [companyId],
    );
  }

  /* ─────────────── Catalogue and statistics ─────────────── */

  async listArticles(f: SalesFilters & {
    search?: string; code_search?: string; description_search?: string; only_sold?: boolean; sort?: string; page?: number; limit?: number;
  }) {
    const params: any[] = [];
    const sales = salesWhere({ ...f, company_id: undefined, company_ids: undefined }, params);
    const aw: string[] = [];
    if (f.company_id) { params.push(await this.withSources(f.company_id)); aw.push(`a.company_id::text = ANY($${params.length}::text[])`); }
    if (f.company_ids?.length) { params.push(f.company_ids); aw.push(`a.company_id::text = ANY($${params.length}::text[])`); }
    // Every word must be found in the code or in the description, so "nd603",
    // "satinato indigo" and "nd603 satinato" all work
    for (const word of (f.search || '').trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
      const nc = normalizeCode(word);
      params.push(`%${word}%`);
      const conds = [`a.description ILIKE $${params.length}`, `a.code ILIKE $${params.length}`];
      if (nc) {
        params.push(`%${nc}%`);
        conds.push(`a.normalized_code LIKE $${params.length}`, `a.match_code LIKE $${params.length}`, `a.alt_code LIKE $${params.length}`);
      }
      aw.push(`(${conds.join(' OR ')})`);
    }
    // Separate fields: the code only in the codes, the words only in the description
    if (f.code_search?.trim()) {
      const term = f.code_search.trim();
      const nc = normalizeCode(term);
      params.push(`%${term}%`);
      const conds = [`a.code ILIKE $${params.length}`];
      if (nc) {
        params.push(`%${nc}%`);
        conds.push(`a.normalized_code LIKE $${params.length}`, `a.match_code LIKE $${params.length}`, `a.alt_code LIKE $${params.length}`);
      }
      aw.push(`(${conds.join(' OR ')})`);
    }
    for (const word of (f.description_search || '').trim().split(/\s+/).filter(Boolean).slice(0, 8)) {
      params.push(`%${word}%`);
      aw.push(`a.description ILIKE $${params.length}`);
    }
    if (f.only_sold) aw.push('s.article_id IS NOT NULL');
    const order = ({
      revenue: 's.revenue DESC NULLS LAST, a.code',
      quantity: 's.quantity DESC NULLS LAST, a.code',
      price: 'a.list_price DESC NULLS LAST, a.code',
      discount: 's.avg_discount DESC NULLS LAST, a.code',
      last: 's.last_date DESC NULLS LAST, a.code',
      code: 'a.code',
    } as Record<string, string>)[f.sort || ''] || (f.only_sold ? 's.revenue DESC NULLS LAST, a.code' : 'a.code');
    const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 500);
    const page = Math.max(Number(f.page) || 1, 1);

    const base = `
      FROM articles a
      JOIN companies c ON c.id::text = a.company_id::text
      LEFT JOIN (
        SELECT li.article_id,
               SUM(li.quantity) AS quantity, SUM(li.line_total) AS revenue,
               COUNT(*) AS lines, COUNT(DISTINCT li.invoice_id) AS invoices,
               COUNT(DISTINCT inv.client_id) AS clients,
               MAX(inv.invoice_date) AS last_date,
               SUM(li.line_total) / NULLIF(SUM(li.quantity), 0) AS avg_net_price,
               1 - SUM(li.line_total) FILTER (WHERE li.list_price > 0)
                   / NULLIF(SUM(li.quantity * li.list_price) FILTER (WHERE li.list_price > 0), 0) AS avg_discount
        FROM invoice_line_items li
        JOIN invoices inv ON inv.id::text = li.invoice_id::text
        WHERE li.article_id IS NOT NULL AND ${sales}
        GROUP BY li.article_id
      ) s ON s.article_id = a.id
      ${aw.length ? 'WHERE ' + aw.join(' AND ') : ''}`;

    const [rows, count] = await Promise.all([
      AppDataSource.query(
        `SELECT a.id, a.company_id, c.name AS company_name, a.code, a.description, a.unit, a.list_price, a.extra,
                a.manual, a.discontinued,
                s.quantity, s.revenue, s.lines, s.invoices, s.clients, s.last_date, s.avg_net_price, s.avg_discount
         ${base} ORDER BY ${order} LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params),
      AppDataSource.query(`SELECT count(*)::int AS n ${base}`, params),
    ]);
    return {
      articles: rows.map((r: any) => ({
        ...r,
        list_price: numOrNull(r.list_price),
        quantity: num(r.quantity), revenue: num(r.revenue), lines: num(r.lines), invoices: num(r.invoices), clients: num(r.clients),
        avg_net_price: numOrNull(r.avg_net_price), avg_discount: numOrNull(r.avg_discount),
      })),
      total: count[0]?.n || 0, page, limit,
    };
  }

  /** Overview: how much of the invoiced amount is linked to price-list articles. */
  async summary(f: SalesFilters) {
    const params: any[] = [];
    const sales = salesWhere(f, params);
    const [cov] = await AppDataSource.query(
      `SELECT COUNT(*)::int AS lines,
              COUNT(*) FILTER (WHERE li.article_id IS NOT NULL)::int AS matched_lines,
              COUNT(*) FILTER (WHERE li.match_status = 'unmatched')::int AS unmatched_lines,
              COUNT(*) FILTER (WHERE li.match_status = 'no_code')::int AS no_code_lines,
              COUNT(*) FILTER (WHERE li.match_status IS NULL)::int AS unchecked_lines,
              COALESCE(SUM(li.line_total), 0) AS revenue,
              COALESCE(SUM(li.line_total) FILTER (WHERE li.article_id IS NOT NULL), 0) AS matched_revenue,
              COUNT(DISTINCT li.article_id)::int AS articles_sold,
              COUNT(DISTINCT ${SQL_NORMALIZE('li.article_code')}) FILTER (WHERE li.match_status = 'unmatched')::int AS unmatched_codes,
              1 - SUM(li.line_total) FILTER (WHERE li.list_price > 0)
                  / NULLIF(SUM(li.quantity * li.list_price) FILTER (WHERE li.list_price > 0), 0) AS avg_discount
       FROM invoice_line_items li JOIN invoices inv ON inv.id::text = li.invoice_id::text
       WHERE ${sales}`, params);

    const cParams: any[] = [];
    const cw: string[] = [];
    if (f.company_id) { cParams.push(await this.withSources(f.company_id)); cw.push(`a.company_id::text = ANY($${cParams.length}::text[])`); }
    if (f.company_ids?.length) { cParams.push(f.company_ids); cw.push(`a.company_id::text = ANY($${cParams.length}::text[])`); }
    const catalogue = await AppDataSource.query(
      `SELECT a.company_id, c.name AS company_name, COUNT(*)::int AS articles
       FROM articles a JOIN companies c ON c.id::text = a.company_id::text
       ${cw.length ? 'WHERE ' + cw.join(' AND ') : ''}
       GROUP BY a.company_id, c.name ORDER BY c.name`, cParams);

    return {
      lines: cov.lines, matched_lines: cov.matched_lines, unmatched_lines: cov.unmatched_lines,
      no_code_lines: cov.no_code_lines, unchecked_lines: cov.unchecked_lines,
      revenue: num(cov.revenue), matched_revenue: num(cov.matched_revenue),
      articles_sold: cov.articles_sold, unmatched_codes: cov.unmatched_codes,
      avg_discount: numOrNull(cov.avg_discount),
      catalogue,
      catalogue_articles: catalogue.reduce((s: number, r: any) => s + r.articles, 0),
    };
  }

  async getArticleDetail(id: string, f: SalesFilters) {
    const [article] = await AppDataSource.query(
      `SELECT a.*, c.name AS company_name, pl.name AS price_list_name
       FROM articles a JOIN companies c ON c.id::text = a.company_id::text
       LEFT JOIN price_lists pl ON pl.id = a.price_list_id
       WHERE a.id::text = $1`, [id]);
    if (!article) return null;

    const prices = await AppDataSource.query(
      `SELECT ap.price, pl.id AS price_list_id, pl.name, pl.valid_from, pl.created_at
       FROM article_prices ap JOIN price_lists pl ON pl.id = ap.price_list_id
       WHERE ap.article_id::text = $1
       ORDER BY COALESCE(pl.valid_from, pl.created_at::date) DESC, pl.created_at DESC`, [id]);

    const params: any[] = [id];
    const sales = salesWhere({ ...f, company_id: undefined, company_ids: undefined }, params);
    const from = `FROM invoice_line_items li JOIN invoices inv ON inv.id::text = li.invoice_id::text
                  LEFT JOIN clients cl ON cl.id::text = inv.client_id::text
                  WHERE li.article_id::text = $1 AND ${sales}`;
    const agg = `SUM(li.quantity) AS quantity, SUM(li.line_total) AS revenue, COUNT(*)::int AS lines,
                 SUM(li.line_total) / NULLIF(SUM(li.quantity), 0) AS avg_net_price,
                 1 - SUM(li.line_total) FILTER (WHERE li.list_price > 0)
                     / NULLIF(SUM(li.quantity * li.list_price) FILTER (WHERE li.list_price > 0), 0) AS avg_discount`;

    // Last, lowest and highest net price with the quantity, date and invoice of
    // that purchase: for the article overall and for each client
    const point = `jsonb_build_object('price', li.line_total / li.quantity, 'quantity', li.quantity, 'unit', li.unit,
                     'date', inv.invoice_date, 'invoice_number', inv.invoice_number,
                     'client_name', COALESCE(cl.name, inv.customer_name))`;
    const pricePoints = (partition: string) => AppDataSource.query(
      `SELECT DISTINCT ON (k) k AS client_key, last, min, max FROM (
         SELECT ${partition} AS k,
           first_value(${point}) OVER (PARTITION BY ${partition} ORDER BY inv.invoice_date DESC NULLS LAST, inv.invoice_number DESC, li.line_number DESC) AS last,
           first_value(${point}) OVER (PARTITION BY ${partition} ORDER BY li.line_total / li.quantity ASC, inv.invoice_date DESC NULLS LAST) AS min,
           first_value(${point}) OVER (PARTITION BY ${partition} ORDER BY li.line_total / li.quantity DESC, inv.invoice_date DESC NULLS LAST) AS max
         ${from} AND li.quantity > 0 AND li.line_total IS NOT NULL
       ) x`, params);

    const [totals, byMonth, byClient, lines, aliases, overallPoints, clientPoints] = await Promise.all([
      AppDataSource.query(`SELECT ${agg}, COUNT(DISTINCT inv.id)::int AS invoices, COUNT(DISTINCT inv.client_id)::int AS clients,
                           MIN(li.line_total / NULLIF(li.quantity, 0)) AS min_net_price, MAX(li.line_total / NULLIF(li.quantity, 0)) AS max_net_price,
                           MAX(inv.invoice_date) AS last_date ${from}`, params),
      AppDataSource.query(`SELECT TO_CHAR(inv.invoice_date, 'YYYY-MM') AS month, ${agg} ${from} AND inv.invoice_date IS NOT NULL
                           GROUP BY 1 ORDER BY 1 DESC`, params),
      AppDataSource.query(`SELECT ${CLIENT_KEY} AS client_key, MAX(inv.client_id::text) AS client_id,
                           COALESCE(MAX(cl.name), MAX(inv.customer_name), 'Cliente non assegnato') AS client_name, MAX(cl.country) AS country,
                           ${agg}, COUNT(DISTINCT inv.id)::int AS invoices, MAX(inv.invoice_date) AS last_date ${from}
                           GROUP BY 1 ORDER BY revenue DESC NULLS LAST`, params),
      AppDataSource.query(`SELECT li.id, li.invoice_id, inv.invoice_number, inv.invoice_date, COALESCE(cl.name, inv.customer_name) AS client_name,
                           li.article_code, li.description, li.quantity, li.unit, li.unit_price, li.discount_percent, li.line_total, li.list_price, li.match_status
                           ${from} ORDER BY inv.invoice_date DESC NULLS LAST, li.line_number LIMIT 200`, params),
      AppDataSource.query(`SELECT normalized_code FROM article_aliases WHERE article_id::text = $1 ORDER BY normalized_code`, [id]),
      pricePoints(`'all'`),
      pricePoints(CLIENT_KEY),
    ]);
    const related = await AppDataSource.query(
      `SELECT id::text AS id, code, description, discontinued, (id::text = $2) AS is_successor
       FROM articles WHERE id::text = $2 OR replaced_by_id::text = $1
       ORDER BY code`, [id, article.replaced_by_id ? String(article.replaced_by_id) : '']);
    const fixPoint = (p: any) => (p ? { ...p, price: Number(p.price), quantity: Number(p.quantity) } : null);
    const points = (p: any) => ({ last: fixPoint(p?.last), min: fixPoint(p?.min), max: fixPoint(p?.max) });
    const pointsByClient = new Map(clientPoints.map((p: any) => [p.client_key, points(p)]));

    const fix = (r: any) => ({
      ...r,
      quantity: num(r.quantity), revenue: num(r.revenue),
      avg_net_price: numOrNull(r.avg_net_price), avg_discount: numOrNull(r.avg_discount),
    });
    return {
      article: { ...article, list_price: numOrNull(article.list_price) },
      prices: prices.map((p: any) => ({ ...p, price: Number(p.price) })),
      aliases: aliases.map((a: any) => a.normalized_code),
      replaced_by: related.find((r: any) => r.is_successor) || null,
      replaces: related.filter((r: any) => !r.is_successor),
      totals: {
        ...fix(totals[0] || {}), min_net_price: numOrNull(totals[0]?.min_net_price), max_net_price: numOrNull(totals[0]?.max_net_price),
        prices: points(overallPoints[0]),
      },
      by_month: byMonth.map(fix),
      by_client: byClient.map((c: any) => ({ ...fix(c), prices: pointsByClient.get(c.client_key) || points(null) })),
      lines: lines.map((l: any) => ({
        ...l,
        quantity: num(l.quantity), unit_price: num(l.unit_price), line_total: num(l.line_total), list_price: numOrNull(l.list_price),
        net_price: Number(l.quantity) ? Number(l.line_total) / Number(l.quantity) : null,
      })),
    };
  }

  /** Codes found on invoices that are not in any price list of that supplier. */
  async unmatchedCodes(f: SalesFilters) {
    const params: any[] = [];
    const sales = salesWhere(f, params);
    const rows = await AppDataSource.query(
      `SELECT inv.company_id, c.name AS company_name, ${SQL_NORMALIZE('li.article_code')} AS normalized_code,
              MIN(li.article_code) AS code, MAX(li.description) AS description, MAX(li.unit) AS unit,
              COUNT(*)::int AS lines, COUNT(DISTINCT inv.id)::int AS invoices,
              SUM(li.quantity) AS quantity, SUM(li.line_total) AS revenue, MAX(inv.invoice_date) AS last_date
       FROM invoice_line_items li
       JOIN invoices inv ON inv.id::text = li.invoice_id::text
       JOIN companies c ON c.id::text = inv.company_id::text
       WHERE li.match_status = 'unmatched' AND ${sales}
       GROUP BY inv.company_id, c.name, 3
       ORDER BY revenue DESC NULLS LAST
       LIMIT 500`, params);
    return rows.map((r: any) => ({ ...r, quantity: num(r.quantity), revenue: num(r.revenue) }));
  }

  /** Links a code written on invoices to an article, then re-matches the lines with that code. */
  async linkCode(companyId: string, code: string, articleId: string) {
    const nc = normalizeCode(code);
    if (!nc) throw new Error('Codice non valido');
    const [article] = await AppDataSource.query(`SELECT id, company_id FROM articles WHERE id::text = $1`, [articleId]);
    if (!article) throw new Error('Articolo non trovato');
    if (!(await this.withSources(companyId)).includes(String(article.company_id))) {
      throw new Error("L'articolo è di un'azienda di cui non si usano i listini");
    }
    await AppDataSource.query(
      `INSERT INTO article_aliases (id, company_id, normalized_code, article_id, created_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (company_id, normalized_code) DO UPDATE SET article_id = EXCLUDED.article_id`,
      [uuidv4(), companyId, nc, articleId]);
    return this.matchLineItems({ companyId, normalizedCode: nc });
  }

  /**
   * Creates an article that is not in any price list from a code found on
   * invoices (e.g. an old version out of production), so its sales get their
   * own statistics. Then links the invoice lines with that code to it.
   */
  async createManualArticle(data: {
    company_id: string; code: string; description?: string | null; unit?: string | null;
    discontinued?: boolean; replaced_by_id?: string | null;
  }) {
    const code = String(data.code || '').trim();
    const nc = normalizeCode(code);
    if (!nc) throw new Error('Codice non valido');
    const [exists] = await AppDataSource.query(
      `SELECT id FROM articles WHERE company_id::text = $1 AND (normalized_code = $2 OR match_code = $2)`, [data.company_id, nc]);
    if (exists) throw new Error(`Esiste già un articolo con il codice ${code}`);
    if (data.replaced_by_id) await this.checkSameCompany(data.replaced_by_id, data.company_id);
    const id = uuidv4();
    await AppDataSource.query(
      `INSERT INTO articles (id, company_id, code, normalized_code, match_code, base_code, description, unit,
                             manual, discontinued, replaced_by_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, $4, $5, $6, true, $7, $8, now(), now())`,
      [id, data.company_id, code.replace(/^[._\s]+/, '') || code, nc, data.description?.trim() || null, data.unit?.trim() || null,
        data.discontinued !== false, data.replaced_by_id || null]);
    const result = await this.matchLineItems({ companyId: data.company_id, normalizedCode: nc });
    return { id, ...result };
  }

  /** Marks an article as out of production and/or replaced by another one. */
  async updateStatus(id: string, data: { discontinued?: boolean; replaced_by_id?: string | null }) {
    const [article] = await AppDataSource.query(`SELECT id, company_id FROM articles WHERE id::text = $1`, [id]);
    if (!article) throw new Error('Articolo non trovato');
    if (data.replaced_by_id) {
      if (String(data.replaced_by_id) === String(id)) throw new Error('Un articolo non può sostituire sé stesso');
      await this.checkSameCompany(data.replaced_by_id, String(article.company_id));
    }
    const sets: string[] = [];
    const params: any[] = [id];
    if (typeof data.discontinued === 'boolean') { params.push(data.discontinued); sets.push(`discontinued = $${params.length}`); }
    if (data.replaced_by_id !== undefined) { params.push(data.replaced_by_id || null); sets.push(`replaced_by_id = $${params.length}::uuid`); }
    if (!sets.length) return;
    await AppDataSource.query(`UPDATE articles SET ${sets.join(', ')}, updated_at = now() WHERE id::text = $1`, params);
  }

  /** Deletes an article created by hand; its invoice lines go back to "not found". */
  async deleteManualArticle(id: string) {
    const [article] = await AppDataSource.query(`SELECT company_id, manual FROM articles WHERE id::text = $1`, [id]);
    if (!article) throw new Error('Articolo non trovato');
    if (!article.manual) throw new Error('Si possono eliminare solo gli articoli creati a mano');
    const lines = await AppDataSource.query(`SELECT DISTINCT invoice_id::text AS id FROM invoice_line_items WHERE article_id::text = $1`, [id]);
    await AppDataSource.query(`DELETE FROM articles WHERE id::text = $1`, [id]);
    if (lines.length) await this.matchLineItems({ invoiceIds: lines.map((l: any) => l.id) });
  }

  private async checkSameCompany(articleId: string, companyId: string) {
    const [other] = await AppDataSource.query(`SELECT company_id FROM articles WHERE id::text = $1`, [articleId]);
    if (!other) throw new Error('Articolo sostitutivo non trovato');
    if (!(await this.withSources(companyId)).includes(String(other.company_id))) throw new Error("L'articolo sostitutivo è di un'altra azienda");
  }

  /** The company plus the companies whose price lists it uses. */
  async withSources(companyId: string): Promise<string[]> {
    return (await articleCompanies([companyId])).get(companyId) || [companyId];
  }

  /** Chooses the companies whose price lists are also used for this company, then re-matches its invoices. */
  async setPriceListSources(companyId: string, sourceIds: string[]) {
    const ids = [...new Set(sourceIds.map(String))].filter(id => id && id !== companyId);
    await AppDataSource.query(
      `UPDATE companies SET price_list_sources = $2::text[] WHERE id::text = $1`, [companyId, ids.length ? ids : null]);
    const invoices = await AppDataSource.query(`SELECT id::text AS id FROM invoices WHERE company_id::text = $1`, [companyId]);
    if (!invoices.length) return { matched: 0, unmatched: 0, no_code: 0 };
    return this.matchLineItems({ invoiceIds: invoices.map((r: any) => r.id) });
  }

  async unlinkCode(articleId: string, normalizedCode: string) {
    // TypeORM returns [rows, affected] for DELETE ... RETURNING
    const result = await AppDataSource.query(
      `DELETE FROM article_aliases WHERE article_id::text = $1 AND normalized_code = $2 RETURNING company_id`,
      [articleId, normalizeCode(normalizedCode)]);
    const rows = Array.isArray(result[0]) ? result[0] : result;
    const alias = rows[0];
    if (alias) await this.matchLineItems({ companyId: String(alias.company_id), normalizedCode: normalizeCode(normalizedCode) });
  }

  /** Short rows for the Claude connector and the AI assistant. */
  async topArticles(f: SalesFilters, limit = 30) {
    const res = await this.listArticles({ ...f, only_sold: true, sort: 'revenue', limit });
    return res.articles;
  }
}
