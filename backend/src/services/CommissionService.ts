import { AppDataSource } from '../config/database';
import { CommissionRate } from '../entities/CommissionRate';
import { SubAgent } from '../entities/SubAgent';
import { SubAgentCommissionRate } from '../entities/SubAgentCommissionRate';
import { InvoiceCommission } from '../entities/InvoiceCommission';
import { InvoiceSubAgentCommission } from '../entities/InvoiceSubAgentCommission';
import { Invoice } from '../entities/Invoice';

export class CommissionService {
  private rateRepo = AppDataSource.getRepository(CommissionRate);
  private subAgentRepo = AppDataSource.getRepository(SubAgent);
  private subAgentRateRepo = AppDataSource.getRepository(SubAgentCommissionRate);
  private commissionRepo = AppDataSource.getRepository(InvoiceCommission);
  private subCommissionRepo = AppDataSource.getRepository(InvoiceSubAgentCommission);
  private invoiceRepo = AppDataSource.getRepository(Invoice);

  // ─── Rate Hierarchy Lookup ──────────────────────────────

  async getEffectiveRate(companyId: string, country?: string, clientId?: string): Promise<number> {
    // 1. Client + Country specific rate
    if (clientId && country) {
      const rate = await this.rateRepo.createQueryBuilder('r')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.country = :country', { country })
        .andWhere('r.client_id = :clientId', { clientId })
        .getOne();
      if (rate) return Number(rate.rate_percent);
    }

    // 2. Client only (no country)
    if (clientId) {
      const rate = await this.rateRepo.createQueryBuilder('r')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.country IS NULL')
        .andWhere('r.client_id = :clientId', { clientId })
        .getOne();
      if (rate) return Number(rate.rate_percent);
    }

    // 3. Country only (no client)
    if (country) {
      const rate = await this.rateRepo.createQueryBuilder('r')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.country = :country', { country })
        .andWhere('r.client_id IS NULL')
        .getOne();
      if (rate) return Number(rate.rate_percent);
    }

    // 4. Company default (no country, no client)
    const defaultRate = await this.rateRepo.createQueryBuilder('r')
      .where('r.company_id = :companyId', { companyId })
      .andWhere('r.country IS NULL')
      .andWhere('r.client_id IS NULL')
      .getOne();
    if (defaultRate) return Number(defaultRate.rate_percent);

    return 0;
  }

  // ─── Sub-Agent Rate Lookup ──────────────────────────────

  async getEffectiveSubAgentRates(companyId: string, country?: string, clientId?: string): Promise<SubAgentCommissionRate[]> {
    // Get all sub-agent rates applicable to this company/country/client
    // For each sub-agent, pick the most specific rate
    const allRates = await this.subAgentRateRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.sub_agent', 'sa')
      .where('r.company_id = :companyId', { companyId })
      .orderBy('r.priority', 'ASC')
      .getMany();

    // Group by sub_agent_id, pick most specific
    const bySubAgent = new Map<string, SubAgentCommissionRate[]>();
    for (const rate of allRates) {
      const arr = bySubAgent.get(rate.sub_agent_id) || [];
      arr.push(rate);
      bySubAgent.set(rate.sub_agent_id, arr);
    }

    const effectiveRates: SubAgentCommissionRate[] = [];
    for (const [subAgentId, rates] of bySubAgent) {
      // Priority: client+country > client only > country only > default
      let best: SubAgentCommissionRate | null = null;
      if (clientId && country) {
        best = rates.find(r => r.client_id === clientId && r.country === country) || null;
      }
      if (!best && clientId) {
        best = rates.find(r => r.client_id === clientId && !r.country) || null;
      }
      if (!best && country) {
        best = rates.find(r => r.country === country && !r.client_id) || null;
      }
      if (!best) {
        best = rates.find(r => !r.country && !r.client_id) || null;
      }
      if (best) effectiveRates.push(best);
    }

    return effectiveRates.sort((a, b) => a.priority - b.priority);
  }

  // ─── Calculate Invoice Commission ──────────────────────

