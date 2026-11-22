import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth';
import { todoistService } from '../services/TodoistService';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret';

/**
 * GET /api/integrations/todoist/connect
 * URL Todoist a cui reindirizzare l'utente per autorizzare.
 */
router.get('/connect', authMiddleware, async (req: Request, res: Response) => {
  try {
    if (!todoistService.isConfigured()) {
      return res.status(503).json({ success: false, error: 'Integrazione Todoist non configurata sul server' });
    }
    const userId = (req.user as any)?.id;
    const state = jwt.sign({ id: userId, purpose: 'todoist_oauth' }, JWT_SECRET, { expiresIn: '10m' });
    res.json({ success: true, data: { url: todoistService.getAuthUrl(state) } });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * GET /api/integrations/todoist/callback?code&state
 * Redirect dal browser dopo l'autorizzazione (nessun Bearer token qui).
 */
router.get('/callback', async (req: Request, res: Response) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://visit-tracker-pi.vercel.app';
  try {
    if (req.query.error) throw new Error(String(req.query.error));
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) throw new Error('Parametri OAuth mancanti');

    let userId: string;
    try {
      const decoded = jwt.verify(state, JWT_SECRET) as any;
      if (decoded.purpose !== 'todoist_oauth') throw new Error('state non valido');
      userId = decoded.id;
    } catch {
      throw new Error('Sessione di collegamento scaduta, riprova');
    }

    await todoistService.exchangeCodeForUser(userId, code);
    // Invia in background i task aperti già esistenti
    todoistService.initialSync(userId).catch(err => console.error('[Todoist] initialSync:', err.message));
    res.redirect(`${frontendUrl}/settings?todoist=connected`);
  } catch (error) {
    const msg = encodeURIComponent((error as Error).message);
    res.redirect(`${frontendUrl}/settings?todoist=error&reason=${msg}`);
  }
});

/**
 * GET /api/integrations/todoist/status
 */
router.get('/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    res.json({ success: true, data: await todoistService.getStatus(userId) });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/integrations/todoist/disconnect
 */
router.post('/disconnect', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    await todoistService.disconnect(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/integrations/todoist/sync
 * Rilancia manualmente l'invio dei task aperti non ancora su Todoist.
 */
router.post('/sync', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    todoistService.initialSync(userId).catch(err => console.error('[Todoist] sync:', err.message));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/integrations/todoist/webhook
 * Chiamato da Todoist. Firma HMAC-SHA256 (client secret) nell'header X-Todoist-Hmac-SHA256.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.header('X-Todoist-Hmac-SHA256');
  if (!todoistService.verifyWebhook((req as any).rawBody, signature)) {
    return res.status(401).json({ success: false, error: 'Firma non valida' });
  }
  // Rispondi subito: Todoist ritenta se non riceve 200 in tempi brevi
  res.status(200).json({ success: true });
  todoistService.handleWebhook(req.body).catch(err =>
    console.error('[Todoist] webhook:', err.message),
  );
});

export default router;
