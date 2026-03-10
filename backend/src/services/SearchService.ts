import Anthropic from '@anthropic-ai/sdk';
import { AppDataSource } from '../config/database';
import { Visit } from '../entities/Visit';
import { TodoItem } from '../entities/TodoItem';

const getClient = () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('🔑 Checking ANTHROPIC_API_KEY:', apiKey ? '✅ Found' : '❌ Not found');
  if (!apiKey) {
    console.warn('⚠️  ANTHROPIC_API_KEY non trovata - usando fallback di estrazione date');
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
   * Estrae date da keywords e le converte in formato YYYY-MM-DD
   * Supporta formati: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, ecc.
   */
  private extractDatesFromKeywords(keywords: string[]): { filteredKeywords: string[]; dates: string[] } {
    if (!keywords) return { filteredKeywords: [], dates: [] };

    const datePatterns = [
      /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/g, // DD/MM/YYYY o DD-MM-YYYY
      /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g, // YYYY-MM-DD o YYYY/MM/DD
    ];

    const extractedDates = new Set<string>();
    const filteredKeywords: string[] = [];

    keywords.forEach(kw => {
      let matched = false;

      // Prova pattern DD/MM/YYYY
      const match1 = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(kw);
      if (match1) {
        const [, day, month, year] = match1;
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        console.log('📅 Data estratta da keyword:', kw, '→', date);
        extractedDates.add(date);
        matched = true;
      }

      // Prova pattern YYYY-MM-DD
      const match2 = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/.exec(kw);
      if (match2) {
        const [, year, month, day] = match2;
        const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        console.log('📅 Data estratta da keyword:', kw, '→', date);
        extractedDates.add(date);
        matched = true;
      }

      // Se non è una data, mantienilo come keyword
      if (!matched) {
        filteredKeywords.push(kw);
      }
    });

    console.log('✅ Estrazione date completata. Trovate:', Array.from(extractedDates));
    return {
      filteredKeywords,
      dates: Array.from(extractedDates)
    };
  }

  /**
   * Estrae date relative dalla query - SOLUZIONE DEFINITIVA!
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
      console.log('✅ ESTRATTO "questo mese" →', startDate, 'to', endDate);
    }

    if (/^\s*oggi\s*$|^oggi\s|\sodierno$/i.test(query) || /oggi|odierno/i.test(query)) {
      startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;
      endDate = startDate;
      cleanQuery = cleanQuery.replace(/oggi|odierno/gi, '').trim();
      console.log('✅ ESTRATTO "oggi" →', startDate);
    }

    if (/questa\s+settimana|settimana\s+corrente/i.test(query)) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      startDate = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
      endDate = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth() + 1).padStart(2, '0')}-${String(weekEnd.getDate()).padStart(2, '0')}`;
      cleanQuery = cleanQuery.replace(/questa\s+settimana|settimana\s+corrente/gi, '').trim();
      console.log('✅ ESTRATTO "questa settimana" →', startDate, 'to', endDate);
    }

    // Estrai mesi specifici (gennaio, febbraio, marzo, etc.)
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
        break; // Solo il primo mese trovato
      }
    }
    if (!startDate) {
      console.log('❌ NO MONTHS FOUND');
    }

    return { startDate, endDate, cleanQuery };
  }

  /**
   * Interpreta una query naturale e estrae i filtri intelligenti
   */
  async interpretSearchQuery(query: string, context: 'visits' | 'todos'): Promise<SearchFilters> {
    console.log('🎯 INPUT QUERY:', query);

    // STEP 1: Estrai date relative PRIMA di mandare a Claude!
    const { startDate: relativeStartDate, endDate: relativeEndDate, cleanQuery } = this.extractRelativeDates(query);
    console.log('🧹 QUERY PULITA (senza date relative):', cleanQuery);

    const contextDescription =
      context === 'visits'
        ? 'visite a clienti con report per aziende'
        : 'attività TODO assegnate a utenti';

    // Get current date for relative date interpretation
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();
    const formattedToday = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(currentDay).padStart(2, '0')}`;

    try {
      // SE sono state estratte date relative, restituisci subito!
      if (relativeStartDate || relativeEndDate) {
        console.log('⚡ DATE RELATIVE GIÀ ESTRATTE! Non serve Claude');
        const result: SearchFilters = {
          relativeDate: true // Flag that dates came from relative pattern
        };
        if (relativeStartDate) result.startDate = relativeStartDate;
        if (relativeEndDate) result.endDate = relativeEndDate;
        // NON aggiungiamo keywords da cleanQuery quando abbiamo date relative!
        // Le parole rimaste (es: "scadenze") sono solo descrittive, non filtri reali
        console.log('✨ RESULT CON DATE RELATIVE:', JSON.stringify(result, null, 2));
        return result;
      }

      const client = getClient();

      // Se non c'è la chiave API, usiamo direttamente il fallback
      if (!client) {
        console.log('📝 Usando fallback di estrazione date (no Anthropic API)');
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

      // Manda a Claude solo la query PULITA (senza date relative)
      const message = await client.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: `ISTRUZIONI CRITICHE: Interpreta query di ricerca naturali. Estrai SOLO JSON valido, niente altro.

Data attuale: ${formattedToday}
Query: "${cleanQuery}"

OUTPUT JSON (estrai SOLO i campi presenti):
{
  "startDate": "YYYY-MM-DD",
  "endDate": "YYYY-MM-DD",
  "keywords": ["keyword1", "keyword2"]
}

REGOLE ASSOLUTE PER LE DATE (CRITICHE!):
1. SE vedi data specifica (09/03/2026, "9 marzo 2026") → ESTRAI in startDate/endDate
2. Data specifica (09/03/2026) → converti sempre in YYYY-MM-DD: 2026-03-09
3. "marzo" o altri mesi → calcola range intero mese
4. "ieri" → startDate=data ieri, endDate=data ieri
5. "ultimi 7 giorni" → range ultimi 7 giorni

NOTA: Date relative come "questo mese", "oggi", "questa settimana" sono già state estratte e rimosse dalla query!

CRITICO: Le DATE NON vanno MAI nei keywords! Solo parole chiave di ricerca vanno in keywords.

ESEMPI:
- Query: "visite di marzo" → {"startDate": "2026-03-01", "endDate": "2026-03-31"}
- Query: "todo di oggi" → {"startDate": "${formattedToday}", "endDate": "${formattedToday}"}
- Query: "13/03/2026 cliente Pippo" → {"startDate": "2026-03-13", "endDate": "2026-03-13", "keywords": ["Pippo"]}

RISPOSTA SOLO JSON, niente testo!`,
          },
        ],
      });

      try {
        const content = message.content[0];
        if (content.type === 'text') {
          console.log('📝 CLAUDE RAW RESPONSE:\n', content.text);
          // Estrai il JSON dalla risposta
          const jsonMatch = content.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            console.log('✅ JSON ESTRATTO:\n', jsonMatch[0]);
            const filters = JSON.parse(jsonMatch[0]);
            console.log('📊 FILTERS DOPO PARSE:', JSON.stringify(filters, null, 2));

            // Post-processing: estrai date dai keywords
            if (filters.keywords && filters.keywords.length > 0) {
              console.log('🔑 KEYWORDS ORIGINALI:', filters.keywords);
              const { filteredKeywords, dates } = this.extractDatesFromKeywords(filters.keywords);
              console.log('📅 DATE ESTRATTE:', dates);
              console.log('🔤 KEYWORDS FILTRATI:', filteredKeywords);
              filters.keywords = filteredKeywords;

              // Se sono state estratte date e non ci sono startDate/endDate, usale
              if (dates.length > 0) {
                if (!filters.startDate) {
                  filters.startDate = dates[0];
                }
                if (!filters.endDate) {
                  filters.endDate = dates[dates.length - 1];
                }
              }
            }
            console.log('✨ FINAL FILTERS RITORNATI:', JSON.stringify(filters, null, 2));
            return filters;
          }
        }
      } catch (error) {
        console.error('Errore nel parsing della risposta Claude:', error);
      }

      // Fallback: estrai date anche dalla query originale
      const fallbackFilters: SearchFilters = { keywords: query.split(' ').filter(w => w.length > 2) };
      const { filteredKeywords, dates } = this.extractDatesFromKeywords(fallbackFilters.keywords);
      fallbackFilters.keywords = filteredKeywords;
      if (dates.length > 0) {
        fallbackFilters.startDate = dates[0];
        fallbackFilters.endDate = dates[dates.length - 1];
      }
      return fallbackFilters;
    } catch (error) {
      console.error('Errore nella ricerca con IA:', error);
      // Fallback a ricerca semplice per keywords
      return { keywords: query.split(' ').filter(w => w.length > 2) };
    }
  }

  /**
   * Ricerca visite con filtri semantici
   */
  async searchVisits(query: string, userId?: string): Promise<Visit[]> {
    console.log('🔍 Ricerca visite - Query:', query);
    const filters = await this.interpretSearchQuery(query, 'visits');
    console.log('📋 Filtri estratti:', JSON.stringify(filters, null, 2));
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

    // Ricerca keywords su TUTTI i campi disponibili
    if (filters.keywords && filters.keywords.length > 0) {
      const conditions: string[] = [];
      const params: any = {};

      filters.keywords.forEach((kw, idx) => {
        const key = `kw${idx}`;
        const likeValue = `%${kw}%`;

        // Ricerca su TUTTI i campi disponibili
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
    console.log(`✅ Trovate ${results.length} visite`);
    return results;
  }

  /**
   * Ricerca TODO con filtri semantici
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

    // Se cercato da utente non-admin, mostra solo i propri TODO
    if (userId) {
      queryBuilder = queryBuilder.andWhere('todo.assigned_to_user_id = :userId', {
        userId,
      });
    }

    // Applica filtri estratti
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

    // Ricerca keywords su TUTTI i campi disponibili
    if (filters.keywords && filters.keywords.length > 0) {
      const conditions: string[] = [];
      const params: any = {};

      filters.keywords.forEach((kw, idx) => {
        const key = `kw${idx}`;
        const likeValue = `%${kw}%`;

        // Ricerca su TUTTI i campi disponibili
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
}
