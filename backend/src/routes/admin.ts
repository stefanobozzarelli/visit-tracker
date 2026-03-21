import { Router, Request, Response } from 'express';
import { PermissionService } from '../services/PermissionService';
import { UserService } from '../services/UserService';
import { User } from '../entities/User';
import { AppDataSource } from '../config/database';
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

// =============================================
// USER AREAS (companies + countries)
// =============================================

/**
 * GET /api/admin/users/:userId/areas
 * Get a user's assigned companies and countries
 */
router.get('/users/:userId/areas', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const areas = await permissionService.getUserAreas(req.params.userId);
    res.json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/admin/users/:userId/areas
 * Set a user's companies and countries
 * Body: { companyIds: string[], countries: string[] }
 */
router.put('/users/:userId/areas', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { companyIds, countries } = req.body;
    const assignedBy = (req.user as any).id;
    await permissionService.setUserAreas(req.params.userId, companyIds || [], countries || [], assignedBy);
    const areas = await permissionService.getUserAreas(req.params.userId);
    res.json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/admin/users/:userId/visible-clients
 * Preview which clients a user can see (computed from areas + overrides)
 */
router.get('/users/:userId/visible-clients', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const clients = await permissionService.getVisibleClientsPreview(req.params.userId);
    res.json({ success: true, data: clients });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// =============================================
// ADMIN OVERRIDES (grant / deny)
// =============================================

/**
 * GET /api/admin/users/:userId/overrides
 */
router.get('/users/:userId/overrides', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const overrides = await permissionService.getOverrides(req.params.userId);
    res.json({ success: true, data: overrides });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/admin/users/:userId/overrides
 * Body: { clientId, overrideType: 'grant' | 'deny' }
 */
router.post('/users/:userId/overrides', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const { clientId, overrideType } = req.body;
    if (!clientId || !overrideType) {
      return res.status(400).json({ success: false, error: 'clientId and overrideType are required' });
    }
    const assignedBy = (req.user as any).id;
    const override = await permissionService.addOverride(req.params.userId, clientId, overrideType, assignedBy);
    res.status(201).json({ success: true, data: override });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/admin/users/:userId/overrides/:clientId
 */
router.delete('/users/:userId/overrides/:clientId', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    await permissionService.removeOverride(req.params.userId, req.params.clientId);
    res.json({ success: true, message: 'Override removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/admin/countries
 * Get all known countries
 */
router.get('/countries', authMiddleware, adminOnly, async (req: Request, res: Response) => {
  try {
    const countries = await permissionService.getAllCountries();
    res.json({ success: true, data: countries });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/admin/users/:userId/revenue-access
 * Master admin only: toggle can_view_revenue for a user
 */
router.put('/users/:userId/revenue-access', authMiddleware, masterAdminOnly, async (req: Request, res: Response) => {
  try {
    const { can_view_revenue } = req.body;
    const userRepo = AppDataSource.getRepository(User);
    await userRepo.update(req.params.userId, { can_view_revenue: !!can_view_revenue });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
