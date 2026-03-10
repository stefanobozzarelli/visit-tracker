import { Router, Request, Response } from 'express';
import { PermissionService } from '../services/PermissionService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const permissionService = new PermissionService();

// Middleware: solo admin
function adminOnly(req: Request, res: Response, next: Function) {
  if ((req.user as any)?.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: 'Accesso riservato agli amministratori',
    });
  }
  next();
}

/**
 * GET /api/admin/users (pubblico, accessibile a tutti gli utenti autenticati)
 * Lista tutti gli utenti per assegnare TODO
 */
router.get('/users', authMiddleware, async (req: Request, res: Response) => {
  try {
    const users = await permissionService.getAllUsers();
    res.json({
      success: true,
      data: users,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * POST /api/admin/permissions
 * Assegna un permesso a un utente per cliente+azienda
 * Body: { userId, clientId, companyId, can_view, can_create, can_edit, assignedByUserId }
 */
router.post('/permissions', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { userId, clientId, companyId, can_view, can_create, can_edit } = req.body;
    const assignedByUserId = (req.user as any).id;

    if (!userId || !clientId || !companyId) {
      return res.status(400).json({
        success: false,
        error: 'userId, clientId, companyId sono richiesti',
      });
    }

    const permission = await permissionService.assignPermission(
      userId,
      clientId,
      companyId,
      can_view !== false, // Default true
      can_create === true, // Default false
      can_edit === true, // Default false
      assignedByUserId
    );

    res.status(201).json({
      success: true,
      data: permission,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/admin/permissions
 * Lista i permessi, opzionalmente filtrando per userId o clientId
 */
router.get('/permissions', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const clientId = req.query.clientId as string;

    const permissions = await permissionService.getAllPermissions(userId, clientId);

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/admin/permissions/:permissionId
 * Revoca un permesso
 */
router.delete('/permissions/:permissionId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { permissionId } = req.params;

    await permissionService.revokePermission(permissionId);

    res.json({
      success: true,
      message: 'Permesso revocato',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Cancella un utente (e tutti i suoi dati associati)
 */
router.delete('/users/:userId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    await permissionService.deleteUser(userId);

    res.json({
      success: true,
      message: 'Utente cancellato con successo',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

export default router;
