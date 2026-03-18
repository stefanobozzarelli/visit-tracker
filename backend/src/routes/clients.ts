import { Router, Request, Response } from 'express';
import { ClientService } from '../services/ClientService';
import { PermissionService } from '../services/PermissionService';
import { CompanyService } from '../services/CompanyService';
import { authMiddleware } from '../middleware/auth';
import { checkVisitPermission } from '../middleware/permissionMiddleware';
import { ApiResponse, CreateClientRequest, CreateContactRequest } from '../types';

const router = Router();
const clientService = new ClientService();
const permissionService = new PermissionService();
const companyService = new CompanyService();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateClientRequest = req.body;
    const userId = (req.user as any)?.id;

    // Create the client
    const client = await clientService.createClient(data);

    // Assign permissions to the user who creates the client
    // Admin/manager: all companies. Sales rep: only their companies.
    if (userId) {
      try {
        const userRole = (req.user as any)?.role;
        let companyIds: string[];

        if (userRole === 'admin' || userRole === 'manager') {
          // Admin/manager get all companies
          const companies = await companyService.getCompanies();
          companyIds = companies.map(c => c.id);
        } else {
          // Sales rep: only companies they already have access to
          const userPerms = await permissionService.getUserPermissions(userId);
          companyIds = [...new Set(userPerms.map(p => p.company_id))];
        }

        for (const companyId of companyIds) {
          await permissionService.assignPermission(
            userId,
            client.id,
            companyId,
            true,  // can_view
            true,  // can_create
            true,  // can_edit
            userId // assignedByUserId
          );
        }
      } catch (permissionError) {
        console.error('Error assigning permissions:', permissionError);
      }
    }

    const response: ApiResponse<any> = { success: true, data: client };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    let allClients = await clientService.getClients();

    // Filtra clienti per sales_rep, admin/manager vede tutti
    if (userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);

      // If no access to '*' (all), filter for only assigned clients
      if (!visibleClientIds.includes('*')) {
        allClients = allClients.filter(client => visibleClientIds.includes(client.id));
      }
    }

    const response: ApiResponse<any> = { success: true, data: allClients };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id', checkVisitPermission, async (req: Request, res: Response) => {
  try {
    const client = await clientService.getClientById(req.params.id);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });
    const response: ApiResponse<any> = { success: true, data: client };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.put('/:id', checkVisitPermission, async (req: Request, res: Response) => {
  try {
    const data: Partial<CreateClientRequest> = req.body;
    const client = await clientService.updateClient(req.params.id, data);
    const response: ApiResponse<any> = { success: true, data: client };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', checkVisitPermission, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;

    // Only admin can delete clients
    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Only administrators can delete clients' });
    }

    // First delete permissions associated with the client
    await permissionService.deletePermissionsByClientId(req.params.id);

    // Then delete the client
    await clientService.deleteClient(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Client deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const data: CreateContactRequest = req.body;
    const contact = await clientService.addContact(req.params.id, data);
    const response: ApiResponse<any> = { success: true, data: contact };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.get('/:id/contacts', async (req: Request, res: Response) => {
  try {
    const contacts = await clientService.getClientContacts(req.params.id);
    const response: ApiResponse<any> = { success: true, data: contacts };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    await clientService.deleteContact(req.params.contactId);
    const response: ApiResponse<any> = { success: true, message: 'Contact deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
