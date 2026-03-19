import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { CommissionService } from '../services/CommissionService';

const router = Router();
const commissionService = new CommissionService();

// Auth: master_admin or admin with can_view_revenue
router.use(authMiddleware);
router.use((req: Request, res: Response, next) => {
  const user = req.user as any;
  if (user?.role === 'master_admin') return next();
  if (user?.role === 'admin' && user?.can_view_revenue) return next();
  return res.status(403).json({ success: false, error: 'Accesso non autorizzato' });
});

// ─── Commission Rates ────────────────────────────────────

router.get('/rates', async (req: Request, res: Response) => {
  try {
    const rates = await commissionService.getCommissionRates(req.query.company_id as string);
    res.json({ success: true, data: rates });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.post('/rates', async (req: Request, res: Response) => {
  try {
    const rate = await commissionService.upsertCommissionRate(req.body);
    res.json({ success: true, data: rate });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.delete('/rates/:id', async (req: Request, res: Response) => {
  try {
    await commissionService.deleteCommissionRate(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

// ─── Sub-Agents ──────────────────────────────────────────

router.get('/sub-agents', async (req: Request, res: Response) => {
  try {
    const agents = await commissionService.getSubAgents();
    res.json({ success: true, data: agents });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.post('/sub-agents', async (req: Request, res: Response) => {
  try {
    const agent = await commissionService.createSubAgent(req.body);
    res.json({ success: true, data: agent });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.put('/sub-agents/:id', async (req: Request, res: Response) => {
  try {
    const agent = await commissionService.updateSubAgent(req.params.id, req.body);
    res.json({ success: true, data: agent });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.delete('/sub-agents/:id', async (req: Request, res: Response) => {
  try {
    await commissionService.deleteSubAgent(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

// Sub-Agent Rates
router.get('/sub-agents/:id/rates', async (req: Request, res: Response) => {
  try {
    const rates = await commissionService.getSubAgentRates(req.params.id);
    res.json({ success: true, data: rates });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.post('/sub-agents/:id/rates', async (req: Request, res: Response) => {
  try {
    const rate = await commissionService.upsertSubAgentRate({ ...req.body, sub_agent_id: req.params.id });
    res.json({ success: true, data: rate });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.delete('/sub-agents/rates/:rateId', async (req: Request, res: Response) => {
  try {
    await commissionService.deleteSubAgentRate(req.params.rateId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

// ─── Invoice Commissions ─────────────────────────────────

router.get('/invoices', async (req: Request, res: Response) => {
  try {
    const commissions = await commissionService.getInvoiceCommissions({
      company_id: req.query.company_id as string,
      client_id: req.query.client_id as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
    });
    res.json({ success: true, data: commissions });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.get('/invoices/:invoiceId', async (req: Request, res: Response) => {
  try {
    const commission = await commissionService.getInvoiceCommission(req.params.invoiceId);
    res.json({ success: true, data: commission });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.put('/invoices/:invoiceId/override', async (req: Request, res: Response) => {
  try {
    const commission = await commissionService.overrideCommission(req.params.invoiceId, req.body);
    res.json({ success: true, data: commission });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.put('/invoices/:invoiceId/status', async (req: Request, res: Response) => {
  try {
    const commission = await commissionService.updateCommissionStatus(req.params.invoiceId, req.body.status);
    res.json({ success: true, data: commission });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.post('/invoices/:invoiceId/recalculate', async (req: Request, res: Response) => {
  try {
    const commission = await commissionService.calculateInvoiceCommission(req.params.invoiceId);
    res.json({ success: true, data: commission });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.post('/recalculate-all', async (req: Request, res: Response) => {
  try {
    const count = await commissionService.recalculateAll();
    res.json({ success: true, data: { recalculated: count } });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

// ─── Stats ───────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const companyIds = req.query.company_ids ? (req.query.company_ids as string).split(',') : undefined;
    const stats = await commissionService.getCommissionStats({
      company_id: req.query.company_id as string,
      company_ids: companyIds,
      country: req.query.country as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      status: req.query.status as string,
    });
    res.json({ success: true, data: stats });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

// ─── Sub-Agent Detail ─────────────────────────────────

router.get('/sub-agents/:subAgentId/commissions', async (req: Request, res: Response) => {
  try {
    const result = await commissionService.getSubAgentCommissions(req.params.subAgentId, {
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
    });
    res.json({ success: true, data: result });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

// ─── Sub-Agent Expenses ─────────────────────────────────

router.get('/sub-agents/:subAgentId/expenses', async (req: Request, res: Response) => {
  try {
    const { SubAgentExpense } = require('../entities/SubAgentExpense');
    const { AppDataSource } = require('../config/database');
    const repo = AppDataSource.getRepository(SubAgentExpense);
    const expenses = await repo.find({
      where: { sub_agent_id: req.params.subAgentId },
      order: { expense_date: 'DESC' },
    });
    res.json({ success: true, data: expenses });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.post('/sub-agents/:subAgentId/expenses', async (req: Request, res: Response) => {
  try {
    const { SubAgentExpense } = require('../entities/SubAgentExpense');
    const { AppDataSource } = require('../config/database');
    const repo = AppDataSource.getRepository(SubAgentExpense);
    const expense = repo.create({
      sub_agent_id: req.params.subAgentId,
      expense_date: req.body.expense_date,
      expense_type: req.body.expense_type,
      amount: req.body.amount,
      notes: req.body.notes || null,
    });
    await repo.save(expense);
    res.json({ success: true, data: expense });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

router.delete('/sub-agents/:subAgentId/expenses/:expenseId', async (req: Request, res: Response) => {
  try {
    const { SubAgentExpense } = require('../entities/SubAgentExpense');
    const { AppDataSource } = require('../config/database');
    const repo = AppDataSource.getRepository(SubAgentExpense);
    await repo.delete(req.params.expenseId);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: (e as Error).message }); }
});

export default router;
