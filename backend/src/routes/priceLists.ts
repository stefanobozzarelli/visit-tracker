import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { MAX_UPLOAD_BYTES } from '../config/uploads';
import { PriceListService } from '../services/PriceListService';

const router = Router();
const service = new PriceListService();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

// Same access as invoices: master_admin, or admin with revenue access
router.use(authMiddleware);
router.use((req: Request, res: Response, next) => {
  const user = req.user as any;
  if (user?.role === 'master_admin') return next();
  if (user?.role === 'admin' && user?.can_view_revenue) return next();
  return res.status(403).json({ success: false, error: 'Revenue access not authorized' });
});

const parseJson = (v: any) => {
  if (!v) return undefined;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return undefined; }
};
const fail = (res: Response, error: unknown, status = 500) =>
  res.status(status).json({ success: false, error: (error as Error).message });

router.get('/', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await service.list(req.query.company_id as string | undefined) });
  } catch (e) { fail(res, e); }
});

router.get('/last-mapping', async (req: Request, res: Response) => {
  try {
    if (!req.query.company_id) return res.status(400).json({ success: false, error: 'company_id is required' });
    res.json({ success: true, data: await service.lastMapping(req.query.company_id as string) });
  } catch (e) { fail(res, e); }
});

// Reads the file and shows what would be imported; nothing is saved
router.post('/preview', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    const data = await service.preview(req.file, {
      sheet: req.body.sheet || undefined,
      mapping: parseJson(req.body.mapping),
      previous: parseJson(req.body.previous),
      companyId: req.body.company_id || undefined,
    });
    res.json({ success: true, data });
  } catch (e) { fail(res, e, 400); }
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    if (!req.body.company_id) return res.status(400).json({ success: false, error: 'company_id is required' });
    const data = await service.import(req.file, {
      companyId: req.body.company_id,
      name: req.body.name,
      validFrom: req.body.valid_from || null,
      currency: req.body.currency,
      notes: req.body.notes,
      mapping: parseJson(req.body.mapping),
      useAi: req.body.use_ai === 'true' || req.body.use_ai === true,
      userId: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    console.error('[PRICELIST IMPORT]', e);
    fail(res, e);
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const pl = await service.get(req.params.id);
    if (!pl) return res.status(404).json({ success: false, error: 'Price list not found' });
    res.json({ success: true, data: pl });
  } catch (e) { fail(res, e); }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await service.update(req.params.id, req.body || {}) });
  } catch (e) { fail(res, e); }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await service.remove(req.params.id);
    res.json({ success: true });
  } catch (e) { fail(res, e); }
});

router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: { url: await service.downloadUrl(req.params.id) } });
  } catch (e) { fail(res, e); }
});

export default router;
