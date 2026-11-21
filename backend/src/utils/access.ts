import { Request, Response, NextFunction } from 'express';
import { PermissionService } from '../services/PermissionService';

const permissionService = new PermissionService();

const PRIVILEGED_ROLES = ['master_admin', 'admin', 'manager'];

/** Admins and managers see every client; everyone else only their own. */
export function isPrivileged(req: Request): boolean {
  return PRIVILEGED_ROLES.includes((req.user as any)?.role);
}

/**
 * True when the signed-in user may see this client.
 * Records with no client attached are treated as visible, as elsewhere in the app.
 */
export async function canAccessClient(req: Request, clientId: string | null | undefined): Promise<boolean> {
  if (isPrivileged(req)) return true;
  if (!clientId) return true;
  const userId = (req.user as any)?.id;
  if (!userId) return false;
  const visible = await permissionService.getVisibleClients(userId);
  return visible.includes('*') || visible.includes(clientId);
}

/**
 * Supplier meetings use the "supplier + zone" rule: visible when the meeting's
 * supplier is assigned to the user and its zone is one of the user's countries
 * (meetings with no zone match on the supplier alone). Creators always see theirs.
 */
export async function canAccessCompanyVisit(req: Request, cv: { company_id?: string | null; zone?: string | null; created_by_user_id?: string | null }): Promise<boolean> {
  if (isPrivileged(req)) return true;
  const userId = (req.user as any)?.id;
  if (!userId) return false;
  if (cv.created_by_user_id === userId) return true;
  const { companies, countries } = await permissionService.getUserAreas(userId);
  if (!cv.company_id || !companies.some((c: any) => c.id === cv.company_id)) return false;
  if (!cv.zone) return true;
  return countries.includes(cv.zone);
}

export function deny(res: Response, message = 'Access denied') {
  return res.status(403).json({ success: false, error: message });
}

/** Express middleware: only admins and the master admin may continue. */
export function adminOnly(req: Request, res: Response, next: NextFunction) {
  const role = (req.user as any)?.role;
  if (role === 'admin' || role === 'master_admin') return next();
  return deny(res, 'Access reserved for administrators');
}
