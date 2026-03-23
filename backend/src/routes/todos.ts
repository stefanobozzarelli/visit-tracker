import { Router, Request, Response } from 'express';
import { TodoService } from '../services/TodoService';
import { S3Service } from '../services/S3Service';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { authMiddleware } from '../middleware/auth';
import multer from 'multer';

const router = Router();
const todoService = new TodoService();
const s3Service = new S3Service();
const pdfService = new PdfService();
const excelService = new ExcelService();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * POST /api/todos/export-pdf
 * Export filtered todos to PDF
 */
router.post('/export-pdf', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, clientId, companyId, assignedToUserId } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const filters: any = {};
    if (status) filters.status = status;
    if (clientId) filters.clientId = clientId;
    if (companyId) filters.companyId = companyId;
    if (assignedToUserId) filters.assignedToUserId = assignedToUserId;
    let todos = await todoService.getTodos(filters);
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      todos = todos.filter((t: any) => t.assigned_to_user_id === userId || t.created_by_user_id === userId);
    }
    const buffer = await pdfService.generateTasksPdf(todos, { title: 'Tasks Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=tasks-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/todos/export-excel
 * Export filtered todos to Excel
 */
router.post('/export-excel', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { status, clientId, companyId, assignedToUserId } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const filters: any = {};
    if (status) filters.status = status;
    if (clientId) filters.clientId = clientId;
    if (companyId) filters.companyId = companyId;
    if (assignedToUserId) filters.assignedToUserId = assignedToUserId;
    let todos = await todoService.getTodos(filters);
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      todos = todos.filter((t: any) => t.assigned_to_user_id === userId || t.created_by_user_id === userId);
    }
    const buffer = excelService.generateTasksExcel(todos);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=tasks-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/todos
 * Create a new todo
 */
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { title, clientId, companyId, assignedToUserId, dueDate, visitReportId, claimId, visitId, companyVisitId } = req.body;
    const createdByUserId = (req.user as any).id;

    if (!title || !clientId || !companyId || !assignedToUserId) {
      return res.status(400).json({
        success: false,
        error: 'title, clientId, companyId, and assignedToUserId are required',
      });
    }

    const todo = await todoService.createTodo(
      title,
      clientId,
      companyId,
      assignedToUserId,
      createdByUserId,
      dueDate ? new Date(dueDate) : undefined,
      visitReportId,
      claimId,
      visitId,
      companyVisitId
    );

    res.status(201).json({
      success: true,
      data: todo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/todos
 * Get all todos (admin only)
 */
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any).role;
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      return res.status(403).json({
        success: false,
        error: 'Only admin/manager can view all todos',
      });
    }

    const { status, clientId, companyId, assignedToUserId, overdue, thisWeek, next7Days } = req.query;

    const todos = await todoService.getTodos({
      status: status as string,
      clientId: clientId as string,
      companyId: companyId as string,
      assignedToUserId: assignedToUserId as string,
      overdue: overdue === 'true',
      thisWeek: thisWeek === 'true',
      next7Days: next7Days === 'true',
    });

    res.json({
      success: true,
      data: todos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/todos/by-claim/:claimId
 * Get todos linked to a claim
 */
router.get('/by-claim/:claimId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const todos = await todoService.getTodosByClaimId(req.params.claimId);
    res.json({ success: true, data: todos });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/todos/by-company-visit/:companyVisitId
 * Get todos linked to a company visit
 */
router.get('/by-company-visit/:companyVisitId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const todos = await todoService.getTodosByCompanyVisitId(req.params.companyVisitId);
    res.json({ success: true, data: todos });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/todos/my
 * Get todos assigned to current user
 */
router.get('/my', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const { status, clientId, companyId, overdue, thisWeek, next7Days } = req.query;

    const todos = await todoService.getMyTodos(userId, {
      status: status as string,
      clientId: clientId as string,
      companyId: companyId as string,
      overdue: overdue === 'true',
      thisWeek: thisWeek === 'true',
      next7Days: next7Days === 'true',
    });

    res.json({
      success: true,
      data: todos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/todos/:id
 * Get single todo
 */
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const todo = await todoService.getTodoById(id);
    if (!todo) {
      return res.status(404).json({
        success: false,
        error: 'Todo not found',
      });
    }

    // Permission check: only assigned user or admin can view
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager' && todo.assigned_to_user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to view this todo',
      });
    }

    res.json({
      success: true,
      data: todo,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/todos/:id
 * Update todo (status, due_date, assigned_to_user_id)
 */
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, dueDate, assignedToUserId } = req.body;

    const todo = await todoService.getTodoById(id);
    if (!todo) {
      return res.status(404).json({
        success: false,
        error: 'Todo not found',
      });
    }

    // Permission check: only assigned user, creator, or admin can update
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    if (
      userRole !== 'admin' &&
      userRole !== 'manager' &&
      todo.assigned_to_user_id !== userId &&
      todo.created_by_user_id !== userId
    ) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to update this todo',
      });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (dueDate) updateData.due_date = new Date(dueDate);
    if (assignedToUserId) updateData.assigned_to_user_id = assignedToUserId;

    const updated = await todoService.updateTodo(id, updateData);

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/todos/:id
 * Delete todo (creator or admin only)
 */
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const todo = await todoService.getTodoById(id);
    if (!todo) {
      return res.status(404).json({
        success: false,
        error: 'Todo not found',
      });
    }

    // Permission check: only creator or admin can delete
    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager' && todo.created_by_user_id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized to delete this todo',
      });
    }

    await todoService.deleteTodo(id);

    res.json({
      success: true,
      message: 'Todo deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/todos/:id/attachments
 * Upload attachment to a todo
 */
router.post('/:id/attachments', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file provided' });
    }

    const todo = await todoService.getTodoById(id);
    if (!todo) {
      return res.status(404).json({ success: false, error: 'Todo not found' });
    }

    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    if (
      userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager' &&
      todo.assigned_to_user_id !== userId && todo.created_by_user_id !== userId
    ) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const filename = req.file.originalname;
    const fileBuffer = req.file.buffer;
    const fileSize = req.file.size;
    const contentType = req.file.mimetype;

    const { v4: uuidv4 } = require('uuid');
    const s3Key = `todo-attachments/${uuidv4()}.${filename.split('.').pop()}`;

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

    const attachment = await todoService.addAttachment(id, userId, filename, fileSize, s3Key);

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
 * GET /api/todos/:id/attachments
 * List attachments for a todo
 */
router.get('/:id/attachments', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachments = await todoService.getAttachments(req.params.id);
    res.json({ success: true, data: attachments });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/todos/:id/attachments/:attachmentId/download
 * Get presigned download URL for attachment
 */
router.get('/:id/attachments/:attachmentId/download', authMiddleware, async (req: Request, res: Response) => {
  try {
    const attachment = await todoService.getAttachment(req.params.attachmentId);
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
 * DELETE /api/todos/:id/attachments/:attachmentId
 * Delete attachment
 */
router.delete('/:id/attachments/:attachmentId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const todo = await todoService.getTodoById(req.params.id);
    if (!todo) {
      return res.status(404).json({ success: false, error: 'Todo not found' });
    }

    const userId = (req.user as any).id;
    const userRole = (req.user as any).role;
    if (
      userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager' &&
      todo.assigned_to_user_id !== userId && todo.created_by_user_id !== userId
    ) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    const attachment = await todoService.getAttachment(req.params.attachmentId);
    if (attachment) {
      await s3Service.deleteFile(attachment.s3_key);
    }
    await todoService.deleteAttachment(req.params.attachmentId);

    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
