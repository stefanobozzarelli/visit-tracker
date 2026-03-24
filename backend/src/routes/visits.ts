import { Router, Request, Response } from 'express';
import multer from 'multer';
import { VisitService } from '../services/VisitService';
import { PermissionService } from '../services/PermissionService';
import { S3Service } from '../services/S3Service';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { authMiddleware } from '../middleware/auth';
import { checkVisitPermission } from '../middleware/permissionMiddleware';
import { ApiResponse, CreateVisitRequest, CreateVisitReportRequest } from '../types';

const router = Router();
const visitService = new VisitService();
const permissionService = new PermissionService();
const s3Service = new S3Service();
const pdfService = new PdfService();
const excelService = new ExcelService();

// Helper function to generate S3 presigned URL
async function generateS3Url(s3Key: string, filename: string, forceDownload: boolean = false) {
  const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'eu-north-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  const s3Command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET || 'visit-tracker-bucket',
    Key: s3Key,
    ...(forceDownload && { ResponseContentDisposition: `attachment; filename="${filename}"` }),
  });

  return await getSignedUrl(s3Client, s3Command, { expiresIn: 3600 });
}

// Public preview endpoint (opens file in browser - no auth required)
router.get('/:visitId/reports/:reportId/attachments/:attachmentId/preview', async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const previewUrl = await generateS3Url(attachment.s3_key, attachment.filename, false);
    res.redirect(previewUrl);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Public download endpoint (forces download - no auth required)
router.get('/:visitId/reports/:reportId/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    const downloadUrl = await generateS3Url(attachment.s3_key, attachment.filename, true);
    res.redirect(downloadUrl);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateVisitRequest = req.body;
    const visit = await visitService.createVisit(req.user!.id, data);
    const response: ApiResponse<any> = { success: true, data: visit };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post('/export-excel', async (req: Request, res: Response) => {
  try {
    const { clientId, userId, startDate, endDate, status } = req.body;
    const filters: any = {};
    if (clientId) filters.client_id = clientId;
    if (userId) filters.user_id = userId;
    if (status) filters.status = status;
    let visits = await visitService.getVisits(filters);
    if (startDate) visits = visits.filter((v: any) => new Date(v.visit_date) >= new Date(startDate));
    if (endDate) visits = visits.filter((v: any) => new Date(v.visit_date) <= new Date(endDate));
    const buffer = excelService.generateVisitsExcel(visits);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=visits-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const filters = {
      client_id: req.query.client_id as string,
      user_id: req.query.user_id as string,
      status: req.query.status as string,
    };

    let visits = await visitService.getVisits(filters);

    // Filter visits for sales_rep, admin/manager sees all
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);

      // If no access to '*' (all), filter for only assigned clients
      if (!visibleClientIds.includes('*')) {
        visits = visits.filter(visit => visibleClientIds.includes(visit.client_id));
      }
    }

    const response: ApiResponse<any> = { success: true, data: visits };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// More specific routes BEFORE generic :id routes
router.get('/:id/can-delete', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const visitId = req.params.id;

    // Check access permission to visit
    const visit = await visitService.getVisitById(visitId);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Visit not found' });
    }

    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && !visibleClientIds.includes(visit.client_id)) {
        return res.status(403).json({ success: false, error: 'Access denied to this visit' });
      }
    }

    const result = await visitService.canDeleteVisit(visitId);
    const response: ApiResponse<any> = { success: true, data: result };
    res.json(response);
  } catch (error) {
    res.status(404).json({ success: false, error: (error as Error).message });
  }
});