  async calculateInvoiceCommission(invoiceId: string): Promise<InvoiceCommission | null> {
    const invoice = await this.invoiceRepo.findOne({
      where: { id: invoiceId },
      relations: ['company', 'client'],
    });
    if (!invoice || invoice.status !== 'processed') return null;

    const country = invoice.client?.country;
    const clientId = invoice.client_id;
    const companyId = invoice.company_id;

    // Get Primula's commission rate
    const ratePercent = await this.getEffectiveRate(companyId, country || undefined, clientId || undefined);
    const invoiceTotal = Number(invoice.total_amount) || 0;
    const grossCommission = Math.round(invoiceTotal * ratePercent) / 100;

    // Get sub-agent rates
    const subAgentRates = await this.getEffectiveSubAgentRates(companyId, country || undefined, clientId || undefined);

    // Calculate sub-agent commissions
    let remaining = grossCommission;
    const subCommissions: { sub_agent_id: string; rate_percent: number; calc_on: string; amount: number }[] = [];

    for (const saRate of subAgentRates) {
      const rate = Number(saRate.rate_percent);
      let base: number;
      if (saRate.calc_on === 'residual') {
        base = remaining;
      } else {
        base = grossCommission;
      }
      const amount = Math.round(base * rate) / 100;
      subCommissions.push({
        sub_agent_id: saRate.sub_agent_id,
        rate_percent: rate,
        calc_on: saRate.calc_on,
        amount,
      });
      remaining -= amount;
    }

    const netCommission = grossCommission - subCommissions.reduce((sum, sc) => sum + sc.amount, 0);

    // Upsert InvoiceCommission
    let commission = await this.commissionRepo.findOne({ where: { invoice_id: invoiceId } });
    if (commission) {
      // If manually overridden, don't change the amounts but update the calculated fields
      if (!commission.manual_override) {
        commission.commission_rate_percent = ratePercent;
        commission.gross_commission = grossCommission;
        commission.net_commission = netCommission;
      }
    } else {
      commission = this.commissionRepo.create({
        invoice_id: invoiceId,
        commission_rate_percent: ratePercent,
        gross_commission: grossCommission,
        net_commission: netCommission,
        commission_status: 'aggiunta',
      });
    }
    await this.commissionRepo.save(commission);

    // Delete existing sub-agent commissions and recreate
    await this.subCommissionRepo.delete({ invoice_commission_id: commission.id });
    for (const sc of subCommissions) {
      await this.subCommissionRepo.save(this.subCommissionRepo.create({
        invoice_commission_id: commission.id,
        ...sc,
      }));
    }

    return commission;
  }

  // ─── Commission Rate CRUD ──────────────────────────────

  async getCommissionRates(companyId?: string): Promise<CommissionRate[]> {
    const qb = this.rateRepo.createQueryBuilder('r')
      .leftJoinAndSelect('r.company', 'c')
      .leftJoinAndSelect('r.client', 'cl')
      .orderBy('c.name', 'ASC')
      .addOrderBy('r.country', 'ASC')
      .addOrderBy('cl.name', 'ASC');
    if (companyId) qb.where('r.company_id = :companyId', { companyId });
    return qb.getMany();
  }

  async upsertCommissionRate(data: { company_id: string; country?: string; client_id?: string; rate_percent: number }): Promise<CommissionRate> {
    // Try find existing
    const qb = this.rateRepo.createQueryBuilder('r')
      .where('r.company_id = :cid', { cid: data.company_id });
    if (data.country) qb.andWhere('r.country = :co', { co: data.country });
    else qb.andWhere('r.country IS NULL');
    if (data.client_id) qb.andWhere('r.client_id = :clid', { clid: data.client_id });
    else qb.andWhere('r.client_id IS NULL');

    let rate = await qb.getOne();
    if (rate) {
      rate.rate_percent = data.rate_percent;
    } else {
      rate = this.rateRepo.create({
        company_id: data.company_id,
        country: data.country || (null as any),
        client_id: data.client_id || (null as any),
        rate_percent: data.rate_percent,
      });
    }
    return this.rateRepo.save(rate);
  }

  async deleteCommissionRate(id: string): Promise<void> {
    await this.rateRepo.delete(id);
  }

  // ─── Sub-Agent CRUD ────────────────────────────────────

