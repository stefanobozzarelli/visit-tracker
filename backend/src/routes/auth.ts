import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { UserService } from '../services/UserService';
import { authMiddleware } from '../middleware/auth';
import { LoginRequest, RegisterRequest, ApiResponse } from '../types';

const router = Router();
const authService = new AuthService();
const userService = new UserService();

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
        },
        token: result.token,
      },
    };
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

export default router;
