import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../config/database';

/** Member companies of every group, by group id. */
export async function companyGroups(): Promise<Map<string, string[]>> {
  const rows: { id: string; members: string[] }[] = await AppDataSource.query(
    `SELECT id::text AS id, group_members AS members FROM companies
     WHERE group_members IS NOT NULL AND cardinality(group_members) > 0`);
  return new Map(rows.map(r => [r.id, r.members]));
}

/**
 * For the statistics: when the company filter is a group (e.g. "Gruppo ABK"),
 * replace it with the group and all its member companies, so the data of the
 * whole group is shown together. Only on GET requests to the given paths.
 */
export function expandCompanyGroups(paths: string[]) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (req.method !== 'GET' || !paths.includes(req.path)) return next();
      const single = typeof req.query.company_id === 'string' ? req.query.company_id : '';
      const list = typeof req.query.company_ids === 'string' ? req.query.company_ids.split(',').filter(Boolean) : [];
      if (!single && !list.length) return next();
      const groups = await companyGroups();
      if (!groups.size) return next();
      const expand = (id: string) => (groups.has(id) ? [id, ...groups.get(id)!] : [id]);
      if (single && groups.has(single)) {
        req.query.company_ids = [...new Set([...expand(single), ...list.flatMap(expand)])].join(',');
        delete req.query.company_id;
      } else if (list.some(id => groups.has(id))) {
        req.query.company_ids = [...new Set(list.flatMap(expand))].join(',');
      }
    } catch (e) {
      console.log('Company groups note:', (e as Error).message);
    }
    next();
  };
}
