import { Router, Request, Response } from 'express';
import { SearchService } from '../services/SearchService';
import { authMiddleware } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();
const searchService = new SearchService();

router.use(authMiddleware);

/**
 * POST /api/search/visits
 * Semantic search in visits
 */
router.post('/visits', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    const visits = await searchService.searchVisits(query);
    const response: ApiResponse<any> = {
      success: true,
      data: visits,
      message: `Found ${visits.length} visits`,
    };
    res.json(response);
  } catch (error) {
    console.error('Search visits error:', error);
    res.status(500).json({
      success: false,
      error: 'Search error: ' + (error as Error).message,
    });
  }
});

/**
 * POST /api/search/todos
 * Semantic search in TODOs
 */
router.post('/todos', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
    }

    // Admin can search all TODOs, other users only their own
    const userId = (req.user!.role === 'admin' || req.user!.role === 'master_admin') ? undefined : req.user!.id;
    const todos = await searchService.searchTodos(query, userId);

    const response: ApiResponse<any> = {
      success: true,
      data: todos,
      message: `Found ${todos.length} TODOs`,
    };
    res.json(response);
  } catch (error) {
    console.error('Search todos error:', error);
    res.status(500).json({
      success: false,
      error: 'Search error: ' + (error as Error).message,
    });
  }
});

export default router;
