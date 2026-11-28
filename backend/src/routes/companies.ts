import { Router, Request, Response } from 'express';
import { CompanyService } from '../services/CompanyService';
import { PermissionService } from '../services/PermissionService';
import { authMiddleware } from '../middleware/auth';
import { ApiResponse, CreateCompanyRequest } from '../types';

const router = Router();
const companyService = new CompanyService();
const permissionService = new PermissionService();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateCompanyRequest = req.body;
    const company = await companyService.createCompany(data);
    const response: ApiResponse<any> = { success: true, data: company };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    let allCompanies = await companyService.getCompanies();

    // Filter companies for sales_rep, admin/manager sees all
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      // For sales_rep, we need to filter companies for assigned clients
      const visibleClientIds = await permissionService.getVisibleClients(userId);

      if (!visibleClientIds.includes('*')) {
        // Get companies for each visible client
        const visibleCompanyIds = new Set<string>();
        for (const clientId of visibleClientIds) {
          const companyIds = await permissionService.getVisibleCompanies(userId, clientId);
          if (companyIds.includes('*')) {
            // If sales rep has access to all companies for this client, add all
            allCompanies.forEach(c => visibleCompanyIds.add(c.id));
          } else {
            companyIds.forEach(cId => visibleCompanyIds.add(cId));
          }
        }
        allCompanies = allCompanies.filter(company => visibleCompanyIds.has(company.id));
      }
    }

    const response: ApiResponse<any> = { success: true, data: allCompanies };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const company = await companyService.getCompanyById(req.params.id);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    const response: ApiResponse<any> = { success: true, data: company };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const data: Partial<CreateCompanyRequest> & { group_members?: string[] | null } = req.body;
    const groupChanged = 'group_members' in (req.body || {});
    if (groupChanged) {
      const ids = Array.isArray(data.group_members) ? data.group_members.map(String).filter(id => id && id !== req.params.id) : [];
      data.group_members = ids.length ? [...new Set(ids)] : null;
    }
    const company = await companyService.updateCompany(req.params.id, data as any);
    if (groupChanged && data.group_members?.length) {
      // companies of a group share their price lists: link their invoice lines again
      const { ArticleService } = require('../services/ArticleService');
      const articles = new ArticleService();
      // one call covers the whole group: it includes the companies sharing the lists
      articles.matchLineItems({ companyId: data.group_members[0] })
        .catch((e: Error) => console.log('Group rematch note:', e.message));
    }
    const response: ApiResponse<any> = { success: true, data: company };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await companyService.deleteCompany(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Company deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
