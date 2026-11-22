import { AuthPayload } from '../types';
import { InvoiceService } from './InvoiceService';
import { CommissionService } from './CommissionService';
import { VisitService } from './VisitService';
import { ClientService } from './ClientService';
import { CompanyService } from './CompanyService';
import { TodoService } from './TodoService';
import { PermissionService } from './PermissionService';

/**
 * Read-only tools exposed to Claude through the MCP endpoint (/mcp).
 *
 * Every tool applies the same visibility rules as the matching REST route,
 * and none of them writes anything. Each returns flat rows ({ rows: [...] })
 * so a dashboard can chart them directly.
 */

export interface McpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, any>;
  run: (user: AuthPayload, args: Record<string, any>) => Promise<Record<string, any>[]>;
}

export class McpAccessError extends Error {}

const invoiceService = new InvoiceService();
const commissionService = new CommissionService();
const visitService = new VisitService();
const clientService = new ClientService();
const companyService = new CompanyService();
const todoService = new TodoService();
const permissionService = new PermissionService();

const seesEverything = (user: AuthPayload) =>
  user.role === 'master_admin' || user.role === 'admin' || user.role === 'manager';

const canViewRevenue = (user: AuthPayload) =>
  user.role === 'master_admin' || (user.role === 'admin' && !!user.can_view_revenue);

