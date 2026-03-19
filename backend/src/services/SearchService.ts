import Anthropic from '@anthropic-ai/sdk';
import { AppDataSource } from '../config/database';
import { Visit } from '../entities/Visit';
import { TodoItem } from '../entities/TodoItem';
import { Project } from '../entities/Project';

const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('🔑 Checking ANTHROPIC_API_KEY:', apiKey ? '✅ Found' : '❌ Not found');
  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY not found - using date extraction fallback');
    return null;
  }
  return new Anthropic({ apiKey });
};

interface SearchFilters {
  clientId?: string;
  companyId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  userId?: string;
  keywords?: string[];
  relativeDate?: boolean; // Flag: true if dates came from relative pattern extraction
}

export class SearchService {
  /**
   * Extract dates from keywords and convert them to YYYY-MM-DD format
   * Supports formats: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.
   */
  private extractDatesFromKeywords(keywords: string[]): { filteredKeywords: string[]; dates: string[] } {
    if (!keywords) return { filteredKeywords: [], dates: [] };

    const datePatterns = [
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g, // DD/MM/YYYY or DD-MM-YYYY
      /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g, // YYYY-MM-DD or YYYY/MM/DD
    ];

    const extractedDates = new Set<string>();
    const filteredKeywords: string[] = [];

    keywords.forEach(kw => {
      let matched = false;

      // Try pattern DD/MM/YYYY
      const match1 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(kw);
      if (match1) {
        const [, day, month, year] = match1;
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        console.log('📅 Date extracted from keyword:', kw, '→', date);
        extractedDates.add(date);
        matched = true;
      }

      // Try pattern YYYY-MM-DD
      const match2 = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.exec(kw);
      if (match2) {
        const [, year, month, day] = match2;
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        console.log('📅 Date extracted from keyword:', kw, '→', date);
        extractedDates.add(date);
        matched = true;
      }

      // If not a date, keep it as a keyword
      if (!matched) {
        filteredKeywords.push(kw);
      }
    });

    console.log('✅ Date extraction completed. Found:', Array.from(extractedDates));
    return {
      filteredKeywords,
      dates: Array.from(extractedDates)
    };
  }

