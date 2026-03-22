import { Router, Request, Response } from 'express';
import { CompanyVisitService } from '../services/CompanyVisitService';
import { S3Service } from '../services/S3Service';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';

const router = Router();
const visitService = new CompanyVisitService();
const s3Service = new S3Service();
const pdfService = new PdfService();
const excelService = new ExcelService();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/company-visits/export-pdf
 * Export filtered company visits to PDF
 */
router.post('/export-pdf', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { company_id, status, startDate, endDate } = req.body;
    const filters: any = {};
    if (company_id) filters.company_id = company_id;
    if (status) filters.status = status;
    let visits = await visitService.getVisits(filters);
    if (startDate) visits = visits.filter((v: any) => new Date(v.date) >= new Date(startDate));
    if (endDate) visits = visits.filter((v: any) => new Date(v.date) <= new Date(endDate));
    const buffer = await pdfService.generateCompanyVisitsPdf(visits, { title: 'Company Visits Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=company-visits-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/company-visits/export-excel
 * Export filtered company visits to Excel
 */
router.post('/export-excel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { company_id, status, startDate, endDate } = req.body;
    const filters: any = {};
    if (company_id) filters.company_id = company_id;
    if (status) filters.status = status;
    let visits = await visitService.getVisits(filters);
    if (startDate) visits = visits.filter((v: any) => new Date(v.date) >= new Date(startDate));
    if (endDate) visits = visits.filter((v: any) => new Date(v.date) <= new Date(endDate));
    const buffer = excelService.generateCompanyVisitsExcel(visits);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=company-visits-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/company-visits
 * Create a new company visit
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { companyId, date, subject, report, participantsUserIds, participantsExternal, status } = req.body;
    const createdByUserId = (req.user as any).id;

    if (!companyId || !date || !subject) {
      return res.status(400).json({
        success: false,
        error: 'companyId, date, and subject are required',
      });
    }

    const visit = await visitService.createVisit({
      company_id: companyId,
      date: new Date(date),
      subject,
      report: report || null,
      participants_user_ids: Array.isArray(participantsUserIds) && participantsUserIds.length > 0 ? JSON.stringify(participantsUserIds) : null,
      participants_external: participantsExternal || null,
      status: status || 'scheduled',
      created_by_user_id: createdByUserId,
    });

    res.status(201).json({ success: true, data: visit });
  } catch (error) {
    console.error('Error creating company visit:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/company-visits
 * Get all company visits (with optional filters)
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { companyId, status } = req.query;

    const visits = await visitService.getVisits({
      company_id: companyId as string,
      status: status as string,
    });

    res.json({ success: true, data: visits });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/company-visits/:id
 * Get single company visit
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Company visit not found' });
    }
    res.json({ success: true, data: visit });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/company-visits/:id
 * Update company visit
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Company visit not found' });
    }

    const { companyId, date, subject, report, participantsUserIds, participantsExternal, status } = req.body;
    const updateData: any = {};

    if (companyId) updateData.company_id = companyId;
    if (date) updateData.date = new Date(date);
    if (subject !== undefined) updateData.subject = subject;
    if (report !== undefined) updateData.report = report;
    if (participantsUserIds !== undefined) updateData.participants_user_ids = JSON.stringify(participantsUserIds);
    if (participantsExternal !== undefined) updateData.participants_external = participantsExternal;
    if (status) updateData.status = status;

    const updated = await visitService.updateVisit(req.params.id, updateData);
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/company-visits/:id
 * Delete company visit
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Company visit not found' });
    }

    const userRole = (req.user as any).role;
    const userId = (req.user as any).id;
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager' && visit.created_by_user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    await visitService.deleteVisit(req.params.id);
    res.json({ success: true, message: 'Company visit deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/company-visits/:id/attachments
 * Upload attachment
 */
router.post('/:id/attachments', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const visit = await visitService.getVisitById(id);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Company visit not found' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const { v4: uuidv4 } = require('uuid');
    const s3Key = `company-visit-attachments/${uuidv4()}.${filename.split('.').pop()}`;

    const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
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

    const attachment = await visitService.addAttachment(id, userId, filename, fileSize, s3Key);

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
 * GET /api/company-visits/:id/attachments
 * List attachments
 */
router.get('/:id/attachments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachments = await visitService.getAttachments(req.params.id);
    res.json({ success: true, data: attachments });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/company-visits/:id/attachments/:attachmentId/download
 * Get presigned download URL
 */
router.get('/:id/attachments/:attachmentId/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getAttachment(req.params.attachmentId);
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
 * DELETE /api/company-visits/:id/attachments/:attachmentId
 * Delete attachment
 */
router.delete('/:id/attachments/:attachmentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Company visit not found' });
    }

    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager' && visit.created_by_user_id !== userId) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const attachment = await visitService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await visitService.deleteAttachment(req.params.attachmentId);

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
