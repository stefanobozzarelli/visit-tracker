import { Router, Request, Response } from 'express';
import { ClaimService } from '../services/ClaimService';
import { S3Service } from '../services/S3Service';
import { PermissionService } from '../services/PermissionService';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';

const router = Router();
const claimService = new ClaimService();
const s3Service = new S3Service();
const permissionService = new PermissionService();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

// --- Claim CRUD ---

router.post('/', async (req: Request, res: Response) => {
  try {
    const { client_id, company_id, date, comments, status } = req.body;
    const created_by_user_id = (req.user as any).id;

    if (!client_id || !company_id || !date) {
      return res.status(400).json({ success: false, error: 'client_id, company_id, and date are required' });
    }

    const claim = await claimService.createClaim({
      client_id, company_id, date: new Date(date), comments, status, created_by_user_id,
    });

    res.status(201).json({ success: true, data: claim });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { client_id, company_id, status } = req.query;
    let claims = await claimService.getClaims({
      client_id: client_id as string,
      company_id: company_id as string,
      status: status as string,
    });

    // Filter claims by user's visible clients (non-admin)
    const visibleClientIds = await permissionService.getVisibleClients(userId);
    if (!visibleClientIds.includes('*')) {
      claims = claims.filter(c => visibleClientIds.includes(c.client_id));
    }

    res.json({ success: true, data: claims });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const claim = await claimService.getClaimById(req.params.id);
    if (!claim) return res.status(404).json({ success: false, error: 'Claim not found' });
    res.json({ success: true, data: claim });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const claim = await claimService.updateClaim(req.params.id, req.body);
    res.json({ success: true, data: claim });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;

    // Admin/manager/master_admin can delete any claim
    // Sales rep can only delete claims they created
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const claim = await claimService.getClaimById(req.params.id);
      if (!claim) {
        return res.status(404).json({ success: false, error: 'Claim not found' });
      }
      if (claim.created_by_user_id !== userId) {
        return res.status(403).json({ success: false, error: 'You can only delete claims you created' });
      }
    }

    await claimService.deleteClaim(req.params.id);
    res.json({ success: true, message: 'Claim deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// --- Movements ---

router.post('/:id/movements', async (req: Request, res: Response) => {
  try {
    const { date, action } = req.body;
    const created_by_user_id = (req.user as any).id;

    if (!date || !action) {
      return res.status(400).json({ success: false, error: 'date and action are required' });
    }

    const movement = await claimService.addMovement(req.params.id, {
      date: new Date(date), action, created_by_user_id,
    });

    res.status(201).json({ success: true, data: movement });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id/movements/:movementId', async (req: Request, res: Response) => {
  try {
    const { date, action } = req.body;
    const updateData: any = {};
    if (date) updateData.date = new Date(date);
    if (action !== undefined) updateData.action = action;

    const movement = await claimService.updateMovement(req.params.movementId, updateData);
    res.json({ success: true, data: movement });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/movements/:movementId', async (req: Request, res: Response) => {
  try {
    await claimService.deleteMovement(req.params.movementId);
    res.json({ success: true, message: 'Movement deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// --- Movement Attachments ---

router.post('/:id/movements/:movementId/attachments', upload.single('file'), async (req: Request, res: Response) => {
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
    const s3Key = `claim-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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

    const attachment = await claimService.addAttachment(req.params.movementId, userId, filename, fileSize, s3Key);

    res.json({
      success: true,
      data: { id: attachment.id, filename: attachment.filename, file_size: attachment.file_size, created_at: attachment.created_at },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/movements/:movementId/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const attachment = await claimService.getAttachment(req.params.attachmentId);
    if (!attachment) return res.status(404).json({ success: false, error: 'Attachment not found' });

    const downloadUrl = await s3Service.getDownloadUrl(attachment.s3_key);
    res.json({ success: true, data: { url: downloadUrl, filename: attachment.filename } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id/movements/:movementId/attachments/:attachmentId', async (req: Request, res: Response) => {
  try {
    const attachment = await claimService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await claimService.deleteAttachment(req.params.attachmentId);
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
