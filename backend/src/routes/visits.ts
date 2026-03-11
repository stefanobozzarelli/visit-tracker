import { Router, Request, Response } from 'express';
import { VisitService } from '../services/VisitService';
import { PermissionService } from '../services/PermissionService';
import { CloudinaryService } from '../services/CloudinaryService';
import { PdfService } from '../services/PdfService';
import { authMiddleware } from '../middleware/auth';
import { checkVisitPermission } from '../middleware/permissionMiddleware';
import { ApiResponse, CreateVisitRequest, CreateVisitReportRequest } from '../types';

const router = Router();
const visitService = new VisitService();
const permissionService = new PermissionService();
const cloudinaryService = new CloudinaryService();
const pdfService = new PdfService();

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const filters = {
      client_id: req.query.client_id as string,
      user_id: req.query.user_id as string,
    };

    let visits = await visitService.getVisits(filters);

    // Filtra visite per sales_rep, admin/manager vede tutte
    if (userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);

      // Se non ha accesso a '*' (tutti), filtra per soli clienti assegnati
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

    // Verifica permesso d'accesso alla visita
    const visit = await visitService.getVisitById(visitId);
    if (!visit) {
      return res.status(404).json({ success: false, error: 'Visit not found' });
    }

    if (userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && !visibleClientIds.includes(visit.client_id)) {
        return res.status(403).json({ success: false, error: 'Accesso negato a questa visita' });
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

    // Verifica permesso d'accesso
    if (userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && !visibleClientIds.includes(visit.client_id)) {
        return res.status(403).json({ success: false, error: 'Accesso negato a questa visita' });
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

    // Verifica permesso d'accesso
    if (userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && !visibleClientIds.includes(visit.client_id)) {
        return res.status(403).json({ success: false, error: 'Accesso negato a questa visita' });
      }
    }

    await visitService.deleteVisit(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Visit deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
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

router.post('/:visitId/reports/:reportId/upload', async (req: Request, res: Response) => {
  try {
    const { filename, fileSize } = req.body;
    const { url, publicId } = await cloudinaryService.generatePresignedUrl(filename, fileSize);

    // Save attachment metadata after successful upload
    // Note: In real scenario, this would be done after the file is uploaded to Cloudinary
    const attachment = await visitService.addAttachment(
      req.params.reportId,
      req.user!.id,
      filename,
      fileSize,
      publicId
    );

    const response: ApiResponse<any> = {
      success: true,
      data: {
        uploadUrl: url,
        publicId,
        attachmentId: attachment.id,
      },
    };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:visitId/reports/:reportId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await visitService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await cloudinaryService.deleteFile(attachment.s3_key);
    }
    await visitService.deleteAttachment(req.params.attachmentId);
    const response: ApiResponse<any> = { success: true, message: 'Attachment deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
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
    const { startDate, endDate, clientId, companyIds, userId } = req.body;

    // Get visits based on filters
    let visits = await visitService.getVisits({
      client_id: clientId,
      user_id: userId,
    });

    // Filtra visite per permessi (se non è admin/manager)
    if (userRole !== 'admin' && userRole !== 'manager') {
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
    if (companyIds && (Array.isArray(companyIds) ? companyIds.length > 0 : companyIds)) {
      const companyIdArray = Array.isArray(companyIds) ? companyIds : [companyIds];
      visits = visits.map(v => ({
        ...v,
        reports: v.reports?.filter(r => companyIdArray.includes(r.company_id)) || [],
      })) as any;
      // Rimuovi visite senza report (dopo il filtraggio per company)
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