  async getSubAgents(): Promise<SubAgent[]> {
    return this.subAgentRepo.find({
      relations: ['user', 'rates', 'rates.company', 'rates.client'],
      order: { name: 'ASC' },
    });
  }

  async createSubAgent(data: { name: string; email?: string; phone?: string; notes?: string; user_id?: string }): Promise<SubAgent> {
    const sa = this.subAgentRepo.create(data as any);
    return this.subAgentRepo.save(sa) as any as Promise<SubAgent>;
  }

  async updateSubAgent(id: string, data: Partial<SubAgent>): Promise<SubAgent | null> {
    await this.subAgentRepo.update(id, data as any);
    return this.subAgentRepo.findOne({ where: { id }, relations: ['user'] });
  }

  async deleteSubAgent(id: string): Promise<void> {
    await this.subAgentRepo.delete(id);
  }

  // ─── Sub-Agent Rate CRUD ───────────────────────────────

  async getSubAgentRates(subAgentId: string): Promise<SubAgentCommissionRate[]> {
    return this.subAgentRateRepo.find({
      where: { sub_agent_id: subAgentId },
      relations: ['company', 'client'],
      order: { priority: 'ASC' },
    });
  }

  async upsertSubAgentRate(data: {
    sub_agent_id: string; company_id: string; country?: string; client_id?: string;
    rate_percent: number; calc_on?: string; priority?: number;
  }): Promise<SubAgentCommissionRate> {
    const rate = this.subAgentRateRepo.create({
      ...data,
      country: data.country || (null as any),
      client_id: data.client_id || (null as any),
      calc_on: data.calc_on || 'gross',
      priority: data.priority ?? 0,
    } as any);
    return this.subAgentRateRepo.save(rate) as any as Promise<SubAgentCommissionRate>;
  }

  async deleteSubAgentRate(id: string): Promise<void> {
    await this.subAgentRateRepo.delete(id);
  }

  // ─── Invoice Commission Management ─────────────────────

  async getInvoiceCommissions(filters?: {
    company_id?: string; client_id?: string; status?: string;
    start_date?: string; end_date?: string;
  }): Promise<any[]> {
    const qb = this.commissionRepo.createQueryBuilder('ic')
      .leftJoinAndSelect('ic.invoice', 'inv')
      .leftJoinAndSelect('inv.company', 'comp')
      .leftJoinAndSelect('inv.client', 'cl')
      .leftJoinAndSelect('ic.sub_agent_commissions', 'sac')
      .leftJoinAndSelect('sac.sub_agent', 'sa')
      .where('inv.status = :processed', { processed: 'processed' })
      .orderBy('inv.invoice_date', 'DESC');

    if (filters?.company_id) qb.andWhere('inv.company_id = :cid', { cid: filters.company_id });
    if (filters?.client_id) qb.andWhere('inv.client_id = :clid', { clid: filters.client_id });
    if (filters?.status) qb.andWhere('ic.commission_status = :st', { st: filters.status });
    if (filters?.start_date) qb.andWhere('inv.invoice_date >= :sd', { sd: filters.start_date });
    if (filters?.end_date) qb.andWhere('inv.invoice_date <= :ed', { ed: filters.end_date });

    return qb.getMany();
  }

  async getInvoiceCommission(invoiceId: string): Promise<InvoiceCommission | null> {
    return this.commissionRepo.findOne({
      where: { invoice_id: invoiceId },
      relations: ['invoice', 'invoice.company', 'invoice.client', 'sub_agent_commissions', 'sub_agent_commissions.sub_agent'],
    });
  }

