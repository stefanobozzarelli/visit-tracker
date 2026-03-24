import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { UserService } from '../services/UserService';
import { PermissionService } from '../services/PermissionService';
import { authMiddleware } from '../middleware/auth';
import { LoginRequest, RegisterRequest, ApiResponse } from '../types';
import { AppDataSource } from '../config/database';
import { UserLoginLog } from '../entities/UserLoginLog';

const router = Router();
const authService = new AuthService();
const userService = new UserService();
const permissionService = new PermissionService();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const data: RegisterRequest = req.body;
    console.log('Registration request:', data);
    const result = await authService.register(data);
    const response: ApiResponse<any> = {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          can_view_revenue: !!(result.user as any).can_view_revenue,
        },
        token: result.token,
      },
    };
    res.status(201).json(response);
  } catch (error) {
    console.error('Registration error:', (error as Error).message);
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const data: LoginRequest = req.body;
    const result = await authService.login(data);
    const response: ApiResponse<any> = {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          role: result.user.role,
          can_view_revenue: !!(result.user as any).can_view_revenue,
        },
        token: result.token,
      },
    };
    // Fire-and-forget login log
    try {
      const repo = AppDataSource.getRepository(UserLoginLog);
      await repo.save(repo.create({ user_id: result.user.id, ip_address: req.ip || req.headers['x-forwarded-for']?.toString() || null }));
      console.log('[AUTH] Login logged for user:', result.user.id);
    } catch (e: any) {
      console.error('[AUTH] Failed to log login:', e.message);
    }

    res.json(response);
  } catch (error) {
    res.status(401).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name, role: user.role, can_view_revenue: !!(user as any).can_view_revenue },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PUT /api/auth/profile
 * Update own profile (name)
 */
router.put('/profile', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    const user = await userService.updateUser(userId, { name });
    res.json({
      success: true,
      data: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * PATCH /api/auth/password
 * Change own password (requires current password)
 */
router.patch('/password', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current password and new password are required' });
    }
    // Verify current password by attempting login
    const isValid = await authService.verifyPassword(userId, currentPassword);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }
    await userService.changePassword(userId, newPassword);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/auth/my-areas
 * Get the current user's assigned companies and countries
 */
router.get('/my-areas', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const areas = await permissionService.getUserAreas(userId);
    res.json({ success: true, data: areas });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/auth/sidebar-menu-order
 * Get current user's sidebar menu order
 */
router.get('/sidebar-menu-order', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const user = await userService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.json({
      success: true,
      data: (user as any).sidebar_menu_order || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/auth/sidebar-menu-order
 * Save current user's sidebar menu order
 */
router.post('/sidebar-menu-order', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const { menuOrder } = req.body;
    if (!Array.isArray(menuOrder)) {
      return res.status(400).json({ success: false, error: 'Menu order must be an array' });
    }
    const user = await userService.updateUser(userId, { sidebar_menu_order: menuOrder as any });
    res.json({
      success: true,
      data: (user as any).sidebar_menu_order || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
