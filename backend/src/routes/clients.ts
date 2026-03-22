import { Router, Request, Response } from 'express';
import multer from 'multer';
import { ClientService } from '../services/ClientService';
import { PermissionService } from '../services/PermissionService';
import { CompanyService } from '../services/CompanyService';
import { S3Service } from '../services/S3Service';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { authMiddleware } from '../middleware/auth';
import { checkVisitPermission } from '../middleware/permissionMiddleware';
import { ApiResponse, CreateClientRequest, CreateContactRequest } from '../types';

const router = Router();
const clientService = new ClientService();
const permissionService = new PermissionService();
const companyService = new CompanyService();
const s3Service = new S3Service();
const pdfService = new PdfService();
const excelService = new ExcelService();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateClientRequest = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    // Create the client
    const client = await clientService.createClient(data);

    // Set client-company associations if provided
    const companyIds: string[] = (req.body as any).company_ids || [];
    if (companyIds.length > 0) {
      // Non-admin: validate they only flag their own companies
      if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'master_admin') {
        const userAreas = await permissionService.getUserAreas(userId);
        const userCompanyIds = userAreas.companies.map(c => c.id);
        const invalid = companyIds.filter(id => !userCompanyIds.includes(id));
        if (invalid.length > 0) {
          return res.status(403).json({ success: false, error: 'You can only assign companies from your areas' });
        }
      }
      await permissionService.setClientCompanies(client.id, companyIds);
    }

    // Reload client with associations
    const fullClient = await clientService.getClientById(client.id);
    const response: ApiResponse<any> = { success: true, data: fullClient };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.post('/export-pdf', async (req: Request, res: Response) => {
  try {
    const { country, role } = req.body;
    let clients = await clientService.getClients();
    if (country) clients = clients.filter((c: any) => c.country === country);
    if (role) clients = clients.filter((c: any) => c.role === role);
    const buffer = await pdfService.generateClientsPdf(clients, { title: 'Clients Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=clients-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/export-excel', async (req: Request, res: Response) => {
  try {
    const { country, role } = req.body;
    let clients = await clientService.getClients();
    if (country) clients = clients.filter((c: any) => c.country === country);
    if (role) clients = clients.filter((c: any) => c.role === role);
    const buffer = excelService.generateClientsExcel(clients);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=clients-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    let allClients = await clientService.getClients();

    // Filtra clienti per sales_rep, master_admin/admin/manager vede tutti
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
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
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;

    const client = await clientService.updateClient(req.params.id, data);

    // Update client-company associations if provided
    const companyIds: string[] | undefined = (req.body as any).company_ids;
    if (companyIds !== undefined) {
      // Non-admin: validate they only flag their own companies
      if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'master_admin') {
        const userAreas = await permissionService.getUserAreas(userId);
        const userCompanyIds = userAreas.companies.map(c => c.id);
        const invalid = companyIds.filter(id => !userCompanyIds.includes(id));
        if (invalid.length > 0) {
          return res.status(403).json({ success: false, error: 'You can only assign companies from your areas' });
        }
      }
      await permissionService.setClientCompanies(req.params.id, companyIds);
    }

    const fullClient = await clientService.getClientById(req.params.id);
    const response: ApiResponse<any> = { success: true, data: fullClient };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

router.delete('/:id', checkVisitPermission, async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;

    // Only admin/manager/master_admin can delete clients
    if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'master_admin') {
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

router.put('/contacts/:contactId', async (req: Request, res: Response) => {
  try {
    const contact = await clientService.updateContact(req.params.contactId, req.body);
    const response: ApiResponse<any> = { success: true, data: contact };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
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

// Business card upload
router.post('/:clientId/contacts/:contactId/business-card', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Only image files and PDFs are accepted' });
    }

    const s3Key = `business-cards/${contactId}/${Date.now()}-${file.originalname}`;
    await s3Service.uploadFile(s3Key, file.buffer, file.mimetype);

    const contact = await clientService.updateContact(contactId, {
      business_card_filename: file.originalname,
      business_card_s3_key: s3Key,
      business_card_file_size: file.size,
    } as any);

    const response: ApiResponse<any> = { success: true, data: contact };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// Business card download (presigned URL)
router.get('/:clientId/contacts/:contactId/business-card/download', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const contacts = await clientService.getClientContacts(req.params.clientId);
    const contact = contacts.find(c => c.id === contactId);
    if (!contact || !contact.business_card_s3_key) {
      return res.status(404).json({ success: false, error: 'Business card not found' });
    }

    const presignedUrl = await s3Service.getDownloadUrl(contact.business_card_s3_key);
    const response: ApiResponse<any> = { success: true, data: { url: presignedUrl } };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Business card delete
router.delete('/:clientId/contacts/:contactId/business-card', async (req: Request, res: Response) => {
  try {
    const { contactId, clientId } = req.params;
    const contacts = await clientService.getClientContacts(clientId);
    const contact = contacts.find(c => c.id === contactId);
    if (!contact || !contact.business_card_s3_key) {
      return res.status(404).json({ success: false, error: 'Business card not found' });
    }

    await s3Service.deleteFile(contact.business_card_s3_key);
    await clientService.updateContact(contactId, {
      business_card_filename: null,
      business_card_s3_key: null,
      business_card_file_size: null,
    } as any);

    const response: ApiResponse<any> = { success: true, message: 'Business card deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