  async overrideCommission(invoiceId: string, data: { rate_percent?: number; manual_amount?: number }): Promise<InvoiceCommission | null> {
    let commission = await this.commissionRepo.findOne({ where: { invoice_id: invoiceId } });
    if (!commission) return null;

    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId }, relations: ['company', 'client'] });
    if (!invoice) return null;

    let newGross: number;

    if (data.manual_amount !== undefined) {
      commission.manual_override = true;
      commission.manual_amount = data.manual_amount;
      commission.gross_commission = data.manual_amount;
      // Recalculate % as manual_amount / invoice_total * 100
      const invTotal = Number(invoice.total_amount) || 1;
      commission.commission_rate_percent = Math.round((data.manual_amount / invTotal) * 10000) / 100;
      newGross = data.manual_amount;
    } else if (data.rate_percent !== undefined) {
      commission.commission_rate_percent = data.rate_percent;
      newGross = Math.round(Number(invoice.total_amount) * data.rate_percent) / 100;
      commission.gross_commission = newGross;
      commission.manual_override = true;
      commission.manual_amount = newGross;
    } else {
      return commission;
    }

    // Recalculate sub-agent commissions based on new gross
    const companyId = invoice.company_id;
    const country = invoice.client?.country || undefined;
    const clientId = invoice.client_id || undefined;
    const subAgentRates = await this.getEffectiveSubAgentRates(companyId, country, clientId);

    let remaining = newGross;
    const subCommissions: { sub_agent_id: string; rate_percent: number; calc_on: string; amount: number }[] = [];

    for (const saRate of subAgentRates) {
      const rate = Number(saRate.rate_percent);
      const base = saRate.calc_on === 'residual' ? remaining : newGross;
      const amount = Math.round(base * rate) / 100;
      subCommissions.push({
        sub_agent_id: saRate.sub_agent_id,
        rate_percent: rate,
        calc_on: saRate.calc_on,
        amount,
      });
      remaining -= amount;
    }

    const subTotal = subCommissions.reduce((sum, sc) => sum + sc.amount, 0);
    commission.net_commission = newGross - subTotal;

    await this.commissionRepo.save(commission);

    // Delete and recreate sub-agent commissions
    await this.subCommissionRepo.delete({ invoice_commission_id: commission.id });
    for (const sc of subCommissions) {
      await this.subCommissionRepo.save(this.subCommissionRepo.create({
        invoice_commission_id: commission.id,
        ...sc,
      }));
    }

    return this.getInvoiceCommission(invoiceId);
  }

  async updateCommissionStatus(invoiceId: string, status: string): Promise<InvoiceCommission | null> {
    const commission = await this.commissionRepo.findOne({ where: { invoice_id: invoiceId } });
    if (!commission) return null;
    commission.commission_status = status;
    return this.commissionRepo.save(commission);
  }

  // ─── Stats ─────────────────────────────────────────────

  async getCommissionStats(filters?: { company_id?: string; company_ids?: string[]; country?: string; start_date?: string; end_date?: string; status?: string }): Promise<any> {
    const applyFilters = (qb: any, invAlias = 'inv') => {
      if (filters?.company_id && filters.company_id !== 'undefined') qb.andWhere(`${invAlias}.company_id = :cid`, { cid: filters.company_id });
      if (filters?.company_ids && filters.company_ids.length > 0) qb.andWhere(`${invAlias}.company_id IN (:...cids)`, { cids: filters.company_ids });
      if (filters?.country && filters.country !== 'undefined') qb.andWhere('cl.country = :country', { country: filters.country });
      if (filters?.start_date && filters.start_date !== 'undefined') qb.andWhere(`${invAlias}.invoice_date >= :sd`, { sd: filters.start_date });
      if (filters?.end_date && filters.end_date !== 'undefined') qb.andWhere(`${invAlias}.invoice_date <= :ed`, { ed: filters.end_date });
      if (filters?.status && filters.status !== 'undefined') qb.andWhere('ic.commission_status = :fstatus', { fstatus: filters.status });
    };

    // Totals
    const totalsQ = this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .leftJoin('inv.client', 'cl')
      .where('inv.status = :s', { s: 'processed' });
    applyFilters(totalsQ);
    const totals = await totalsQ
      .select('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .addSelect('COUNT(ic.id)', 'count')
      .getRawOne();

    // By Status
    const statusQ = this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .leftJoin('inv.client', 'cl')
      .where('inv.status = :s', { s: 'processed' });
    applyFilters(statusQ);
    const byStatus = await statusQ
      .select('ic.commission_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .groupBy('ic.commission_status')
      .getRawMany();

    // By Company
    const compQ = this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .leftJoin('inv.company', 'c')
      .leftJoin('inv.client', 'cl')
      .where('inv.status = :s', { s: 'processed' });
    applyFilters(compQ);
    const byCompany = await compQ
      .select('c.name', 'company_name')
      .addSelect('c.id', 'company_id')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .groupBy('c.id')
      .addGroupBy('c.name')
      .orderBy('SUM(ic.gross_commission)', 'DESC')
      .getRawMany();

    // By Country
    const countryQ = this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .leftJoin('inv.client', 'cl')
      .where('inv.status = :s', { s: 'processed' });
    applyFilters(countryQ);
    const byCountry = await countryQ
      .select("COALESCE(cl.country, 'N/D')", 'country')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .groupBy('cl.country')
      .orderBy('SUM(ic.gross_commission)', 'DESC')
      .getRawMany();

    // Sub-agent totals (with filters)
    const subQ = this.subCommissionRepo.createQueryBuilder('sac')
      .leftJoin('sac.sub_agent', 'sa')
      .leftJoin('sac.invoice_commission', 'ic')
      .leftJoin('ic.invoice', 'inv')
      .leftJoin('inv.client', 'cl')
      .where('inv.status = :s', { s: 'processed' });
    applyFilters(subQ);
    const subAgentTotals = await subQ
      .select('sa.name', 'sub_agent_name')
      .addSelect('sa.id', 'sub_agent_id')
      .addSelect('SUM(sac.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .groupBy('sa.id')
      .addGroupBy('sa.name')
      .orderBy('SUM(sac.amount)', 'DESC')
      .getRawMany();

    return {
      total_gross: Number(totals?.total_gross) || 0,
      total_net: Number(totals?.total_net) || 0,
      total_sub_agents: (Number(totals?.total_gross) || 0) - (Number(totals?.total_net) || 0),
      count: Number(totals?.count) || 0,
      by_status: byStatus,
      by_company: byCompany,
      by_country: byCountry,
      sub_agent_totals: subAgentTotals,
    };
  }

  // ─── Sub-Agent Detail ─────────────────────────────────

  async getSubAgentCommissions(subAgentId: string, filters?: { start_date?: string; end_date?: string }) {
    const qb = this.subCommissionRepo.createQueryBuilder('sac')
      .leftJoinAndSelect('sac.invoice_commission', 'ic')
      .leftJoinAndSelect('ic.invoice', 'inv')
      .leftJoinAndSelect('inv.company', 'c')
      .leftJoinAndSelect('inv.client', 'cl')
      .where('sac.sub_agent_id = :sid', { sid: subAgentId });

    if (filters?.start_date) qb.andWhere('inv.invoice_date >= :sd', { sd: filters.start_date });
    if (filters?.end_date) qb.andWhere('inv.invoice_date <= :ed', { ed: filters.end_date });

    qb.orderBy('inv.invoice_date', 'DESC');

    const commissions = await qb.getMany();

    // Get total expenses and calculate allocation
    const expenseAllocation = await this.getSubAgentExpenseAllocation(subAgentId, filters);

    const totals = commissions.reduce((acc, sac) => {
      const amount = Number(sac.amount) || 0;
      acc.total_amount += amount;
      acc.count++;
      const status = sac.invoice_commission?.commission_status || 'aggiunta';
      if (!acc.by_status[status]) acc.by_status[status] = { count: 0, total: 0, total_allocated_expense: 0 };
      acc.by_status[status].count++;
      acc.by_status[status].total += amount;
      return acc;
    }, {
      total_amount: 0,
      count: 0,
      by_status: {} as Record<string, { count: number; total: number; total_allocated_expense: number }>,
      total_allocated_expense: 0,
      by_country: [] as any[],
      by_company: [] as any[]
    });

    // Add allocated expense information to totals
    totals.total_allocated_expense = expenseAllocation.total_allocated_expense;
    totals.by_country = expenseAllocation.by_country;
    totals.by_company = expenseAllocation.by_company;

    // Allocate expenses to each commission based on its share of total commissions
    const commissionsWithExpense = commissions.map(sac => {
      const country = sac.invoice_commission?.invoice?.client?.country || 'N/D';
      const company_id = sac.invoice_commission?.invoice?.company_id;
      const allocated = expenseAllocation.commission_allocation.get(`${company_id}:${country}`) || 0;
      return { ...sac, allocated_expense: allocated };
    });

    // Update by_status totals with allocated expenses
    for (const sac of commissionsWithExpense) {
      const status = sac.invoice_commission?.commission_status || 'aggiunta';
      if (totals.by_status[status]) {
        totals.by_status[status].total_allocated_expense += sac.allocated_expense;
      }
    }

    return { commissions: commissionsWithExpense, totals };
  }

  // Calculate expense allocation by country/company based on commission share
  private async getSubAgentExpenseAllocation(subAgentId: string, filters?: { start_date?: string; end_date?: string }) {
    // Fetch all expenses for this sub-agent within the date range
    const expenseQb = AppDataSource.getRepository('sub_agent_expense')
      .createQueryBuilder('se')
      .where('se.sub_agent_id = :sid', { sid: subAgentId });

    if (filters?.start_date) expenseQb.andWhere('se.expense_date >= :sd', { sd: filters.start_date });
    if (filters?.end_date) expenseQb.andWhere('se.expense_date <= :ed', { ed: filters.end_date });

    const expenses = await expenseQb.getMany() as any[];
    const total_expenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Fetch all commissions with company/country info
    const commissionQb = this.subCommissionRepo.createQueryBuilder('sac')
      .leftJoinAndSelect('sac.invoice_commission', 'ic')
      .leftJoinAndSelect('ic.invoice', 'inv')
      .leftJoinAndSelect('inv.company', 'c')
      .leftJoinAndSelect('inv.client', 'cl')
      .where('sac.sub_agent_id = :sid', { sid: subAgentId });

    if (filters?.start_date) commissionQb.andWhere('inv.invoice_date >= :sd', { sd: filters.start_date });
    if (filters?.end_date) commissionQb.andWhere('inv.invoice_date <= :ed', { ed: filters.end_date });

    const commissions = await commissionQb.getMany();
    const total_commissions = commissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    // Group commissions by country and company
    const by_country: Record<string, number> = {};
    const by_company: Record<string, { name: string; id: string; total: number }> = {};
    const commission_allocation = new Map<string, number>();

    for (const c of commissions) {
      const country = c.invoice_commission?.invoice?.client?.country || 'N/D';
      const company = c.invoice_commission?.invoice?.company;
      const amount = Number(c.amount || 0);

      by_country[country] = (by_country[country] || 0) + amount;
      if (company?.id) {
        if (!by_company[company.id]) by_company[company.id] = { name: company.name, id: company.id, total: 0 };
        by_company[company.id].total += amount;
      }
    }

    // Calculate allocated expenses per commission (at the finest grain)
    if (total_commissions > 0) {
      for (const c of commissions) {
        const country = c.invoice_commission?.invoice?.client?.country || 'N/D';
        const company_id = c.invoice_commission?.invoice?.company_id;
        const key = `${company_id}:${country}`;
        const share = Number(c.amount) / total_commissions;
        const allocated = total_expenses * share;
        commission_allocation.set(key, (commission_allocation.get(key) || 0) + allocated);
      }
    }

    // Convert by_country to array format and calculate allocated expenses
    const by_country_array = Object.entries(by_country).map(([country, total]) => ({
      country,
      total_commission: total,
      allocated_expense: total_commissions > 0 ? (total / total_commissions) * total_expenses : 0,
    }));

    // Convert by_company to array format and calculate allocated expenses
    const by_company_array = Object.entries(by_company).map(([company_id, data]) => ({
      company_id,
      company_name: data.name,
      total_commission: data.total,
      allocated_expense: total_commissions > 0 ? (data.total / total_commissions) * total_expenses : 0,
    }));

    return {
      total_expenses,
      total_allocated_expense: total_commissions > 0 ? total_expenses : 0,
      by_country: by_country_array,
      by_company: by_company_array,
      commission_allocation, // Map for per-commission allocation
    };
  }

  // Calculate total expense allocation aggregated by company/country across all sub-agents
  async getExpenseAllocationByCompanyCountry(filters?: { company_id?: string; company_ids?: string[]; country?: string; start_date?: string; end_date?: string }) {
    const applyFilters = (qb: any, invAlias = 'inv') => {
      if (filters?.company_id && filters.company_id !== 'undefined') qb.andWhere(`${invAlias}.company_id = :cid`, { cid: filters.company_id });
      if (filters?.company_ids && filters.company_ids.length > 0) qb.andWhere(`${invAlias}.company_id IN (:...cids)`, { cids: filters.company_ids });
      if (filters?.country && filters.country !== 'undefined') qb.andWhere('cl.country = :country', { country: filters.country });
      if (filters?.start_date && filters.start_date !== 'undefined') qb.andWhere(`${invAlias}.invoice_date >= :sd`, { sd: filters.start_date });
      if (filters?.end_date && filters.end_date !== 'undefined') qb.andWhere(`${invAlias}.invoice_date <= :ed`, { ed: filters.end_date });
    };

    // Fetch all sub-agent expenses within the date range
    const expenseQb = AppDataSource.getRepository('sub_agent_expense')
      .createQueryBuilder('se');

    if (filters?.start_date && filters.start_date !== 'undefined') expenseQb.andWhere('se.expense_date >= :sd', { sd: filters.start_date });
    if (filters?.end_date && filters.end_date !== 'undefined') expenseQb.andWhere('se.expense_date <= :ed', { ed: filters.end_date });

    const expenses = await expenseQb.getMany() as any[];
    const total_expenses = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    // Fetch all sub-agent commissions with company/country info
    const commissionQb = this.subCommissionRepo.createQueryBuilder('sac')
      .leftJoinAndSelect('sac.invoice_commission', 'ic')
      .leftJoinAndSelect('ic.invoice', 'inv')
      .leftJoinAndSelect('inv.company', 'c')
      .leftJoinAndSelect('inv.client', 'cl')
      .where('inv.status = :s', { s: 'processed' });

    applyFilters(commissionQb);
    const commissions = await commissionQb.getMany();
    const total_commissions = commissions.reduce((sum, c) => sum + Number(c.amount || 0), 0);

    // Group commissions by country and company
    const by_country: Record<string, number> = {};
    const by_company: Record<string, { name: string; id: string; total: number }> = {};

    for (const c of commissions) {
      const country = c.invoice_commission?.invoice?.client?.country || 'N/D';
      const company = c.invoice_commission?.invoice?.company;
      const amount = Number(c.amount || 0);

      by_country[country] = (by_country[country] || 0) + amount;
      if (company?.id) {
        if (!by_company[company.id]) by_company[company.id] = { name: company.name, id: company.id, total: 0 };
        by_company[company.id].total += amount;
      }
    }

    // Convert by_country to array format and calculate allocated expenses
    const by_country_array = Object.entries(by_country).map(([country, total]) => ({
      country,
      total_commission: total,
      allocated_expense: total_commissions > 0 ? (total / total_commissions) * total_expenses : 0,
    }));

    // Convert by_company to array format and calculate allocated expenses
    const by_company_array = Object.entries(by_company).map(([company_id, data]) => ({
      company_id,
      company_name: data.name,
      total_commission: data.total,
      allocated_expense: total_commissions > 0 ? (data.total / total_commissions) * total_expenses : 0,
    }));

    return {
      total_expenses,
      total_allocated_expense: total_commissions > 0 ? total_expenses : 0,
      by_country: by_country_array,
      by_company: by_company_array,
    };
  }

  // ─── Sub-Agent Expenses ─────────────────────────────────

  async getSubAgentExpenses(subAgentId: string) {
    return AppDataSource.getRepository('sub_agent_expense')
      .find({ where: { sub_agent_id: subAgentId }, order: { expense_date: 'DESC' } })
      .catch(() => []);
  }

  // ─── Batch Recalculate ─────────────────────────────────

  async recalculateAll(): Promise<number> {
    const invoices = await this.invoiceRepo.find({ where: { status: 'processed' as any } });
    let count = 0;
    for (const inv of invoices) {
      await this.calculateInvoiceCommission(inv.id);
      count++;
    }
    return count;
  }
}
