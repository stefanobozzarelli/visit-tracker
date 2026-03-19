import { Router, Request, Response } from 'express';
import { authMiddleware, roleMiddleware } from '../middleware/auth';
import { InvoiceService } from '../services/InvoiceService';
import multer from 'multer';

const router = Router();
const invoiceService = new InvoiceService();
const upload = multer({ storage: multer.memoryStorage() });

// All routes require auth + revenue access (master_admin or admin with can_view_revenue)
router.use(authMiddleware);
router.use((req: Request, res: Response, next) => {
  const user = req.user as any;
  if (user?.role === 'master_admin') return next();
  if (user?.role === 'admin' && user?.can_view_revenue) return next();
  return res.status(403).json({ success: false, error: 'Revenue access not authorized' });
});

// Upload invoice PDF
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }
    if (!req.body.company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const invoice = await invoiceService.uploadAndProcess(
      req.file,
      req.body.company_id,
      req.body.client_id || null,
      req.user!.id
    );

    res.status(201).json({ success: true, data: invoice });
  } catch (error) {
    console.error('[INVOICE UPLOAD]', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// List invoices with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = {
      company_id: req.query.company_id as string,
      client_id: req.query.client_id as string,
      status: req.query.status as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    };
    const result = await invoiceService.getInvoices(filters);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const filters = {
      company_id: req.query.company_id as string,
      client_id: req.query.client_id as string,
      start_date: req.query.start_date as string,
      end_date: req.query.end_date as string,
    };
    const stats = await invoiceService.getStats(filters);
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// AI question
router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    if (!question) {
      return res.status(400).json({ success: false, error: 'question is required' });
    }
    const answer = await invoiceService.askQuestion(question);
    res.json({ success: true, data: { answer } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Get single invoice with line items
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.getInvoiceById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ success: false, error: 'Invoice not found' });
    }
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Delete invoice
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await invoiceService.deleteInvoice(req.params.id);
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Reprocess invoice
router.post('/:id/reprocess', async (req: Request, res: Response) => {
  try {
    const invoice = await invoiceService.reprocessInvoice(req.params.id);
    res.json({ success: true, data: invoice });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Download original PDF
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const url = await invoiceService.getDownloadUrl(req.params.id);
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
