import { Router, Request, Response } from 'express';
import { PermissionService } from '../services/PermissionService';
import { UserService } from '../services/UserService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const permissionService = new PermissionService();
const userService = new UserService();

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
 * POST /api/admin/users
 * Crea un nuovo utente
 */
router.post('/users', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { email, name, password, role, company_id } = req.body;

    if (!email || !name || !password) {
      return res.status(400).json({
        success: false,
        error: 'email, name, and password are required',
      });
    }

    const user = await userService.createUser(email, name, password, role, company_id);
    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/admin/users/:userId
 * Ottiene dettagli di un utente specifico
 */
router.get('/users/:userId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const user = await userService.getUserById(req.params.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/admin/users/:userId
 * Aggiorna i dati di un utente
 */
router.put('/users/:userId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, email, role, company_id } = req.body;
    console.log('PUT /users/:userId received:', { userId: req.params.userId, name, email, role, company_id });

    // Validazione base
    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, and role are required',
      });
    }

    const updateData: any = {
      name,
      email,
      role,
    };
    if (company_id) {
      updateData.company_id = company_id;
    }
    const user = await userService.updateUser(req.params.userId, updateData);
    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PATCH /api/admin/users/:userId/password
 * Cambia la password di un utente
 */
router.patch('/users/:userId/password', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'newPassword is required',
      });
    }

    await userService.changePassword(req.params.userId, newPassword);
    res.json({
      success: true,
      message: 'Password updated successfully',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * DELETE /api/admin/users/:userId
 * Cancella un utente e tutti i suoi dati associati
 */
router.delete('/users/:userId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    await permissionService.deleteUser(userId);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(400).json({
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
 * PUT /api/admin/permissions/:permissionId
 * Aggiorna i permessi di un utente
 */
router.put('/permissions/:permissionId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { permissionId } = req.params;
    const { can_view, can_create, can_edit } = req.body;

    const permission = await permissionService.updatePermission(
      permissionId,
      can_view !== false,
      can_create === true,
      can_edit === true
    );

    res.json({
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