const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const day = (v: any): string | null => {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const isDay = (v: any): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const sameText = (a: any, b: any) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

const inRange = (d: string | null, start?: any, end?: any) => {
  if (isDay(start) && (!d || d < start)) return false;
  if (isDay(end) && (!d || d > end)) return false;
  return true;
};

const dateProps = {
  data_inizio: { type: 'string', description: 'Data minima inclusa, formato AAAA-MM-GG.' },
  data_fine: { type: 'string', description: 'Data massima inclusa, formato AAAA-MM-GG.' },
};

/** Client ids the user may see, or null when the user sees every client. */
async function visibleClientIds(user: AuthPayload): Promise<Set<string> | null> {
  if (seesEverything(user)) return null;
  const ids = await permissionService.getVisibleClients(user.id);
  return ids.includes('*') ? null : new Set(ids);
}

export const mcpTools: McpTool[] = [
  {
    name: 'tradeflow_fatture',
    title: 'Fatture e provvigioni',
    description:
      'Elenco delle fatture elaborate in Amministrazione, una riga per fattura, con totale, percentuale e importi di provvigione (lorda, netta, subagenti) e stato della provvigione. Solo per utenti con accesso al fatturato.',
    inputSchema: {
      type: 'object',
      properties: {
        azienda: { type: 'string', description: 'Nome esatto dell\'azienda (es. "Novabell").' },
        cliente: { type: 'string', description: 'Nome esatto del cliente.' },
        paese: { type: 'string', description: 'Paese del cliente (es. "Taiwan").' },
        ...dateProps,
      },
      additionalProperties: false,
    },
    run: async (user, args) => {
      if (!canViewRevenue(user)) {
        throw new McpAccessError('Il tuo utente TradeFlow non ha accesso al fatturato.');
      }
      const filters = {
        start_date: isDay(args.data_inizio) ? args.data_inizio : undefined,
        end_date: isDay(args.data_fine) ? args.data_fine : undefined,
      };
      const [{ invoices }, commissions] = await Promise.all([
        invoiceService.getInvoices({ ...filters, status: 'processed', limit: 5000 }),
        commissionService.getInvoiceCommissions(filters),
      ]);
      const byInvoice = new Map<string, any>(commissions.map((c: any) => [c.invoice_id, c]));

      return invoices
        .filter((inv: any) => !args.azienda || sameText(inv.company?.name, args.azienda))
        .filter((inv: any) => !args.cliente || sameText(inv.client?.name, args.cliente))
        .filter((inv: any) => !args.paese || sameText(inv.client?.country, args.paese))
        .map((inv: any) => {
          const c = byInvoice.get(inv.id);
          const subAgents = (c?.sub_agent_commissions || []).reduce((s: number, x: any) => s + num(x.amount), 0);
          return {
            numero: inv.invoice_number || inv.original_filename,
            azienda: inv.company?.name ?? null,
            cliente: inv.client?.name ?? inv.customer_name ?? null,
            paese: inv.client?.country ?? null,
            data: day(inv.invoice_date),
            totale: num(inv.total_amount),
            valuta: inv.currency || 'EUR',
            percentuale: num(c?.commission_rate_percent),
            provvigione_lorda: num(c?.gross_commission),
            provvigione_netta: num(c?.net_commission),
            provvigione_subagenti: Math.round(subAgents * 100) / 100,
            stato_provvigione: c?.commission_status ?? null,
          };
        })
        .sort((a, b) => String(b.data ?? '').localeCompare(String(a.data ?? '')));
    },
  },
  {
    name: 'tradeflow_visite',
    title: 'Visite ai clienti',
    description:
      'Elenco delle visite ai clienti, una riga per visita, con data, cliente, paese, agente, stato, tipo di incontro e aziende trattate nei report. Con con_report=true aggiunge il testo dei report.',
    inputSchema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nome esatto del cliente.' },
        paese: { type: 'string', description: 'Paese del cliente.' },
        agente: { type: 'string', description: 'Nome esatto di chi ha fatto la visita.' },
        stato: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
        con_report: { type: 'boolean', description: 'Se true, include il testo dei report di visita.' },
        ...dateProps,
      },
      additionalProperties: false,
    },
    run: async (user, args) => {
      const visible = await visibleClientIds(user);
      const visits = await visitService.getVisits(
        ['scheduled', 'completed', 'cancelled'].includes(args.stato) ? { status: args.stato } : undefined
      );
      return visits
        .filter((v: any) => !visible || visible.has(v.client_id))
        .filter((v: any) => !args.cliente || sameText(v.client?.name, args.cliente))
        .filter((v: any) => !args.paese || sameText(v.client?.country, args.paese))
        .filter((v: any) => !args.agente || sameText(v.visited_by_user?.name, args.agente))
        .filter((v: any) => inRange(day(v.visit_date), args.data_inizio, args.data_fine))
        .map((v: any) => {
          const reports = v.reports || [];
          const companies = Array.from(new Set(reports.map((r: any) => r.company?.name).filter(Boolean)));
          const row: Record<string, any> = {
            data: day(v.visit_date),
            cliente: v.client?.name ?? null,
            paese: v.client?.country ?? null,
            citta: v.client?.city ?? null,
            agente: v.visited_by_user?.name ?? null,
            stato: v.status,
            tipo_incontro: v.meeting_type ?? null,
            aziende: companies.join(', '),
            numero_report: reports.length,
          };
          if (args.con_report === true) {
            row.report = reports
              .map((r: any) => `[${r.company?.name ?? ''} - ${r.section ?? ''}] ${r.content ?? ''}`)
              .join('\n\n');
          }
          return row;
        });
    },
  },
  {
    name: 'tradeflow_clienti',
    title: 'Clienti',
    description:
      'Elenco dei clienti visibili all\'utente, una riga per cliente, con paese, città, ruolo, showroom e aziende collegate. Non include i contatti personali.',
    inputSchema: {
      type: 'object',
      properties: {
        paese: { type: 'string', description: 'Paese del cliente.' },
      },
      additionalProperties: false,
    },
    run: async (user, args) => {
      const visible = await visibleClientIds(user);
      const clients = await clientService.getClients();
      return clients
        .filter((c: any) => !visible || visible.has(c.id))
        .filter((c: any) => !args.paese || sameText(c.country, args.paese))
        .map((c: any) => ({
          cliente: c.name,
          paese: c.country ?? null,
          citta: c.city ?? null,
          ruolo: c.role ?? null,
          ha_showroom: !!c.has_showroom,
          numero_showroom: num(c.showroom_count),
          aziende: (c.clientCompanies || []).map((cc: any) => cc.company?.name).filter(Boolean).join(', '),
        }));
    },
  },
  {
    name: 'tradeflow_aziende',
    title: 'Aziende rappresentate',
    description: 'Elenco delle aziende (fornitori/mandanti) visibili all\'utente, con paese, settore e rapporto.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: async (user) => {
      let companies = await companyService.getCompanies();
      const visible = await visibleClientIds(user);
      if (visible) {
        const allowed = new Set<string>();
        for (const clientId of visible) {
          const ids = await permissionService.getVisibleCompanies(user.id, clientId);
          if (ids.includes('*')) {
            companies.forEach((c: any) => allowed.add(c.id));
            break;
          }
          ids.forEach((id) => allowed.add(id));
        }
        companies = companies.filter((c: any) => allowed.has(c.id));
      }
      return companies.map((c: any) => ({
        azienda: c.name,
        paese: c.country ?? null,
        settore: c.industry ?? null,
        rapporto: c.rapporto ?? null,
      }));
    },
  },
  {
    name: 'tradeflow_task',
    title: 'Task',
    description:
      'Elenco dei task, una riga per task, con stato, scadenza, priorità (1 bassa, 2 media, 3 alta), assegnatario, cliente e azienda. Admin e manager vedono tutti i task di lavoro; gli altri utenti solo i propri.',
    inputSchema: {
      type: 'object',
      properties: {
        stato: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        solo_scaduti: { type: 'boolean', description: 'Se true, solo i task scaduti e non completati.' },
      },
      additionalProperties: false,
    },
    run: async (user, args) => {
      const filters = {
        status: ['todo', 'in_progress', 'done'].includes(args.stato) ? args.stato : undefined,
        overdue: args.solo_scaduti === true,
      };
      let todos = seesEverything(user)
        ? await todoService.getTodos(filters)
        : await todoService.getMyTodos(user.id, filters);

      // Same category visibility as GET /api/todos.
      const userName = user.name || '';
      const isStefano = userName.includes('Stefano') || userName.includes('Bozzarelli');
      todos = todos.filter((t: any) => {
        if (t.category === 'personal') {
          return String(t.created_by_user_id) === String(user.id) || String(t.assigned_to_user_id) === String(user.id);
        }
        if (t.category === 'architectural_lines') return isStefano;
        return true;
      });

      return todos.map((t: any) => ({
        titolo: t.title,
        stato: t.status,
        scadenza: day(t.due_date),
        priorita: num(t.priority),
        categoria: t.category ?? null,
        assegnato_a: t.assigned_to_user?.name ?? null,
        creato_da: t.created_by_user?.name ?? null,
        cliente: t.client?.name ?? null,
        azienda: t.company?.name ?? null,
        creato_il: day(t.created_at),
      }));
    },
  },
];
