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
    const { price_list_sources, ...data }: Partial<CreateCompanyRequest> & {
      group_members?: string[] | null; price_list_sources?: string[] | null;
    } = req.body || {};
    const ids = (v: any) => {
      const list = Array.isArray(v) ? [...new Set(v.map(String))].filter(id => id && id !== req.params.id) : [];
      return list.length ? list : null;
    };
    // a group (e.g. "Gruppo ABK") only puts together the statistics of its companies
    if ('group_members' in data) data.group_members = ids(data.group_members);
    let company: any = Object.keys(data).length
      ? await companyService.updateCompany(req.params.id, data as any)
      : await companyService.getCompanyById(req.params.id);
    if (!company) return res.status(404).json({ success: false, error: 'Company not found' });
    if (price_list_sources !== undefined) {
      // price lists of other companies used for this company's invoices (e.g.
      // ABK Group invoicing the articles of its brands): link its lines again
      const { ArticleService } = require('../services/ArticleService');
      const sources = ids(price_list_sources) || [];
      const before = (company as any).price_list_sources || [];
      const changed = sources.length !== before.length || sources.some((id: string) => !before.includes(id));
      if (changed) {
        new ArticleService().setPriceListSources(req.params.id, sources)
          .catch((e: Error) => console.log('Price list sources note:', e.message));
        company = { ...company, price_list_sources: sources.length ? sources : null } as any;
      }
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
