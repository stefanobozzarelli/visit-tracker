import { Router, Request, Response } from 'express';
import { OfferService } from '../services/OfferService';
import { S3Service } from '../services/S3Service';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = Router();
const offerService = new OfferService();
const s3Service = new S3Service();
const pdfService = new PdfService();
const excelService = new ExcelService();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Export endpoints (must be before /:id routes) ───────────────────────────

/**
 * POST /api/offers/export-pdf
 * Export filtered offers to PDF
 */
router.post('/export-pdf', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, company_id, status } = req.body;
    const filters: any = {};
    if (client_id) filters.client_id = client_id;
    if (company_id) filters.company_id = company_id;
    if (status) filters.status = status;

    const offers = await offerService.getOffers(filters);
    const buffer = await (pdfService as any).generateOffersPdf(offers, { title: 'Offers Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=offers-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/offers/export-excel
 * Export filtered offers to Excel
 */
router.post('/export-excel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, company_id, status } = req.body;
    const filters: any = {};
    if (client_id) filters.client_id = client_id;
    if (company_id) filters.company_id = company_id;
    if (status) filters.status = status;

    const offers = await offerService.getOffers(filters);
    const buffer = (excelService as any).generateOffersExcel(offers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=offers-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── CRUD ────────────────────────────────────────────────────────────────────

/**
 * POST /api/offers
 * Create a new offer
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, company_id, visit_id, company_visit_id, offer_date, valid_until, status, currency, notes } = req.body;
    const created_by_user_id = (req.user as any).id;

    const offer = await offerService.createOffer({
      client_id,
      company_id,
      visit_id,
      company_visit_id,
      offer_date: offer_date ? new Date(offer_date) : new Date(),
      valid_until: valid_until ? new Date(valid_until) : undefined,
      status,
      currency,
      notes,
      created_by_user_id,
    });

    res.status(201).json({ success: true, data: offer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/offers
 * List offers with optional filters
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { client_id, company_id, status } = req.query;
    const offers = await offerService.getOffers({
      client_id: client_id as string,
      company_id: company_id as string,
      status: status as string,
    });
    res.json({ success: true, data: offers });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/offers/:id
 * Get offer by id
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const offer = await offerService.getOfferById(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }
    res.json({ success: true, data: offer });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/offers/:id
 * Update offer
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const offer = await offerService.getOfferById(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    const updateData: any = {};
    const fields = ['client_id', 'company_id', 'visit_id', 'company_visit_id', 'status', 'currency', 'notes'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });
    if (req.body.offer_date) updateData.offer_date = new Date(req.body.offer_date);
    if (req.body.valid_until) updateData.valid_until = new Date(req.body.valid_until);

    const updated = await offerService.updateOffer(req.params.id, updateData);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/offers/:id
 * Delete offer
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const offer = await offerService.getOfferById(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }
    await offerService.deleteOffer(req.params.id);
    res.json({ success: true, message: 'Offer deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Items ───────────────────────────────────────────────────────────────────

/**
 * POST /api/offers/:id/items
 * Add item to offer
 */
router.post('/:id/items', authMiddleware, async (req: Request, res: Response) => {
  try {
    const offer = await offerService.getOfferById(req.params.id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    const {
      serie, articolo, finitura, formato, spessore_mm,
      prezzo_unitario, unita_misura, quantita, total_amount,
      data, tipo_offerta, promozionale, numero_progetto,
      progetto_nome, fase_progetto, sviluppo_progetto,
      project_id, consegna_prevista, note
    } = req.body;

    const item = await offerService.addItem(req.params.id, {
      serie, articolo, finitura, formato, spessore_mm,
      prezzo_unitario, unita_misura, quantita, total_amount,
      data: data ? new Date(data) : undefined,
      tipo_offerta, promozionale, numero_progetto,
      progetto_nome, fase_progetto, sviluppo_progetto,
      project_id,
      consegna_prevista: consegna_prevista ? new Date(consegna_prevista) : undefined,
      note,
    });

    await offerService.recalculateTotal(req.params.id);

    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/offers/:id/items/:itemId
 * Update item
 */
router.put('/:id/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const updateData: any = {};
    const fields = [
      'serie', 'articolo', 'finitura', 'formato', 'spessore_mm',
      'prezzo_unitario', 'unita_misura', 'quantita', 'total_amount',
      'tipo_offerta', 'promozionale', 'numero_progetto',
      'progetto_nome', 'fase_progetto', 'sviluppo_progetto',
      'project_id', 'note'
    ];
    fields.forEach(f => {
      if (req.body[f] !== undefined) updateData[f] = req.body[f];
    });
    if (req.body.data) updateData.data = new Date(req.body.data);
    if (req.body.consegna_prevista) updateData.consegna_prevista = new Date(req.body.consegna_prevista);

    await offerService.updateItem(req.params.itemId, updateData);
    await offerService.recalculateTotal(req.params.id);

    res.json({ success: true, message: 'Item updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/offers/:id/items/:itemId
 * Delete item
 */
router.delete('/:id/items/:itemId', authMiddleware, async (req: Request, res: Response) => {
  try {
    await offerService.deleteItem(req.params.itemId);
    await offerService.recalculateTotal(req.params.id);
    res.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Offer Attachments ───────────────────────────────────────────────────────

/**
 * POST /api/offers/:id/attachments
 * Upload attachment to an offer
 */
router.post('/:id/attachments', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const offer = await offerService.getOfferById(id);
    if (!offer) {
      return res.status(404).json({ success: false, error: 'Offer not found' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const s3Key = `offer-attachments/${uuidv4()}.${filename.split('.').pop()}`;

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'visit-tracker-bucket',
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    }));

    const attachment = await offerService.addAttachment(id, {
      filename,
      file_size: fileSize,
      s3_key: s3Key,
      uploaded_by_user_id: userId,
    });

    res.json({
      success: true,
      data: {
        id: attachment.id,
        filename: attachment.filename,
        file_size: attachment.file_size,
        created_at: attachment.created_at,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/offers/:id/attachments/:attachmentId/download
 * Get presigned download URL for offer attachment
 */
router.get('/:id/attachments/:attachmentId/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachment = await offerService.getAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const downloadUrl = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url: downloadUrl, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/offers/:id/attachments/:attachmentId
 * Delete offer attachment
 */
router.delete('/:id/attachments/:attachmentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachment = await offerService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await offerService.deleteAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Item Attachments ────────────────────────────────────────────────────────

/**
 * POST /api/offers/:id/items/:itemId/attachments
 * Upload attachment to an offer item
 */
router.post('/:id/items/:itemId/attachments', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const s3Key = `offer-item-attachments/${uuidv4()}.${filename.split('.').pop()}`;

    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'visit-tracker-bucket',
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    }));

    const attachment = await offerService.addItemAttachment(itemId, {
      filename,
      file_size: fileSize,
      s3_key: s3Key,
      uploaded_by_user_id: userId,
    });

    res.json({
      success: true,
      data: {
        id: attachment.id,
        filename: attachment.filename,
        file_size: attachment.file_size,
        created_at: attachment.created_at,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/offers/:id/items/:itemId/attachments/:attachmentId/download
 * Get presigned download URL for item attachment
 */
router.get('/:id/items/:itemId/attachments/:attachmentId/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachment = await offerService.getItemAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const downloadUrl = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url: downloadUrl, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/offers/:id/items/:itemId/attachments/:attachmentId
 * Delete item attachment
 */
router.delete('/:id/items/:itemId/attachments/:attachmentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachment = await offerService.getItemAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await offerService.deleteItemAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Item attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
