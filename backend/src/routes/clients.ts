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

    // Crea il cliente
    const client = await clientService.createClient(data);

    // Assegna i permessi all'utente che crea il cliente su tutte le aziende
    if (userId) {
      try {
        const companies = await companyService.getCompanies();
        for (const company of companies) {
          await permissionService.assignPermission(
            userId,
            client.id,
            company.id,
            true,  // can_view
            true,  // can_create
            true,  // can_edit
            userId // assignedByUserId
          );
        }
      } catch (permissionError) {
        // Log the error but don't fail the client creation
        console.error('Errore nell\'assegnazione dei permessi:', permissionError);
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

      // Se non ha accesso a '*' (tutti), filtra per soli clienti assegnati
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

    // Solo admin può cancellare clienti
    if (userRole !== 'admin') {
      return res.status(403).json({ success: false, error: 'Solo gli amministratori possono cancellare clienti' });
    }

    // Cancella prima i permessi associati al cliente
    await permissionService.deletePermissionsByClientId(req.params.id);

    // Poi cancella il cliente
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
