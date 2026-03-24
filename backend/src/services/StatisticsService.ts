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

    const sql = `
      SELECT
        u.id, u.name, u.email, u.role,
        COALESCE(v.cnt, 0) as visits_count,
        COALESCE(r.cnt, 0) as reports_count,
        COALESCE(tc.cnt, 0) as tasks_created,
        COALESCE(ta.cnt, 0) as tasks_assigned,
        COALESCE(td.cnt, 0) as tasks_completed,
        COALESCE(o.cnt, 0) as offers_count,
        COALESCE(o.total_val, 0) as offers_total_value,
        COALESCE(ord.cnt, 0) as orders_count,
        COALESCE(ord.total_val, 0) as orders_total_value,
        COALESCE(cl.cnt, 0) as claims_count,
        COALESCE(cv.cnt, 0) as company_visits_count,
        COALESCE(sh.cnt, 0) as showrooms_count,
        COALESCE(f.cnt, 0) as files_uploaded,
        COALESCE(lg.cnt, 0) as login_count,
        lg.last_login
      FROM users u
      LEFT JOIN (
        SELECT visited_by_user_id uid, COUNT(*) cnt FROM visits ${dateFilterVisits} GROUP BY 1
      ) v ON v.uid = u.id
      LEFT JOIN (
        SELECT vis.visited_by_user_id uid, COUNT(*) cnt
        FROM visit_reports vr
        JOIN visits vis ON vis.id = vr.visit_id
        WHERE vr.section != '__metadata__' ${dateFilterReports}
        GROUP BY 1
      ) r ON r.uid = u.id
      LEFT JOIN (
        SELECT created_by_user_id uid, COUNT(*) cnt FROM todo_items ${dateFilterTodosCreated} GROUP BY 1
      ) tc ON tc.uid = u.id
      LEFT JOIN (
        SELECT assigned_to_user_id uid, COUNT(*) cnt FROM todo_items ${dateFilterTodosAssigned} GROUP BY 1
      ) ta ON ta.uid = u.id
      LEFT JOIN (
        SELECT assigned_to_user_id uid, COUNT(*) cnt FROM todo_items WHERE status = 'done' ${dateFilterTodosDone} GROUP BY 1
      ) td ON td.uid = u.id
      LEFT JOIN (
        SELECT created_by_user_id uid, COUNT(*) cnt, SUM(COALESCE(total_amount, 0)) total_val FROM offers ${dateFilterOffers} GROUP BY 1
      ) o ON o.uid = u.id
      LEFT JOIN (
        SELECT vis.visited_by_user_id uid, COUNT(*) cnt, SUM(COALESCE(co.total_amount, 0)) total_val
        FROM customer_orders co
        JOIN visits vis ON vis.id = co.visit_id
        ${dateFilterOrders}
        GROUP BY 1
      ) ord ON ord.uid = u.id
      LEFT JOIN (
        SELECT created_by_user_id uid, COUNT(*) cnt FROM claims ${dateFilterClaims} GROUP BY 1
      ) cl ON cl.uid = u.id
      LEFT JOIN (
        SELECT created_by_user_id uid, COUNT(*) cnt FROM company_visits ${dateFilterCv} GROUP BY 1
      ) cv ON cv.uid = u.id
      LEFT JOIN (
        SELECT created_by_user_id uid, COUNT(*) cnt FROM showrooms ${dateFilterSh} GROUP BY 1
      ) sh ON sh.uid = u.id
      LEFT JOIN (
        SELECT uid, SUM(cnt) cnt FROM (
          SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM visit_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM visit_direct_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM todo_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM company_visit_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM offer_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM offer_item_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM claim_movement_attachments GROUP BY 1
          UNION ALL SELECT uploaded_by_user_id uid, COUNT(*) cnt FROM showroom_photos GROUP BY 1
        ) sub GROUP BY uid
      ) f ON f.uid = u.id
      LEFT JOIN (
        SELECT user_id uid, COUNT(*) cnt, MAX(login_at) last_login FROM user_login_logs ${dateFilterLogin} GROUP BY 1
      ) lg ON lg.uid = u.id
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
            0 as files_uploaded,
            (SELECT COUNT(*) FROM user_login_logs WHERE user_id = u.id) as login_count,
            (SELECT MAX(login_at) FROM user_login_logs WHERE user_id = u.id) as last_login
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