// Generic :id routes AFTER specific routes
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, error: 'Visit not found' });

    // Check access permission
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && !visibleClientIds.includes(visit.client_id)) {
        return res.status(403).json({ success: false, error: 'Access denied to this visit' });
      }
    }

    const response: ApiResponse<any> = { success: true, data: visit };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, error: 'Visit not found' });

    // Check access permission
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && !visibleClientIds.includes(visit.client_id)) {
        return res.status(403).json({ success: false, error: 'Access denied to this visit' });
      }
    }

    await visitService.deleteVisit(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Visit deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Update visit (status, preparation, etc.)
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) return res.status(404).json({ success: false, error: 'Visit not found' });

    const { status, preparation, visit_date } = req.body;
    const updateData: any = {};

    if (status !== undefined) updateData.status = status;
    if (preparation !== undefined) updateData.preparation = preparation || null;
    if (visit_date) updateData.visit_date = new Date(visit_date);

    const updated = await visitService.updateVisit(req.params.id, updateData);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('Error updating visit:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:visitId/reports', async (req: Request, res: Response) => {
  try {
    const data: CreateVisitReportRequest = req.body;
    const report = await visitService.addReport(req.params.visitId, data);
    const response: ApiResponse<any> = { success: true, data: report };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:visitId/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const data: Partial<CreateVisitReportRequest> = req.body;
    const report = await visitService.updateReport(req.params.reportId, data);
    const response: ApiResponse<any> = { success: true, data: report };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:visitId/reports/:reportId', async (req: Request, res: Response) => {
  try {
    await visitService.deleteReport(req.params.reportId);
    const response: ApiResponse<any> = { success: true, message: 'Report deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

const upload = multer({ storage: multer.memoryStorage() });

router.post('/:visitId/reports/:reportId/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    console.log(`[UPLOAD] Uploading file: ${filename} (${fileSize} bytes, ${contentType})`);

    // Upload directly to S3
    const { v4: uuidv4 } = require('uuid');
    const s3Key = `uploads/${uuidv4()}.${filename.split('.').pop()}`;

    const { PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
    const s3Client = new S3Client({
      region: process.env.AWS_REGION || 'eu-north-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
      },
    });

    const s3Command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET || 'visit-tracker-bucket',
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await s3Client.send(s3Command);
    console.log(`[UPLOAD] File uploaded to S3: ${s3Key}`);

    // Save attachment metadata AFTER successful S3 upload
    const attachment = await visitService.addAttachment(
      req.params.reportId,
      req.user!.id,
      filename,
      fileSize,
      s3Key
    );

    const response: ApiResponse<any> = {
      success: true,
      data: {
        attachmentId: attachment.id,
        filename: attachment.filename,
        file_size: attachment.file_size,
      },
    };
    res.json(response);
  } catch (error) {
    console.error(`[UPLOAD ERROR] ${(error as Error).message}`);
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:visitId/reports/:reportId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await visitService.deleteAttachment(req.params.attachmentId);
    const response: ApiResponse<any> = { success: true, message: 'Attachment deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// --- Visit Direct Attachments ---

router.post('/:visitId/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { visitId } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const visit = await visitService.getVisitById(visitId);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Visit not found' });
    }

    const userId = req.user!.id;
    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const { v4: uuidv4 } = require('uuid');
    const s3Key = `visit-direct-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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

    const attachment = await visitService.addDirectAttachment(visitId, userId, filename, fileSize, s3Key);

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
    console.error('[UPLOAD ERROR] Visit direct attachment:', error);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:visitId/attachments', async (req: Request, res: Response) => {
  try {
    const attachments = await visitService.getDirectAttachments(req.params.visitId);
    res.json({ success: true, data: attachments });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:visitId/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getDirectAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }
    const downloadUrl = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url: downloadUrl, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:visitId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getDirectAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await visitService.deleteDirectAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// PDF Export endpoints
router.get('/:id/export-pdf', async (req: Request, res: Response) => {
  try {
    const visit = await visitService.getVisitById(req.params.id);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Visita non trovata' });
    }

    const pdfBuffer = await pdfService.generateVisitPdf(visit);
    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="visita-${visit.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Advanced PDF export with filters
router.post('/export-pdf', async (req: Request, res: Response) => {
  try {
    const authUserId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const { startDate, endDate, clientId, companyIds, companyId, userId } = req.body;
    const effectiveCompanyIds = companyIds || (companyId ? [companyId] : null);

    // Get visits based on filters
    let visits = await visitService.getVisits({
      client_id: clientId,
      user_id: userId,
    });

    // Filter visits by permissions (if not admin/manager)
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(authUserId);
      if (!visibleClientIds.includes('*')) {
        visits = visits.filter(v => visibleClientIds.includes(v.client_id));
      }
    }

    // Filter by date range if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date('1900-01-01');
      const end = endDate ? new Date(endDate) : new Date('2099-12-31');

      visits = visits.filter(
        v => new Date(v.visit_date) >= start && new Date(v.visit_date) <= end
      );
    }

    // Filter by companies if provided (accepts array or single value for backward compatibility)
    if (effectiveCompanyIds && (Array.isArray(effectiveCompanyIds) ? effectiveCompanyIds.length > 0 : effectiveCompanyIds)) {
      const companyIdArray = Array.isArray(effectiveCompanyIds) ? effectiveCompanyIds : [effectiveCompanyIds];
      visits = visits.map(v => ({
        ...v,
        reports: v.reports?.filter(r => companyIdArray.includes(r.company_id)) || [],
      })) as any;
      // Remove visits without reports (after company filtering)
      visits = visits.filter(v => v.reports && v.reports.length > 0);
    }

    if (visits.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nessuna visita trovata con i filtri specificati',
      });
    }

    const pdfBuffer = await pdfService.generateVisitsPdf(visits, {
      title: 'Report Visite',
      generatedAt: new Date(),
    });

    res.contentType('application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-visite-${new Date().getTime()}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
