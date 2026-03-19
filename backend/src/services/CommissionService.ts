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
    // 1. Client-specific rate
    if (clientId && country) {
      const clientRate = await this.rateRepo.findOne({
        where: { company_id: companyId, country, client_id: clientId },
      });
      if (clientRate) return Number(clientRate.rate_percent);
    }

    // 2. Country-specific rate
    if (country) {
      const countryRate = await this.rateRepo.findOne({
        where: { company_id: companyId, country, client_id: undefined as any },
      });
      // TypeORM: need IS NULL check
      const countryRateQ = await this.rateRepo
        .createQueryBuilder('r')
        .where('r.company_id = :companyId', { companyId })
        .andWhere('r.country = :country', { country })
        .andWhere('r.client_id IS NULL')
        .getOne();
      if (countryRateQ) return Number(countryRateQ.rate_percent);
    }

    // 3. Company default rate
    const defaultRate = await this.rateRepo
      .createQueryBuilder('r')
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
      // Priority: client > country > default
      let best: SubAgentCommissionRate | null = null;
      if (clientId && country) {
        best = rates.find(r => r.client_id === clientId && r.country === country) || null;
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

    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId } });
    if (!invoice) return null;

    if (data.manual_amount !== undefined) {
      commission.manual_override = true;
      commission.manual_amount = data.manual_amount;
      // Net commission recalculated with manual amount
      const subTotal = await this.subCommissionRepo
        .createQueryBuilder('sac')
        .where('sac.invoice_commission_id = :id', { id: commission.id })
        .select('SUM(sac.amount)', 'total')
        .getRawOne();
      commission.net_commission = data.manual_amount - (Number(subTotal?.total) || 0);
    } else if (data.rate_percent !== undefined) {
      commission.commission_rate_percent = data.rate_percent;
      commission.gross_commission = Math.round(Number(invoice.total_amount) * data.rate_percent) / 100;
      commission.manual_override = true;
      commission.manual_amount = commission.gross_commission;
      // Recalculate sub-agents and net
      const subTotal = await this.subCommissionRepo
        .createQueryBuilder('sac')
        .where('sac.invoice_commission_id = :id', { id: commission.id })
        .select('SUM(sac.amount)', 'total')
        .getRawOne();
      commission.net_commission = commission.gross_commission - (Number(subTotal?.total) || 0);
    }

    return this.commissionRepo.save(commission);
  }

  async updateCommissionStatus(invoiceId: string, status: string): Promise<InvoiceCommission | null> {
    const commission = await this.commissionRepo.findOne({ where: { invoice_id: invoiceId } });
    if (!commission) return null;
    commission.commission_status = status;
    return this.commissionRepo.save(commission);
  }

  // ─── Stats ─────────────────────────────────────────────

  async getCommissionStats(filters?: { company_id?: string; start_date?: string; end_date?: string }): Promise<any> {
    let baseQ = this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .where('inv.status = :s', { s: 'processed' });

    if (filters?.company_id) baseQ.andWhere('inv.company_id = :cid', { cid: filters.company_id });
    if (filters?.start_date) baseQ.andWhere('inv.invoice_date >= :sd', { sd: filters.start_date });
    if (filters?.end_date) baseQ.andWhere('inv.invoice_date <= :ed', { ed: filters.end_date });

    const totals = await baseQ
      .select('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .addSelect('COUNT(ic.id)', 'count')
      .getRawOne();

    const byStatus = await this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .where('inv.status = :s', { s: 'processed' })
      .select('ic.commission_status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .groupBy('ic.commission_status')
      .getRawMany();

    const byCompany = await this.commissionRepo.createQueryBuilder('ic')
      .leftJoin('ic.invoice', 'inv')
      .leftJoin('inv.company', 'c')
      .where('inv.status = :s', { s: 'processed' })
      .select('c.name', 'company_name')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(ic.gross_commission)', 'total_gross')
      .addSelect('SUM(ic.net_commission)', 'total_net')
      .groupBy('c.name')
      .orderBy('SUM(ic.gross_commission)', 'DESC')
      .getRawMany();

    const subAgentTotals = await this.subCommissionRepo.createQueryBuilder('sac')
      .leftJoin('sac.sub_agent', 'sa')
      .select('sa.name', 'sub_agent_name')
      .addSelect('SUM(sac.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .groupBy('sa.name')
      .orderBy('SUM(sac.amount)', 'DESC')
      .getRawMany();

    return {
      total_gross: Number(totals?.total_gross) || 0,
      total_net: Number(totals?.total_net) || 0,
      total_sub_agents: (Number(totals?.total_gross) || 0) - (Number(totals?.total_net) || 0),
      count: Number(totals?.count) || 0,
      by_status: byStatus,
      by_company: byCompany,
      sub_agent_totals: subAgentTotals,
    };
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
