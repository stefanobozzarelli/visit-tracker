import { Router, Request, Response } from 'express';
import { AuthService } from '../services/AuthService';
import { LoginRequest, RegisterRequest, ApiResponse } from '../types';

const router = Router();
const authService = new AuthService();

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

export default router;
