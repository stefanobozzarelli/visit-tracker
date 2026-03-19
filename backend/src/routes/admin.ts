import { Router, Request, Response } from 'express';
import { PermissionService } from '../services/PermissionService';
import { UserService } from '../services/UserService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const permissionService = new PermissionService();
const userService = new UserService();

// Middleware: solo admin (include master_admin)
function adminOnly(req: Request, res: Response, next: Function) {
  const role = (req.user as any)?.role;
  if (role !== 'admin' && role !== 'master_admin') {
    return res.status(403).json({
      success: false,
      error: 'Access reserved for administrators',
    });
  }
  next();
}

// Middleware: solo master_admin
function masterAdminOnly(req: Request, res: Response, next: Function) {
  if ((req.user as any)?.role !== 'master_admin') {
    return res.status(403).json({
      success: false,
      error: 'Access reserved for master admin',
    });
  }
  next();
}

/**
 * GET /api/admin/users (public, accessible to all authenticated users)
 * List all users to assign TODOs
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
 * Create a new user
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
 * Get details of a specific user
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
 * Update user data
 */
router.put('/users/:userId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { name, role } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    const updateData: any = { name };
    if (role) updateData.role = role;

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
 * Change a user's password
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
 * Delete a user and all associated data
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
 * Assign a permission to a user for client+company
 * Body: { userId, clientId, companyId, can_view, can_create, can_edit, assignedByUserId }
 */
router.post('/permissions', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { userId, clientId, companyId, can_view, can_create, can_edit } = req.body;
    const assignedByUserId = (req.user as any).id;

    if (!userId || !clientId || !companyId) {
      return res.status(400).json({
        success: false,
        error: 'userId, clientId, companyId are required',
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
 * List permissions, optionally filtering by userId or clientId
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
 * Update user permissions
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
 * Revoke a permission
 */
router.delete('/permissions/:permissionId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { permissionId } = req.params;

    await permissionService.revokePermission(permissionId);

    res.json({
      success: true,
      message: 'Permission revoked',
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
      message: 'User deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * PUT /api/admin/users/:userId/revenue-access
 * Master admin only: toggle can_view_revenue for a user
 */
router.put('/users/:userId/revenue-access', authMiddleware, masterAdminOnly, async (req: Request, res: Response) => {
  try {
    const { can_view_revenue } = req.body;
    const userRepo = (await import('typeorm')).getRepository((await import('../entities/User')).User);
    await userRepo.update(req.params.userId, { can_view_revenue: !!can_view_revenue });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
