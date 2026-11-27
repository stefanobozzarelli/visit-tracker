import { AppDataSource } from '../config/database';
import { normalizeCode } from './PriceListParser';
import { v4 as uuidv4 } from 'uuid';

/**
 * Articles of the supplier price lists, their link to invoice lines, and the
 * per-article sales statistics.
 *
 * Matching rule for an invoice line (same company as the invoice):
 *   1. normalized code equals an article's normalized code         → matched
 *   2. normalized code is an alias linked by hand to an article     → alias
 *   3. equal after dropping leading zeros, and only one candidate   → matched
 *   otherwise → unmatched (or no_code when the line has no code).
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

export class ArticleService {
  /**
   * Links invoice lines to articles. Pass invoiceIds to match some invoices,
   * or companyId to (re)match every line of a supplier, e.g. after a new list.
   */
  async matchLineItems(scope: { invoiceIds?: string[]; companyId?: string; normalizedCode?: string }): Promise<{ matched: number; unmatched: number; no_code: number }> {
    const params: any[] = [];
    const where: string[] = [];
    if (scope.invoiceIds?.length) { params.push(scope.invoiceIds); where.push(`li.invoice_id::text = ANY($${params.length}::text[])`); }
    if (scope.companyId) { params.push(scope.companyId); where.push(`inv.company_id::text = $${params.length}`); }
    if (scope.normalizedCode) { params.push(scope.normalizedCode); where.push(`${SQL_NORMALIZE('li.article_code')} = $${params.length}`); }
    if (!where.length) throw new Error('matchLineItems needs a scope');

    const rows = await AppDataSource.query(
      `WITH li AS (
         SELECT li.id, inv.company_id::text AS company_id, inv.invoice_date,
                ${SQL_NORMALIZE('li.article_code')} AS nc
         FROM invoice_line_items li
         JOIN invoices inv ON inv.id::text = li.invoice_id::text
         WHERE ${where.join(' AND ')}
       ),
       m AS (
         SELECT li.id, li.invoice_date,
           CASE WHEN li.nc = '' THEN NULL
                ELSE COALESCE(a1.id::text, al.article_id::text, CASE WHEN z.n = 1 THEN z.id END) END AS article_id,
           CASE WHEN li.nc = '' THEN 'no_code'
                WHEN a1.id IS NOT NULL THEN 'matched'
                WHEN al.article_id IS NOT NULL THEN 'alias'
                WHEN z.n = 1 THEN 'matched'
                ELSE 'unmatched' END AS status
         FROM li
         LEFT JOIN articles a1 ON a1.company_id::text = li.company_id AND a1.normalized_code = li.nc
         LEFT JOIN article_aliases al ON a1.id IS NULL AND al.company_id::text = li.company_id AND al.normalized_code = li.nc
         LEFT JOIN LATERAL (
           SELECT min(a.id::text) AS id, count(*) AS n FROM articles a
           WHERE a1.id IS NULL AND al.article_id IS NULL AND ltrim(li.nc, '0') <> ''
             AND a.company_id::text = li.company_id AND ltrim(a.normalized_code, '0') = ltrim(li.nc, '0')
         ) z ON true
       ),
       p AS (
         SELECT m.*, (
           SELECT ap.price FROM article_prices ap
           JOIN price_lists pl ON pl.id = ap.price_list_id
           WHERE ap.article_id::text = m.article_id
           ORDER BY (COALESCE(pl.valid_from, pl.created_at::date) <= COALESCE(m.invoice_date, current_date)) DESC,
                    CASE WHEN COALESCE(pl.valid_from, pl.created_at::date) <= COALESCE(m.invoice_date, current_date)
                         THEN COALESCE(pl.valid_from, pl.created_at::date) END DESC NULLS LAST,
                    COALESCE(pl.valid_from, pl.created_at::date) ASC,
                    pl.created_at DESC
           LIMIT 1
         ) AS list_price
         FROM m
       ),
       upd AS (
         UPDATE invoice_line_items t
         SET article_id = p.article_id::uuid, match_status = p.status, list_price = p.list_price
         FROM p WHERE t.id = p.id
         RETURNING p.status
       )
       SELECT status, count(*)::int AS n FROM upd GROUP BY status`,
      params,
    );
    const by = Object.fromEntries(rows.map((r: any) => [r.status, r.n]));
    return {
      matched: (by.matched || 0) + (by.alias || 0),
      unmatched: by.unmatched || 0,
      no_code: by.no_code || 0,
    };
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
    search?: string; only_sold?: boolean; sort?: string; page?: number; limit?: number;
  }) {
    const params: any[] = [];
    const sales = salesWhere({ ...f, company_id: undefined, company_ids: undefined }, params);
    const aw: string[] = [];
    if (f.company_id) { params.push(f.company_id); aw.push(`a.company_id::text = $${params.length}`); }
    if (f.company_ids?.length) { params.push(f.company_ids); aw.push(`a.company_id::text = ANY($${params.length}::text[])`); }
    if (f.search?.trim()) {
      const term = f.search.trim();
      params.push(`%${term}%`, `%${normalizeCode(term)}%`);
      aw.push(`(a.description ILIKE $${params.length - 1} OR a.code ILIKE $${params.length - 1} OR a.normalized_code LIKE $${params.length})`);
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
    if (f.company_id) { cParams.push(f.company_id); cw.push(`a.company_id::text = $${cParams.length}`); }
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

    const [totals, byMonth, byClient, lines, aliases] = await Promise.all([
      AppDataSource.query(`SELECT ${agg}, COUNT(DISTINCT inv.id)::int AS invoices, COUNT(DISTINCT inv.client_id)::int AS clients,
                           MIN(li.line_total / NULLIF(li.quantity, 0)) AS min_net_price, MAX(li.line_total / NULLIF(li.quantity, 0)) AS max_net_price,
                           MAX(inv.invoice_date) AS last_date ${from}`, params),
      AppDataSource.query(`SELECT TO_CHAR(inv.invoice_date, 'YYYY-MM') AS month, ${agg} ${from} AND inv.invoice_date IS NOT NULL
                           GROUP BY 1 ORDER BY 1 DESC`, params),
      AppDataSource.query(`SELECT inv.client_id, COALESCE(cl.name, inv.customer_name, 'Cliente non assegnato') AS client_name, cl.country,
                           ${agg}, MAX(inv.invoice_date) AS last_date ${from}
                           GROUP BY inv.client_id, cl.name, inv.customer_name, cl.country ORDER BY revenue DESC NULLS LAST`, params),
      AppDataSource.query(`SELECT li.id, li.invoice_id, inv.invoice_number, inv.invoice_date, COALESCE(cl.name, inv.customer_name) AS client_name,
                           li.article_code, li.description, li.quantity, li.unit, li.unit_price, li.discount_percent, li.line_total, li.list_price, li.match_status
                           ${from} ORDER BY inv.invoice_date DESC NULLS LAST, li.line_number LIMIT 200`, params),
      AppDataSource.query(`SELECT normalized_code FROM article_aliases WHERE article_id::text = $1 ORDER BY normalized_code`, [id]),
    ]);

    const fix = (r: any) => ({
      ...r,
      quantity: num(r.quantity), revenue: num(r.revenue),
      avg_net_price: numOrNull(r.avg_net_price), avg_discount: numOrNull(r.avg_discount),
    });
    return {
      article: { ...article, list_price: numOrNull(article.list_price) },
      prices: prices.map((p: any) => ({ ...p, price: Number(p.price) })),
      aliases: aliases.map((a: any) => a.normalized_code),
      totals: { ...fix(totals[0] || {}), min_net_price: numOrNull(totals[0]?.min_net_price), max_net_price: numOrNull(totals[0]?.max_net_price) },
      by_month: byMonth.map(fix),
      by_client: byClient.map(fix),
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
    if (String(article.company_id) !== String(companyId)) throw new Error("L'articolo è di un'altra azienda");
    await AppDataSource.query(
      `INSERT INTO article_aliases (id, company_id, normalized_code, article_id, created_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (company_id, normalized_code) DO UPDATE SET article_id = EXCLUDED.article_id`,
      [uuidv4(), companyId, nc, articleId]);
    return this.matchLineItems({ companyId, normalizedCode: nc });
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
