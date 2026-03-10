import { Request, Response, NextFunction } from 'express';
import { PermissionService } from '../services/PermissionService';

const permissionService = new PermissionService();

/**
 * Middleware per controllare il permesso di un utente a una visita
 * Estrae client_id dalla query, body o params
 */
export async function checkVisitPermission(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Admin e manager bypassano il controllo
    if (userRole === 'admin' || userRole === 'manager') {
      return next();
    }

    // Estrai client_id dalla richiesta
    let clientId = req.query.client_id as string;
    if (!clientId && req.body?.client_id) {
      clientId = req.body.client_id;
    }
    if (!clientId && req.params?.clientId) {
      clientId = req.params.clientId;
    }
    // Per route /clients/:id, cerca anche nei params.id
    if (!clientId && req.params?.id) {
      clientId = req.params.id;
    }

    // Se non c'è client_id, lascia passare (potrebbe essere un endpoint che non lo richiede)
    if (!clientId) {
      return next();
    }

    // Verifica permesso per visualizzare
    const visibleClients = await permissionService.getVisibleClients(userId);

    // Se l'utente ha accesso a tutti ('*'), passa
    if (visibleClients.includes('*')) {
      return next();
    }

    // Se il client_id non è nella lista dei visibili, nega accesso
    if (!visibleClients.includes(clientId)) {
      return res.status(403).json({
        success: false,
        error: 'Accesso negato a questo cliente',
      });
    }

    next();
  } catch (error) {
    console.error('Permission middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Errore nel controllo dei permessi',
    });
  }
}

/**
 * Middleware factory per controllare permessi specifici
 * Uso: checkSpecificPermission('create') per controllare se può creare
 */
export function checkSpecificPermission(requiredAction: 'view' | 'create' | 'edit') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req.user as any)?.id;
      const userRole = (req.user as any)?.role;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'Not authenticated' });
      }

      // Admin e manager bypassano
      if (userRole === 'admin' || userRole === 'manager') {
        return next();
      }

      // Estrai IDs dalla richiesta
      let clientId = req.query.client_id as string || req.body?.client_id;
      let companyId = req.query.company_id as string || req.body?.company_id;

      if (!clientId || !companyId) {
        return res.status(400).json({
          success: false,
          error: 'client_id e company_id sono richiesti',
        });
      }

      // Controlla il permesso specifico
      const hasPermission = await permissionService.checkPermission(
        userId,
        clientId,
        companyId,
        requiredAction
      );

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: `Accesso negato: non hai il permesso di ${requiredAction} per questo cliente/azienda`,
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Errore nel controllo dei permessi',
      });
    }
  };
}
