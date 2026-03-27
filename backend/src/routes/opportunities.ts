import { Router, Request, Response } from 'express';
import { OpportunityService } from '../services/OpportunityService';
import { S3Service } from '../services/S3Service';
import { PermissionService } from '../services/PermissionService';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';

const router = Router();
const opportunityService = new OpportunityService();
const s3Service = new S3Service();
const permissionService = new PermissionService();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

// --- Opportunity CRUD ---

router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, title, client_id, company_id, visit_id, report_id, status, estimated_value, notes, expected_close_date, currency, description } = req.body;
    const created_by_user_id = (req.user as any).id;
    const effectiveTitle = title || name;

    if (!effectiveTitle || !client_id || !company_id) {
      return res.status(400).json({ success: false, error: 'title, client_id, and company_id are required' });
    }

    const opportunity = await opportunityService.createOpportunity({
      name: effectiveTitle, title: effectiveTitle, client_id, company_id, visit_id, report_id, status, estimated_value, notes: notes || description, created_by_user_id,
    } as any);

    res.status(201).json({ success: true, data: opportunity });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { client_id, company_id, visit_id, report_id, status } = req.query;
    let opportunities = await opportunityService.getOpportunities({
      client_id: client_id as string,
      company_id: company_id as string,
      visit_id: visit_id as string,
      report_id: report_id as string,
      status: status as string,
    });

    // Filter opportunities by user's visible clients (non-admin)
    const visibleClientIds = await permissionService.getVisibleClients(userId);
    if (!visibleClientIds.includes('*')) {
      opportunities = opportunities.filter(o => visibleClientIds.includes(o.client_id));
    }

    res.json({ success: true, data: opportunities });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const opportunity = await opportunityService.getOpportunityById(req.params.id);
    if (!opportunity) return res.status(404).json({ success: false, error: 'Opportunity not found' });
    res.json({ success: true, data: opportunity });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const opportunity = await opportunityService.updateOpportunity(req.params.id, req.body);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;

    // Admin/manager/master_admin can delete any opportunity
    // Sales rep can only delete opportunities they created
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const opportunity = await opportunityService.getOpportunityById(req.params.id);
      if (!opportunity) {
        return res.status(404).json({ success: false, error: 'Opportunity not found' });
      }
      if (opportunity.created_by_user_id !== userId) {
        return res.status(403).json({ success: false, error: 'You can only delete opportunities you created' });
      }
    }

    await opportunityService.deleteOpportunity(req.params.id);
    res.json({ success: true, message: 'Opportunity deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// --- Opportunity Attachments ---

router.post('/:id/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const { v4: uuidv4 } = require('uuid');
    const s3Key = `opportunity-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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

    const attachment = await opportunityService.addAttachment(req.params.id, userId, filename, fileSize, s3Key);

    res.json({
      success: true,
      data: { id: attachment.id, filename: attachment.filename, file_size: attachment.file_size, created_at: attachment.created_at },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await opportunityService.getAttachment(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ success: false, error: 'Attachment not found' });

    const downloadUrl = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url: downloadUrl, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await opportunityService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await opportunityService.deleteAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// --- Advances ---

router.post('/:id/advances', async (req: Request, res: Response) => {
  try {
    const { date, description } = req.body;
    const created_by_user_id = (req.user as any).id;

    if (!date || !description) {
      return res.status(400).json({ success: false, error: 'date and description are required' });
    }

    const advance = await opportunityService.addAdvance(req.params.id, {
      date: new Date(date), description, created_by_user_id,
    });

    res.status(201).json({ success: true, data: advance });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id/advances/:advanceId', async (req: Request, res: Response) => {
  try {
    const { date, description } = req.body;
    const updateData: any = {};
    if (date) updateData.date = new Date(date);
    if (description !== undefined) updateData.description = description;

    const advance = await opportunityService.updateAdvance(req.params.advanceId, updateData);
    res.json({ success: true, data: advance });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/advances/:advanceId', async (req: Request, res: Response) => {
  try {
    await opportunityService.deleteAdvance(req.params.advanceId);
    res.json({ success: true, message: 'Advance deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// --- Advance Attachments ---

router.post('/:id/advances/:advanceId/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const userId = (req.user as any).id;
    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const { v4: uuidv4 } = require('uuid');
    const s3Key = `opportunity-advance-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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

    const attachment = await opportunityService.addAdvanceAttachment(req.params.advanceId, userId, filename, fileSize, s3Key);

    res.json({
      success: true,
      data: { id: attachment.id, filename: attachment.filename, file_size: attachment.file_size, created_at: attachment.created_at },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/advances/:advanceId/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await opportunityService.getAdvanceAttachment(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ success: false, error: 'Attachment not found' });

    const downloadUrl = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url: downloadUrl, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/advances/:advanceId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await opportunityService.getAdvanceAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await opportunityService.deleteAdvanceAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
