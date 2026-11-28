import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { expandCompanyGroups } from '../middleware/companyGroups';
import { ArticleService, SalesFilters } from '../services/ArticleService';

const router = Router();
const service = new ArticleService();

// Same access as invoices: master_admin, or admin with revenue access
router.use(authMiddleware);
router.use(expandCompanyGroups(['/', '/summary', '/unmatched']));
router.use((req: Request, res: Response, next) => {
  const user = req.user as any;
  if (user?.role === 'master_admin') return next();
  if (user?.role === 'admin' && user?.can_view_revenue) return next();
  return res.status(403).json({ success: false, error: 'Revenue access not authorized' });
});

const isDay = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const filters = (req: Request): SalesFilters => ({
  company_id: (req.query.company_id as string) || undefined,
  company_ids: req.query.company_ids ? String(req.query.company_ids).split(',').filter(Boolean) : undefined,
  client_id: (req.query.client_id as string) || undefined,
  start_date: isDay(req.query.start_date) ? (req.query.start_date as string) : undefined,
  end_date: isDay(req.query.end_date) ? (req.query.end_date as string) : undefined,
});
const fail = (res: Response, error: unknown, status = 500) =>
  res.status(status).json({ success: false, error: (error as Error).message });

router.get('/', async (req: Request, res: Response) => {
  try {
    const data = await service.listArticles({
      ...filters(req),
      search: req.query.search as string,
      code_search: req.query.code as string,
      description_search: req.query.description as string,
      only_sold: req.query.only_sold === 'true',
      sort: req.query.sort as string,
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 50,
    });
    res.json({ success: true, data });
  } catch (e) { fail(res, e); }
});

router.get('/summary', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await service.summary(filters(req)) }); } catch (e) { fail(res, e); }
});

router.get('/unmatched', async (req: Request, res: Response) => {
  try { res.json({ success: true, data: await service.unmatchedCodes(filters(req)) }); } catch (e) { fail(res, e); }
});

// Links a code written on invoices to an article of the price list
router.post('/link-code', async (req: Request, res: Response) => {
  try {
    const { company_id, code, article_id } = req.body || {};
    if (!company_id || !code || !article_id) return res.status(400).json({ success: false, error: 'company_id, code and article_id are required' });
    res.json({ success: true, data: await service.linkCode(company_id, code, article_id) });
  } catch (e) { fail(res, e, 400); }
});

// Creates an article that is not in the price lists (e.g. an old version) from a code on invoices
router.post('/manual', async (req: Request, res: Response) => {
  try {
    const { company_id, code, description, unit, discontinued, replaced_by_id } = req.body || {};
    if (!company_id || !code) return res.status(400).json({ success: false, error: 'company_id and code are required' });
    res.json({ success: true, data: await service.createManualArticle({ company_id, code, description, unit, discontinued, replaced_by_id }) });
  } catch (e) { fail(res, e, 400); }
});

// Re-runs the matching for all invoice lines of a company (or of all companies)
router.post('/rematch', async (req: Request, res: Response) => {
  try {
    const companyId = req.body?.company_id;
    if (!companyId) return res.status(400).json({ success: false, error: 'company_id is required' });
    res.json({ success: true, data: await service.matchLineItems({ companyId }) });
  } catch (e) { fail(res, e); }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const data = await service.getArticleDetail(req.params.id, filters(req));
    if (!data) return res.status(404).json({ success: false, error: 'Article not found' });
    res.json({ success: true, data });
  } catch (e) { fail(res, e); }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { discontinued, replaced_by_id } = req.body || {};
    await service.updateStatus(req.params.id, { discontinued, replaced_by_id });
    res.json({ success: true });
  } catch (e) { fail(res, e, 400); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await service.deleteManualArticle(req.params.id);
    res.json({ success: true });
  } catch (e) { fail(res, e, 400); }
});

router.delete('/:id/aliases/:code', async (req: Request, res: Response) => {
  try {
    await service.unlinkCode(req.params.id, req.params.code);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

export default router;
