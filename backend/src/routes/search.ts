import { Router, Request, Response } from 'express';
import { SearchService } from '../services/SearchService';
import { authMiddleware } from '../middleware/auth';
import { ApiResponse } from '../types';

const router = Router();
const searchService = new SearchService();

router.use(authMiddleware);

/**
 * POST /api/search/visits
 * Ricerca semantica nelle visite
 */
router.post('/visits', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query di ricerca obbligatoria',
      });
    }

    const visits = await searchService.searchVisits(query);
    const response: ApiResponse<any> = {
      success: true,
      data: visits,
      message: `Trovate ${visits.length} visite`,
    };
    res.json(response);
  } catch (error) {
    console.error('Search visits error:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella ricerca: ' + (error as Error).message,
    });
  }
});

/**
 * POST /api/search/todos
 * Ricerca semantica nei TODO
 */
router.post('/todos', async (req: Request, res: Response) => {
  try {
    const { query } = req.body;
    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query di ricerca obbligatoria',
      });
    }

    // Admin può cercare in tutti i TODO, altri utenti solo nei propri
    const userId = req.user!.role === 'admin' ? undefined : req.user!.id;
    const todos = await searchService.searchTodos(query, userId);

    const response: ApiResponse<any> = {
      success: true,
      data: todos,
      message: `Trovati ${todos.length} TODO`,
    };
    res.json(response);
  } catch (error) {
    console.error('Search todos error:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nella ricerca: ' + (error as Error).message,
    });
  }
});

export default router;