  /**
   * Extract relative dates from the query - FINAL SOLUTION!
   */
  private extractRelativeDates(query: string): { startDate?: string; endDate?: string; cleanQuery: string } {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    const firstDayOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const lastDayOfMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${new Date(currentYear, currentMonth, 0).getDate()}`;

    let startDate: string | undefined;
    let endDate: string | undefined;
    let cleanQuery = query;

    if (/questo\s+mese|mese\s+corrente|mese\s+attuale/i.test(query)) {
      startDate = firstDayOfMonth;
      endDate = lastDayOfMonth;
      cleanQuery = cleanQuery.replace(/questo\s+mese|mese\s+corrente|mese\s+attuale/gi, '').trim();
      console.log('✅ EXTRACTED "this month" →', startDate, 'to', endDate);
    }

    if (/^\s*oggi\s*$|^oggi\s|\sodierno$/i.test(query) || /oggi|odierno/i.test(query)) {
      startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      endDate = startDate;
      cleanQuery = cleanQuery.replace(/oggi|odierno/gi, '').trim();
      console.log('✅ EXTRACTED "today" →', startDate);
    }

    if (/questa\s+settimana|settimana\s+corrente/i.test(query)) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      startDate = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      endDate = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
      cleanQuery = cleanQuery.replace(/questa\s+settimana|settimana\s+corrente/gi, '').trim();
      console.log('✅ EXTRACTED "this week" →', startDate, 'to', endDate);
    }

    // Extract specific months (January, February, March, etc.)
    const monthsMap: { [key: string]: number } = {
      gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6,
      luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12,
      gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12
    };

    console.log('🔍 CHECKING MONTHS IN QUERY:', query);
    for (const [monthName, monthNum] of Object.entries(monthsMap)) {
      const monthRegex = new RegExp(`\\b${monthName}\\b`, 'i');
      const testResult = monthRegex.test(query);
      if (testResult) {
        console.log(`✅✅✅ FOUND MONTH: "${monthName}" (${monthNum})`);
        startDate = `${currentYear}-${String(monthNum).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, monthNum, 0).getDate();
        endDate = `${currentYear}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        cleanQuery = cleanQuery.replace(monthRegex, '').trim();
        console.log(`  startDate: ${startDate}, endDate: ${endDate}`);
        console.log(`  cleanQuery: "${cleanQuery}"`);
        break; // Only first month found
      }
    }
    if (!startDate) {
      console.log('❌ NO MONTHS FOUND');
    }

    return { startDate, endDate, cleanQuery };
  }

  /**
   * Interpret a natural query and extract smart filters
   */
  async interpretSearchQuery(query: string, context: 'visits' | 'todos'): Promise<SearchFilters> {
    console.log('🎯 INPUT QUERY:', query);

    // STEP 1: Estrai date relative PRIMA di mandare a Claude!
    const { startDate: relativeStartDate, endDate: relativeEndDate, cleanQuery } = this.extractRelativeDates(query);
    console.log('🧹 CLEAN QUERY (without relative dates):', cleanQuery);

    const contextDescription =
      context === 'visits'
        ? 'client visits with reports for companies'
        : 'TODO activities assigned to users';

    // Get current date for relative date interpretation
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    const formattedToday = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    try {
      // IF relative dates were already extracted, return immediately!
      if (relativeStartDate || relativeEndDate) {
        console.log('⚡ RELATIVE DATES ALREADY EXTRACTED! Claude not needed');
        const result: SearchFilters = {
          relativeDate: true // Flag that dates came from relative pattern
        };
        if (relativeStartDate) result.startDate = relativeStartDate;
        if (relativeEndDate) result.endDate = relativeEndDate;
        // DON'T add keywords from cleanQuery when we have relative dates!
        // Remaining words (e.g., "deadlines") are only descriptive, not real filters
        console.log('✨ RESULT WITH RELATIVE DATES:', JSON.stringify(result, null, 2));
        return result;
      }

      const client = getClient();

      // If there's no API key, use the fallback directly
      if (!client) {
        console.log('📝 Using date extraction fallback (no Anthropic API)');
        const fallbackFilters: SearchFilters = { keywords: cleanQuery.split(' ').filter(w => w.length > 2) };
        const { filteredKeywords, dates } = this.extractDatesFromKeywords(fallbackFilters.keywords);
        fallbackFilters.keywords = filteredKeywords;
        if (dates.length > 0) {
          fallbackFilters.startDate = dates[0];
          fallbackFilters.endDate = dates[dates.length - 1];
        }
        console.log('🎯 Fallback filters:', JSON.stringify(fallbackFilters, null, 2));
        return fallbackFilters;
      }

      // Send Claude only the CLEAN query (without relative dates)
      const message = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `CRITICAL INSTRUCTIONS: Interpret natural search queries. Extract ONLY valid JSON, nothing else.

Current date: ${formattedToday}
Query: "${cleanQuery}"

OUTPUT JSON (extract ONLY the fields present):
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "keywords": ["keyword1", "keyword2"]
}

ABSOLUTE RULES FOR DATES (CRITICAL!):
1. IF you see specific date (09/03/2026, "9 March 2026") → EXTRACT in startDate/endDate
2. Specific date (09/03/2026) → always convert to YYYY-MM-DD: 2026-03-09
3. "March" or other months → calculate entire month range
4. "Yesterday" → startDate=yesterday date, endDate=yesterday date
5. "Last 7 days" → range of last 7 days

NOTE: Relative dates like "this month", "today", "this week" have already been extracted and removed from the query!

CRITICAL: DATES should NEVER go in keywords! Only search keywords go in keywords.

EXAMPLES:
- Query: "visits in March" → {"startDate": "2026-03-01", "endDate": "2026-03-31"}
- Query: "todo today" → {"startDate": "${formattedToday}", "endDate": "${formattedToday}"}
- Query: "13/03/2026 client Pippo" → {"startDate": "2026-03-13", "endDate": "2026-03-13", "keywords": ["Pippo"]}

RESPONSE ONLY JSON, no text!`,
          },
        ],
      });

      try {
        const content = message.content[0];
        if (content.type === 'text') {
          console.log('📝 CLAUDE RAW RESPONSE:\n', content.text);
          // Extract JSON from response
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log('✅ JSON EXTRACTED:\n', jsonMatch[0]);
            const filters = JSON.parse(jsonMatch[0]);
            console.log('📊 FILTERS AFTER PARSE:', JSON.stringify(filters, null, 2));

            // Post-processing: extract dates from keywords
            if (filters.keywords && filters.keywords.length > 0) {
              console.log('🔑 ORIGINAL KEYWORDS:', filters.keywords);
              const { filteredKeywords, dates } = this.extractDatesFromKeywords(filters.keywords);
              console.log('📅 DATES EXTRACTED:', dates);
              console.log('🔤 FILTERED KEYWORDS:', filteredKeywords);
              filters.keywords = filteredKeywords;

              // If dates were extracted and there are no startDate/endDate, use them
              if (dates.length > 0) {
                if (!filters.startDate) {
                  filters.startDate = dates[0];
                }
                if (!filters.endDate) {
                  filters.endDate = dates[dates.length - 1];
                }
              }
            }
            console.log('✨ FINAL FILTERS RETURNED:', JSON.stringify(filters, null, 2));
            return filters;
          }
        }
      } catch (error) {
        console.error('Error parsing Claude response:', error);
      }

      // Fallback: extract dates also from the original query
      const fallbackFilters: SearchFilters = { keywords: query.split(' ').filter(w => w.length > 2) };
      const { filteredKeywords, dates } = this.extractDatesFromKeywords(fallbackFilters.keywords);
      fallbackFilters.keywords = filteredKeywords;
      if (dates.length > 0) {
        fallbackFilters.startDate = dates[0];
        fallbackFilters.endDate = dates[dates.length - 1];
      }
      return fallbackFilters;
    } catch (error) {
      console.error('Error in AI search:', error);
      // Fallback to simple keyword search
      return { keywords: query.split(' ').filter(w => w.length > 2) };
    }
  }

  /**
   * Search visits with semantic filters
   */
  async searchVisits(query: string, userId?: string): Promise<Visit[]> {
    console.log('🔍 Search visits - Query:', query);
    const filters = await this.interpretSearchQuery(query, 'visits');
    console.log('📋 Extracted filters:', JSON.stringify(filters, null, 2));
    console.log('📅 startDate:', filters.startDate, '| endDate:', filters.endDate);
    console.log('🔑 keywords:', filters.keywords);

    const visitRepository = AppDataSource.getRepository(Visit);
    let queryBuilder = visitRepository
      .createQueryBuilder('visit')
      .leftJoinAndSelect('visit.client', 'client')
      .leftJoinAndSelect('visit.visited_by_user', 'visited_by_user')
      .leftJoinAndSelect('visit.reports', 'reports')
      .leftJoinAndSelect('reports.company', 'company')
      .distinct(true);

    // Filtri di base
    if (userId) {
      queryBuilder = queryBuilder.andWhere('visit.visited_by_user_id = :userId', { userId });
    }

    // Applica filtri estratti
    if (filters.clientId) {
      queryBuilder = queryBuilder.andWhere('visit.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }

    if (filters.companyId) {
      queryBuilder = queryBuilder.andWhere('reports.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    if (filters.startDate) {
      queryBuilder = queryBuilder.andWhere('visit.visit_date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder = queryBuilder.andWhere('visit.visit_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Search keywords on ALL available fields
    if (filters.keywords && filters.keywords.length > 0) {
      const conditions: string[] = [];
      const params: any = {};

      filters.keywords.forEach((kw, idx) => {
        const key = `kw${idx}`;
        const likeValue = `%${kw}%`;

        // Search on ALL available fields
        // Client
        conditions.push(`client.name ILIKE :${key}_client_name`);
        conditions.push(`client.country ILIKE :${key}_client_country`);
        // Report
        conditions.push(`reports.content ILIKE :${key}_content`);
        conditions.push(`reports.section ILIKE :${key}_section`);
        conditions.push(`reports.status::text ILIKE :${key}_status`);
        conditions.push(`reports.created_at::text ILIKE :${key}_report_created`);
        conditions.push(`reports.updated_at::text ILIKE :${key}_report_updated`);
        // Company
        conditions.push(`company.name ILIKE :${key}_company`);
        // User
        conditions.push(`visited_by_user.name ILIKE :${key}_user`);
        // Dates
        conditions.push(`visit.visit_date::text ILIKE :${key}_visit_date`);

        params[`${key}_client_name`] = likeValue;
        params[`${key}_client_country`] = likeValue;
        params[`${key}_content`] = likeValue;
        params[`${key}_section`] = likeValue;
        params[`${key}_status`] = likeValue;
        params[`${key}_report_created`] = likeValue;
        params[`${key}_report_updated`] = likeValue;
        params[`${key}_company`] = likeValue;
        params[`${key}_user`] = likeValue;
        params[`${key}_visit_date`] = likeValue;
      });

      if (conditions.length > 0) {
        queryBuilder = queryBuilder.andWhere(`(${conditions.join(' OR ')})`, params);
      }
    }

    queryBuilder = queryBuilder.orderBy('visit.visit_date', 'DESC');

    const sql = queryBuilder.getSql();
    console.log('🔎 SQL Query:', sql);

    const results = await queryBuilder.getMany();
    console.log(`✅ Found ${results.length} visits`);
    return results;
  }

  /**
   * Search TODOs with semantic filters
   */
  async searchTodos(query: string, userId?: string): Promise<TodoItem[]> {
    const filters = await this.interpretSearchQuery(query, 'todos');

    const todoRepository = AppDataSource.getRepository(TodoItem);
    let queryBuilder = todoRepository
      .createQueryBuilder('todo')
      .leftJoinAndSelect('todo.assigned_to_user', 'assigned_to_user')
      .leftJoinAndSelect('todo.created_by_user', 'created_by_user')
      .leftJoinAndSelect('todo.client', 'client')
      .leftJoinAndSelect('todo.company', 'company')
      .leftJoinAndSelect('todo.visit_report', 'visit_report')
      .distinct(true);

    // If searched by non-admin user, show only their TODOs
    if (userId) {
      queryBuilder = queryBuilder.andWhere('todo.assigned_to_user_id = :userId', {
        userId,
      });
    }

    // Apply extracted filters
    if (filters.clientId) {
      queryBuilder = queryBuilder.andWhere('todo.client_id = :clientId', {
        clientId: filters.clientId,
      });
    }

    if (filters.companyId) {
      queryBuilder = queryBuilder.andWhere('todo.company_id = :companyId', {
        companyId: filters.companyId,
      });
    }

    if (filters.status) {
      queryBuilder = queryBuilder.andWhere('todo.status = :status', {
        status: filters.status,
      });
    }

    if (filters.startDate) {
      queryBuilder = queryBuilder.andWhere('todo.due_date >= :startDate', {
        startDate: filters.startDate,
      });
    }

    if (filters.endDate) {
      queryBuilder = queryBuilder.andWhere('todo.due_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Search keywords on ALL available fields
    if (filters.keywords && filters.keywords.length > 0) {
      const conditions: string[] = [];
      const params: any = {};

      filters.keywords.forEach((kw, idx) => {
        const key = `kw${idx}`;
        const likeValue = `%${kw}%`;

        // Search on ALL available fields
        // TODO
        conditions.push(`todo.title ILIKE :${key}_title`);
        conditions.push(`todo.status::text ILIKE :${key}_todo_status`);
        // Client
        conditions.push(`client.name ILIKE :${key}_client`);
        // Company
        conditions.push(`company.name ILIKE :${key}_company`);
        // Users
        conditions.push(`assigned_to_user.name ILIKE :${key}_assigned_to`);
        conditions.push(`created_by_user.name ILIKE :${key}_created_by`);
        // Dates
        conditions.push(`todo.due_date::text ILIKE :${key}_due_date`);
        conditions.push(`todo.created_at::text ILIKE :${key}_todo_created`);
        conditions.push(`todo.updated_at::text ILIKE :${key}_todo_updated`);

        params[`${key}_title`] = likeValue;
        params[`${key}_todo_status`] = likeValue;
        params[`${key}_client`] = likeValue;
        params[`${key}_company`] = likeValue;
        params[`${key}_assigned_to`] = likeValue;
        params[`${key}_created_by`] = likeValue;
        params[`${key}_due_date`] = likeValue;
        params[`${key}_todo_created`] = likeValue;
        params[`${key}_todo_updated`] = likeValue;
      });

      if (conditions.length > 0) {
        queryBuilder = queryBuilder.andWhere(`(${conditions.join(' OR ')})`, params);
      }
    }

    queryBuilder = queryBuilder.orderBy('todo.due_date', 'DESC');

    return await queryBuilder.getMany();
  }

  /**
   * Search projects with semantic filters
   */
  async searchProjects(query: string): Promise<Project[]> {
    console.log('🔍 Search projects - Query:', query);
    const filters = await this.interpretSearchQuery(query, 'visits'); // reuse same interpreter

    const projectRepository = AppDataSource.getRepository(Project);
    let queryBuilder = projectRepository
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.supplier', 'supplier')
      .leftJoinAndSelect('project.client', 'client')
      .distinct(true);

    // Date filters on registration_date
    if (filters.startDate) {
      queryBuilder = queryBuilder.andWhere('project.registration_date >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      queryBuilder = queryBuilder.andWhere('project.registration_date <= :endDate', {
        endDate: filters.endDate,
      });
    }

    // Status filter
    if (filters.status) {
      queryBuilder = queryBuilder.andWhere('project.status = :status', {
        status: filters.status.toUpperCase(),
      });
    }

    // Keyword search across ALL project fields
    if (filters.keywords && filters.keywords.length > 0) {
      const conditions: string[] = [];
      const params: any = {};

      filters.keywords.forEach((kw, idx) => {
        const key = `kw${idx}`;
        const likeValue = `%${kw}%`;

        // Project fields
        conditions.push(`project.project_name ILIKE :${key}_name`);
        conditions.push(`project.country ILIKE :${key}_country`);
        conditions.push(`project.status::text ILIKE :${key}_status`);
        conditions.push(`project.project_development ILIKE :${key}_dev`);
        conditions.push(`project.project_registration ILIKE :${key}_reg`);
        conditions.push(`project.project_address ILIKE :${key}_addr`);
        conditions.push(`project.project_type ILIKE :${key}_type`);
        conditions.push(`project.detail_of_project_type ILIKE :${key}_detail`);
        conditions.push(`project.designated_area ILIKE :${key}_area`);
        conditions.push(`project.architect_designer ILIKE :${key}_arch`);
        conditions.push(`project.developer ILIKE :${key}_devlpr`);
        conditions.push(`project.contractor ILIKE :${key}_contr`);
        conditions.push(`project.item ILIKE :${key}_item`);
        conditions.push(`project.note ILIKE :${key}_note`);
        // Related entities
        conditions.push(`supplier.name ILIKE :${key}_supplier`);
        conditions.push(`client.name ILIKE :${key}_client`);

        params[`${key}_name`] = likeValue;
        params[`${key}_country`] = likeValue;
        params[`${key}_status`] = likeValue;
        params[`${key}_dev`] = likeValue;
        params[`${key}_reg`] = likeValue;
        params[`${key}_addr`] = likeValue;
        params[`${key}_type`] = likeValue;
        params[`${key}_detail`] = likeValue;
        params[`${key}_area`] = likeValue;
        params[`${key}_arch`] = likeValue;
        params[`${key}_devlpr`] = likeValue;
        params[`${key}_contr`] = likeValue;
        params[`${key}_item`] = likeValue;
        params[`${key}_note`] = likeValue;
        params[`${key}_supplier`] = likeValue;
        params[`${key}_client`] = likeValue;
      });

      if (conditions.length > 0) {
        queryBuilder = queryBuilder.andWhere(`(${conditions.join(' OR ')})`, params);
      }
    }

    queryBuilder = queryBuilder.orderBy('project.project_number', 'DESC');

    const results = await queryBuilder.getMany();
    console.log(`✅ Found ${results.length} projects`);
    return results;
  }
}
