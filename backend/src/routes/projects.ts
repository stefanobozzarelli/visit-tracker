import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { Project } from '../entities/Project';
import { ApiResponse } from '../types';
import { PermissionService } from '../services/PermissionService';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { ProjectService } from '../services/ProjectService';
import { S3Service } from '../services/S3Service';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const router = Router();
router.use(authMiddleware);

const repo = () => AppDataSource.getRepository(Project);
const permissionService = new PermissionService();
const pdfService = new PdfService();
const excelService = new ExcelService();
const projectService = new ProjectService();
const s3Service = new S3Service();
const upload = multer({ storage: multer.memoryStorage() });

// GET project stats (MUST be before /:id to avoid conflict)
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    let baseQb = repo().createQueryBuilder('p');

    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        if (visibleClientIds.length > 0) {
          baseQb = baseQb.andWhere('p.client_id IN (:...visibleClientIds)', { visibleClientIds });
        } else {
          return res.json({ success: true, data: { total: 0, active: 0, completed: 0, total_value: 0, total_shipped: 0 } });
        }
      }
    }

    const total = await baseQb.clone().getCount();
    const active = await baseQb.clone().andWhere('p.status = :s', { s: 'ATTIVO' }).getCount();
    const completed = await baseQb.clone().andWhere('p.status = :s', { s: 'COMPLETATO' }).getCount();

    const valueResult = await baseQb.clone()
      .select('SUM(p.project_value)', 'total_value')
      .addSelect('SUM(p.total_value_shipped)', 'total_shipped')
      .andWhere('p.status = :status', { status: 'ATTIVO' })
      .getRawOne();

    const response: ApiResponse<any> = {
      success: true,
      data: {
        total,
        active,
        completed,
        total_value: parseFloat(valueResult?.total_value || '0'),
        total_shipped: parseFloat(valueResult?.total_shipped || '0'),
      }
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/export-pdf', async (req: Request, res: Response) => {
  try {
    const { supplier_id, client_id, country, status } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    let qb = repo().createQueryBuilder('p')
      .leftJoinAndSelect('p.supplier', 'supplier')
      .leftJoinAndSelect('p.client', 'client')
      .orderBy('p.project_number', 'DESC');
    if (supplier_id) qb = qb.andWhere('p.supplier_id = :supplier_id', { supplier_id });
    if (client_id) qb = qb.andWhere('p.client_id = :client_id', { client_id });
    if (country) qb = qb.andWhere('p.country = :country', { country });
    if (status) qb = qb.andWhere('p.status = :status', { status });
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        if (visibleClientIds.length > 0) {
          qb = qb.andWhere('p.client_id IN (:...visibleClientIds)', { visibleClientIds });
        } else {
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'attachment; filename=projects-report.pdf');
          const buffer = await pdfService.generateProjectsPdf([], { title: 'Projects Report', generatedAt: new Date() });
          return res.send(buffer);
        }
      }
    }
    const projects = await qb.getMany();
    const buffer = await pdfService.generateProjectsPdf(projects, { title: 'Projects Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=projects-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/export-excel', async (req: Request, res: Response) => {
  try {
    const { supplier_id, client_id, country, status } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    let qb = repo().createQueryBuilder('p')
      .leftJoinAndSelect('p.supplier', 'supplier')
      .leftJoinAndSelect('p.client', 'client')
      .orderBy('p.project_number', 'DESC');
    if (supplier_id) qb = qb.andWhere('p.supplier_id = :supplier_id', { supplier_id });
    if (client_id) qb = qb.andWhere('p.client_id = :client_id', { client_id });
    if (country) qb = qb.andWhere('p.country = :country', { country });
    if (status) qb = qb.andWhere('p.status = :status', { status });
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        if (visibleClientIds.length > 0) {
          qb = qb.andWhere('p.client_id IN (:...visibleClientIds)', { visibleClientIds });
        } else {
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', 'attachment; filename=projects-report.xlsx');
          const buffer = excelService.generateProjectsExcel([]);
          return res.send(buffer);
        }
      }
    }
    const projects = await qb.getMany();
    const buffer = excelService.generateProjectsExcel(projects);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=projects-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET all projects (with filters + permission-based visibility)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { supplier_id, client_id, country, status, project_type, search } = req.query;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    let qb = repo().createQueryBuilder('p')
      .leftJoinAndSelect('p.supplier', 'supplier')
      .leftJoinAndSelect('p.client', 'client')
      .orderBy('p.project_number', 'DESC');

    // Permission-based filtering: admin/master_admin/manager see all, sales_rep only sees permitted clients
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        if (visibleClientIds.length > 0) {
          qb = qb.andWhere('p.client_id IN (:...visibleClientIds)', { visibleClientIds });
        } else {
          const response: ApiResponse<any> = { success: true, data: [] };
          return res.json(response);
        }
      }
    }

    if (supplier_id) qb = qb.andWhere('p.supplier_id = :supplier_id', { supplier_id });
    if (client_id) qb = qb.andWhere('p.client_id = :client_id', { client_id });
    if (country) qb = qb.andWhere('p.country = :country', { country });
    if (status) qb = qb.andWhere('p.status = :status', { status });
    if (project_type) qb = qb.andWhere('p.project_type = :project_type', { project_type });
    if (search) {
      qb = qb.andWhere(
        '(LOWER(p.project_name) LIKE LOWER(:search) OR LOWER(p.architect_designer) LIKE LOWER(:search) OR LOWER(p.developer) LIKE LOWER(:search) OR LOWER(p.contractor) LIKE LOWER(:search) OR LOWER(p.item) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    const projects = await qb.getMany();
    const response: ApiResponse<any> = { success: true, data: projects };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET single project (with permission check)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const project = await repo().findOne({
      where: { id: req.params.id },
      relations: ['supplier', 'client'],
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Permission check for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*') && project.client_id && !visibleClientIds.includes(project.client_id)) {
        return res.status(403).json({ success: false, error: 'Access denied' });
      }
    }

    const response: ApiResponse<any> = { success: true, data: project };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;
    if (!['admin', 'master_admin', 'manager'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Only admin/manager can create projects' });
    }

    // Auto-assign project_number
    const lastProject = await repo().createQueryBuilder('p')
      .orderBy('p.project_number', 'DESC')
      .getOne();
    const nextNumber = (lastProject?.project_number || 0) + 1;

    const projectData = { ...req.body, project_number: nextNumber };
    const project = new Project();
    Object.assign(project, projectData);
    const saved = await repo().save(project);

    // Reload with relations
    const result = await repo().findOne({ where: { id: (saved as any).id }, relations: ['supplier', 'client'] });
    const response: ApiResponse<any> = { success: true, data: result };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// PUT update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;
    if (!['admin', 'master_admin', 'manager'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Only admin/manager can update projects' });
    }

    await repo().update(req.params.id, req.body);

    // If the project value is set to auto (not manual), recompute it from linked offers
    if (req.body.project_value_manual === false || req.body.project_value_manual === 'false') {
      await projectService.recalcValue(req.params.id);
    }

    const result = await repo().findOne({ where: { id: req.params.id }, relations: ['supplier', 'client'] });
    const response: ApiResponse<any> = { success: true, data: result };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// DELETE project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;
    if (!['admin', 'master_admin'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Only admin can delete projects' });
    }

    await repo().delete(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Project deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// ─── Project value: offers total ───────────────────────────────────────────

/**
 * GET /api/projects/:id/offers-total
 * Returns the sum of the project's linked offers' totals + recalculates if auto.
 */
router.get('/:id/offers-total', async (req: Request, res: Response) => {
  try {
    await projectService.recalcValue(req.params.id);
    const total = await projectService.getOffersTotal(req.params.id);
    res.json({ success: true, data: { offers_total: total } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Project Attachments ─────────────────────────────────────────────────────

router.post('/:id/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const project = await repo().findOne({ where: { id } });
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const s3Key = `project-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const attachment = await projectService.addAttachment(id, {
      filename,
      file_size: req.file.size,
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

router.get('/:id/attachments', async (req: Request, res: Response) => {
  try {
    const attachments = await projectService.getAttachments(req.params.id);
    res.json({ success: true, data: attachments });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await projectService.getAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }
    const url = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await projectService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await projectService.deleteAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Project Movements ───────────────────────────────────────────────────────

router.get('/:id/movements', async (req: Request, res: Response) => {
  try {
    const movements = await projectService.getMovements(req.params.id);
    res.json({ success: true, data: movements });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/movements', async (req: Request, res: Response) => {
  try {
    const { date, action } = req.body;
    if (!date || !action) {
      return res.status(400).json({ success: false, error: 'date and action are required' });
    }
    const movement = await projectService.addMovement(req.params.id, {
      date: new Date(date),
      action,
      created_by_user_id: (req.user as any).id,
    });
    res.status(201).json({ success: true, data: movement });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id/movements/:movementId', async (req: Request, res: Response) => {
  try {
    const updateData: any = {};
    if (req.body.date) updateData.date = new Date(req.body.date);
    if (req.body.action !== undefined) updateData.action = req.body.action;
    await projectService.updateMovement(req.params.movementId, updateData);
    res.json({ success: true, message: 'Movement updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/movements/:movementId', async (req: Request, res: Response) => {
  try {
    await projectService.deleteMovement(req.params.movementId);
    res.json({ success: true, message: 'Movement deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ─── Project Movement Attachments ────────────────────────────────────────────

router.post('/:id/movements/:movementId/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { movementId } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const s3Key = `project-movement-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const attachment = await projectService.addMovementAttachment(movementId, {
      filename,
      file_size: req.file.size,
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

router.get('/:id/movements/:movementId/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await projectService.getMovementAttachment(req.params.attachmentId);
    if (!attachment) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }
    const url = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/movements/:movementId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await projectService.getMovementAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await projectService.deleteMovementAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Movement attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
