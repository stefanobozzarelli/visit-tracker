import { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/database';
import { Company } from '../entities/Company';
import { CreateCompanyRequest } from '../types';

export class CompanyService {
  private companyRepository = AppDataSource.getRepository(Company);

  async createCompany(data: CreateCompanyRequest): Promise<Company> {
    const company = this.companyRepository.create(data);
    return await this.companyRepository.save(company);
  }

  async getCompanies(): Promise<Company[]> {
    return await this.companyRepository
      .createQueryBuilder('company')
      .orderBy('company.name', 'ASC')
      .getMany();
  }

  async getCompanyById(id: string): Promise<Company | null> {
    return await this.companyRepository.findOne({
      where: { id },
    });
  }

  async updateCompany(id: string, data: Partial<CreateCompanyRequest>): Promise<Company> {
    await this.companyRepository.update(id, data);
    const updated = await this.getCompanyById(id);
    if (!updated) throw new Error('Company not found');
    return updated;
  }

  /**
   * Everything that still points at a company: one row per table/column with
   * how many rows use it. Found from the database itself, so new tables are
   * covered without changing this code.
   */
  async getUsage(id: string, manager: EntityManager = AppDataSource.manager): Promise<CompanyUsage[]> {
    const usage: CompanyUsage[] = [];
    for (const r of await companyReferences(manager)) {
      const [{ n }] = await manager.query(
        `SELECT COUNT(*)::int AS n FROM "${r.table}" WHERE "${r.column}"::text = $1::text`, [id]);
      if (n > 0) usage.push({ ...r, count: n, label: usageLabel(r.table, n) });
    }
    const [{ n }] = await manager.query(
      `SELECT COUNT(*)::int AS n FROM companies
        WHERE id::text <> $1::text AND ($1::text = ANY(group_members) OR $1::text = ANY(price_list_sources))`, [id]);
    if (n > 0) usage.push({
      table: 'companies', column: 'group_members', count: n,
      label: n === 1 ? "1 gruppo o listino di un'altra azienda" : `${n} gruppi o listini di altre aziende`,
    });
    return usage;
  }

  /**
   * Deletes a company. Its settings (clients and users linked to it, commission
   * rates, permissions) go with it; if real data still uses it (visits, reports,
   * invoices, offers...) nothing is deleted and the error says what is in the way.
   */
  async deleteCompany(id: string): Promise<void> {
    await AppDataSource.transaction(async manager => {
      const company = await manager.findOne(Company, { where: { id } });
      if (!company) throw new Error('Azienda non trovata');
      const blocking = (await this.getUsage(id, manager)).filter(u => !SETTINGS_TABLES.has(u.table));
      if (blocking.length) {
        const err: any = new Error(
          `Non posso eliminare ${company.name}: è ancora usata in ${joinIt(blocking.map(b => b.label))}. ` +
          `Usa "Unisci a…" per spostare tutto su un'altra azienda ed eliminare questa.`);
        err.status = 409;
        err.usage = blocking;
        throw err;
      }
      for (const r of await companyReferences(manager)) {
        if (SETTINGS_TABLES.has(r.table)) {
          await manager.query(`DELETE FROM "${r.table}" WHERE "${r.column}"::text = $1::text`, [id]);
        }
      }
      await manager.delete(Company, id);
    });
  }

  /**
   * Merges a duplicate company into another one: every visit, report, invoice,
   * offer, article... of `sourceId` is moved to `targetId`, then `sourceId` is
   * deleted. Rows that would be duplicates (e.g. a client linked to both) are
   * dropped, keeping the target's.
   */
  async mergeCompany(sourceId: string, targetId: string): Promise<{ target: Company; moved: CompanyUsage[] }> {
    if (!sourceId || !targetId || sourceId === targetId) throw new Error("Scegli un'altra azienda in cui unire questa");
    return AppDataSource.transaction(async manager => {
      const source = await manager.findOne(Company, { where: { id: sourceId } });
      const target = await manager.findOne(Company, { where: { id: targetId } });
      if (!source || !target) throw new Error('Azienda non trovata');
      const moved = await this.getUsage(sourceId, manager);

      for (const r of await companyReferences(manager)) {
        await dropConflicts(manager, r.table, r.column, sourceId, targetId);
        await manager.query(
          `UPDATE "${r.table}" SET "${r.column}" = $2 WHERE "${r.column}"::text = $1::text`, [sourceId, targetId]);
      }
      // groups and "use the price lists of" of other companies that named the source
      await manager.query(
        `UPDATE companies SET
           group_members = NULLIF(ARRAY(SELECT DISTINCT x FROM unnest(array_replace(group_members, $1::text, $2::text)) x WHERE x <> companies.id::text), '{}'),
           price_list_sources = NULLIF(ARRAY(SELECT DISTINCT x FROM unnest(array_replace(price_list_sources, $1::text, $2::text)) x WHERE x <> companies.id::text), '{}')
         WHERE $1::text = ANY(group_members) OR $1::text = ANY(price_list_sources)`, [sourceId, targetId]);
      // the target keeps its own data; empty fields are taken from the duplicate
      const fresh = (await manager.findOne(Company, { where: { id: targetId } }))!;
      const fill: any = {};
      for (const f of ['industry', 'rapporto'] as const) if (!fresh[f] && source[f]) fill[f] = source[f];
      for (const k of ['group_members', 'price_list_sources'] as const) {
        const own = fresh[k] || [];
        const list = [...new Set([...own, ...(source[k] || [])])].filter(x => x !== targetId && x !== sourceId);
        if (list.length !== own.length) fill[k] = list.length ? list : null;
      }
      if (Object.keys(fill).length) await manager.update(Company, targetId, fill);
      await manager.delete(Company, sourceId);
      const updated = await manager.findOne(Company, { where: { id: targetId } });
      return { target: updated!, moved };
    });
  }
}

export interface CompanyUsage { table: string; column: string; count: number; label: string }

// Links that only describe the company and can go away with it
const SETTINGS_TABLES = new Set([
  'client_companies', 'user_companies', 'user_permissions', 'commission_rates', 'sub_agent_commission_rates',
]);

const LABELS: Record<string, [string, string]> = {
  visit_reports: ['report di visita', 'report di visita'],
  company_visits: ['visita in azienda', 'visite in azienda'],
  invoices: ['fattura', 'fatture'],
  offers: ['offerta', 'offerte'],
  customer_orders: ['ordine', 'ordini'],
  projects: ['progetto', 'progetti'],
  opportunities: ['opportunità', 'opportunità'],
  claims: ['reclamo', 'reclami'],
  showrooms: ['showroom', 'showroom'],
  todo_items: ['attività', 'attività'],
  articles: ['articolo', 'articoli'],
  article_aliases: ['codice alternativo', 'codici alternativi'],
  price_lists: ['listino', 'listini'],
  client_companies: ['cliente collegato', 'clienti collegati'],
  user_companies: ['utente collegato', 'utenti collegati'],
  user_permissions: ['permesso', 'permessi'],
  commission_rates: ['percentuale provvigione', 'percentuali provvigione'],
  sub_agent_commission_rates: ['provvigione subagente', 'provvigioni subagenti'],
  users: ['utente', 'utenti'],
};
function usageLabel(table: string, n: number): string {
  const [one, many] = LABELS[table] || [`riga in ${table}`, `righe in ${table}`];
  return `${n} ${n === 1 ? one : many}`;
}
function joinIt(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** Every column that holds a company id: foreign keys to companies, plus company_id/supplier_id columns. */
async function companyReferences(manager: EntityManager): Promise<{ table: string; column: string }[]> {
  const rows: { table: string; column: string }[] = await manager.query(`
    SELECT cl.relname::text AS table, a.attname::text AS column
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace ns ON ns.oid = cl.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     WHERE c.contype = 'f' AND c.confrelid = 'companies'::regclass AND ns.nspname = current_schema()
    UNION
    SELECT c.table_name::text, c.column_name::text
      FROM information_schema.columns c
      JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = current_schema() AND c.column_name IN ('company_id', 'supplier_id')
       AND c.data_type IN ('uuid', 'character varying', 'text') AND t.table_type = 'BASE TABLE'`);
  const seen = new Set<string>();
  const out: { table: string; column: string }[] = [];
  for (const r of rows) {
    const key = `${r.table}.${r.column}`;
    if (r.table === 'companies' || seen.has(key)) continue;
    seen.add(key);
    out.push({ table: r.table, column: r.column });
  }
  return out;
}

/**
 * Before moving `table.column` from source to target, removes the source rows
 * that would break a unique index (e.g. a client linked to both companies, or
 * an article code present in both). Rows of other tables that pointed at a
 * removed row are moved to the target's matching row first.
 */
async function dropConflicts(manager: EntityManager, table: string, column: string, sourceId: string, targetId: string) {
  const indexes: { cols: string[] }[] = await manager.query(`
    SELECT ARRAY(SELECT a.attname::text FROM unnest(i.indkey) k JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k) AS cols
      FROM pg_index i
     WHERE i.indrelid = $1::regclass AND i.indisunique AND i.indexprs IS NULL AND i.indpred IS NULL`, [`"${table}"`]);
  for (const { cols } of indexes) {
    if (!cols.includes(column)) continue;
    const others = cols.filter(c => c !== column);
    if (!others.length) continue;
    const match = others.map(c => `x."${c}" IS NOT DISTINCT FROM s."${c}"`).join(' AND ');
    const pk: { column: string }[] = await manager.query(`
      SELECT a.attname::text AS column FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = $1::regclass AND i.indisprimary`, [`"${table}"`]);
    if (pk.length === 1) {
      // rows elsewhere pointing at a duplicate are moved to the target's row
      const id = pk[0].column;
      const pairs = `SELECT s."${id}" AS old_id, x."${id}" AS new_id FROM "${table}" s JOIN "${table}" x ON ${match}
                      WHERE s."${column}"::text = $1::text AND x."${column}"::text = $2::text`;
      const refs: { table: string; column: string }[] = await manager.query(`
        SELECT cl.relname::text AS table, a.attname::text AS column
          FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
         WHERE c.contype = 'f' AND c.confrelid = $1::regclass`, [`"${table}"`]);
      for (const r of refs) {
        await manager.query(
          `UPDATE "${r.table}" t SET "${r.column}" = p.new_id FROM (${pairs}) p WHERE t."${r.column}" = p.old_id`,
          [sourceId, targetId]);
      }
    }
    await manager.query(
      `DELETE FROM "${table}" s WHERE s."${column}"::text = $1::text
         AND EXISTS (SELECT 1 FROM "${table}" x WHERE x."${column}"::text = $2::text AND ${match})`, [sourceId, targetId]);
  }
}
