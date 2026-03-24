import { Router, Request, Response } from 'express';
import { StatisticsService } from '../services/StatisticsService';
import { authMiddleware } from '../middleware/auth';

const router = Router();
const statisticsService = new StatisticsService();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    const userRole = (req.user as any)?.role;
    const userId = (req.user as any)?.id;

    let userIds: string[] | undefined;

    if (userRole === 'sales_rep') {
      userIds = [userId];
    }
    // master_admin, admin, manager: no userIds filter (show all)

    const result = await statisticsService.getUserStatistics({
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      userIds,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Statistics error:', (error as Error).message);
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
