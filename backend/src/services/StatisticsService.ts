import { AppDataSource } from '../config/database';

interface GetUserStatisticsParams {
  startDate?: string;
  endDate?: string;
  userIds?: string[];
}

export class StatisticsService {
  async getUserStatistics({ startDate, endDate, userIds }: GetUserStatisticsParams) {
    const params: any[] = [];
    let paramIndex = 1;

    const hasDateFilter = startDate && endDate;

    let dateFilterVisits = '';
    let dateFilterReports = '';
    let dateFilterTodosCreated = '';
    let dateFilterTodosAssigned = '';
    let dateFilterTodosDone = '';
    let dateFilterOffers = '';
    let dateFilterOrders = '';
    let dateFilterClaims = '';
    let dateFilterCv = '';
    let dateFilterSh = '';
    let dateFilterLogin = '';

    if (hasDateFilter) {
      const startParam = `$${paramIndex++}`;
      const endParam = `$${paramIndex++}`;
      params.push(startDate, endDate);

      dateFilterVisits = `WHERE visit_date BETWEEN ${startParam} AND ${endParam}`;
      dateFilterReports = `AND vis.visit_date BETWEEN ${startParam} AND ${endParam}`;
      dateFilterTodosCreated = `WHERE created_at BETWEEN ${startParam} AND ${endParam}`;
      dateFilterTodosAssigned = `WHERE created_at BETWEEN ${startParam} AND ${endParam}`;
      dateFilterTodosDone = `AND created_at BETWEEN ${startParam} AND ${endParam}`;
      dateFilterOffers = `WHERE offer_date BETWEEN ${startParam} AND ${endParam}`;
      dateFilterOrders = `WHERE co.order_date BETWEEN ${startParam} AND ${endParam}`;
      dateFilterClaims = `WHERE date BETWEEN ${startParam} AND ${endParam}`;
      dateFilterCv = `WHERE date BETWEEN ${startParam} AND ${endParam}`;
      dateFilterSh = `WHERE created_at BETWEEN ${startParam} AND ${endParam}`;
      dateFilterLogin = `WHERE login_at BETWEEN ${startParam} AND ${endParam}`;
    }

    let whereClause = '';
    if (userIds && userIds.length > 0) {
      const placeholders = userIds.map(() => `$${paramIndex++}`).join(', ');
      params.push(...userIds);
      whereClause = `WHERE u.id IN (${placeholders})`;
    }

    // Build date conditions for correlated subqueries
    const vDateCond = hasDateFilter ? `AND visit_date BETWEEN $1 AND $2` : '';
    const tDateCond = hasDateFilter ? `AND created_at BETWEEN $1 AND $2` : '';
    const oDateCond = hasDateFilter ? `AND offer_date BETWEEN $1 AND $2` : '';
    const clDateCond = hasDateFilter ? `AND date BETWEEN $1 AND $2` : '';
    const cvDateCond = hasDateFilter ? `AND date BETWEEN $1 AND $2` : '';
    const ordDateCond = hasDateFilter ? `AND co.order_date BETWEEN $1 AND $2` : '';
    const lgDateCond = hasDateFilter ? `AND login_at BETWEEN $1 AND $2` : '';

    const sql = `
      SELECT u.id, u.name, u.email, u.role,
        (SELECT COUNT(*) FROM visits WHERE visited_by_user_id = u.id ${vDateCond}) as visits_count,
        (SELECT COUNT(*) FROM visit_reports vr JOIN visits vis ON vis.id = vr.visit_id WHERE vis.visited_by_user_id = u.id AND vr.section != '__metadata__' ${vDateCond ? vDateCond.replace('visit_date', 'vis.visit_date') : ''}) as reports_count,
        (SELECT COUNT(*) FROM todo_items WHERE created_by_user_id = u.id ${tDateCond}) as tasks_created,
        (SELECT COUNT(*) FROM todo_items WHERE assigned_to_user_id = u.id ${tDateCond}) as tasks_assigned,
        (SELECT COUNT(*) FROM todo_items WHERE assigned_to_user_id = u.id AND status = 'done' ${tDateCond}) as tasks_completed,
        (SELECT COUNT(*) FROM offers WHERE created_by_user_id = u.id ${oDateCond}) as offers_count,
        (SELECT COALESCE(SUM(total_amount), 0) FROM offers WHERE created_by_user_id = u.id ${oDateCond}) as offers_total_value,
        (SELECT COUNT(*) FROM customer_orders co JOIN visits vis ON vis.id = co.visit_id WHERE vis.visited_by_user_id = u.id ${ordDateCond}) as orders_count,
        (SELECT COALESCE(SUM(co.total_amount), 0) FROM customer_orders co JOIN visits vis ON vis.id = co.visit_id WHERE vis.visited_by_user_id = u.id ${ordDateCond}) as orders_total_value,
        (SELECT COUNT(*) FROM claims WHERE created_by_user_id = u.id ${clDateCond}) as claims_count,
        (SELECT COUNT(*) FROM company_visits WHERE created_by_user_id = u.id ${cvDateCond}) as company_visits_count,
        (SELECT COUNT(*) FROM showrooms WHERE created_by_user_id = u.id) as showrooms_count,
        0 as files_uploaded,
        (SELECT COUNT(*) FROM user_login_logs WHERE user_id = u.id) as login_count,
        (SELECT MAX(login_at) FROM user_login_logs WHERE user_id = u.id) as last_login
      FROM users u
      ${whereClause}
      ORDER BY u.name
    `;

    console.log('Statistics SQL params:', params);
    console.log('Statistics SQL:', sql.substring(0, 200));
    try {
      const results = await AppDataSource.query(sql, params);
      return results;
    } catch (error) {
      console.error('Statistics FULL query error:', (error as Error).message, (error as Error).stack);
      // Ultimate fallback: correlated subqueries, no date filter, fresh params
      try {
        const fbParams: any[] = [];
        let fbWhere = '';
        if (userIds && userIds.length > 0) {
          const ph = userIds.map((_, i) => `$${i + 1}`).join(', ');
          fbParams.push(...userIds);
          fbWhere = `WHERE u.id IN (${ph})`;
        }
        const simpleSql = `
          SELECT u.id, u.name, u.email, u.role,
            (SELECT COUNT(*) FROM visits WHERE visited_by_user_id = u.id) as visits_count,
            (SELECT COUNT(*) FROM visit_reports vr JOIN visits vis ON vis.id = vr.visit_id WHERE vis.visited_by_user_id = u.id AND vr.section != '__metadata__') as reports_count,
            (SELECT COUNT(*) FROM todo_items WHERE created_by_user_id = u.id) as tasks_created,
            (SELECT COUNT(*) FROM todo_items WHERE assigned_to_user_id = u.id) as tasks_assigned,
            (SELECT COUNT(*) FROM todo_items WHERE assigned_to_user_id = u.id AND status = 'done') as tasks_completed,
            (SELECT COUNT(*) FROM offers WHERE created_by_user_id = u.id) as offers_count,
            (SELECT COALESCE(SUM(total_amount), 0) FROM offers WHERE created_by_user_id = u.id) as offers_total_value,
            (SELECT COUNT(*) FROM customer_orders co JOIN visits vis ON vis.id = co.visit_id WHERE vis.visited_by_user_id = u.id) as orders_count,
            (SELECT COALESCE(SUM(co.total_amount), 0) FROM customer_orders co JOIN visits vis ON vis.id = co.visit_id WHERE vis.visited_by_user_id = u.id) as orders_total_value,
            (SELECT COUNT(*) FROM claims WHERE created_by_user_id = u.id) as claims_count,
            (SELECT COUNT(*) FROM company_visits WHERE created_by_user_id = u.id) as company_visits_count,
            (SELECT COUNT(*) FROM showrooms WHERE created_by_user_id = u.id) as showrooms_count,
            0 as files_uploaded, 0 as login_count, NULL as last_login
          FROM users u ${fbWhere} ORDER BY u.name
        `;
        console.log('Trying simple fallback query...');
        const results = await AppDataSource.query(simpleSql, fbParams);
        return results;
      } catch (e2) {
        console.error('Statistics simple fallback error:', (e2 as Error).message);
        throw error;
      }
    }
  }
}
