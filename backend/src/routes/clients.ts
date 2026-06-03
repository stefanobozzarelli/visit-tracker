import { Router, Request, Response } from 'express';
import multer from 'multer';
import Anthropic from '@anthropic-ai/sdk';
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
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    let clients = await clientService.getClients();
    if (country) clients = clients.filter((c: any) => c.country === country);
    if (role) clients = clients.filter((c: any) => c.role === role);
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        clients = clients.filter(c => visibleClientIds.includes(c.id));
      }
    }
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
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    let clients = await clientService.getClients();
    if (country) clients = clients.filter((c: any) => c.country === country);
    if (role) clients = clients.filter((c: any) => c.role === role);
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        clients = clients.filter(c => visibleClientIds.includes(c.id));
      }
    }
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

// Business card upload (side = 'front' | 'back', default 'front')
router.post('/:clientId/contacts/:contactId/business-card', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const side = (req.query.side === 'back' || req.body?.side === 'back') ? 'back' : 'front';
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ success: false, error: 'Only image files and PDFs are accepted' });
    }

    const s3Key = `business-cards/${contactId}/${side}-${Date.now()}-${file.originalname}`;
    await s3Service.uploadFile(s3Key, file.buffer, file.mimetype);

    const update = side === 'back'
      ? {
          business_card_back_filename: file.originalname,
          business_card_back_s3_key: s3Key,
          business_card_back_file_size: file.size,
        }
      : {
          business_card_filename: file.originalname,
          business_card_s3_key: s3Key,
          business_card_file_size: file.size,
        };

    const contact = await clientService.updateContact(contactId, update as any);

    const response: ApiResponse<any> = { success: true, data: contact };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// OCR del biglietto da visita (fronte): estrae i campi del contatto via Claude.
// Non richiede un contatto già esistente — serve a precompilare il form.
router.post('/contacts/ocr-business-card', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'ANTHROPIC_API_KEY non configurata' });
    }

    const base64 = file.buffer.toString('base64');
    let contentBlock: any;
    if (file.mimetype === 'application/pdf') {
      contentBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } };
    } else if (['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype)) {
      const imageType = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
      contentBlock = { type: 'image', source: { type: 'base64', media_type: imageType, data: base64 } };
    } else {
      return res.status(400).json({ success: false, error: `Tipo file non supportato: ${file.mimetype}` });
    }

    const prompt = `You are a business card data extractor. Analyze this business card image and extract the contact details.
Return ONLY a JSON object — no explanation, no markdown, no code fences — in exactly this structure:
{
  "name": "full person name or empty string",
  "role": "job title / role or empty string",
  "email": "email address or empty string",
  "phone": "primary phone number (keep + and digits) or empty string",
  "wechat": "WeChat ID or empty string",
  "notes": "company name and any other useful info (address, website) or empty string"
}
Rules:
- name: the person's name, not the company.
- If there are multiple phones, pick the mobile/primary one for "phone".
- Put the COMPANY NAME and address/website into "notes".
- Leave a field as "" if not present. Do not invent data.
- Return valid JSON only.`;

    const MODELS = ['claude-opus-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-haiku-20240307'];
    const client = new Anthropic({ apiKey });
    let response: any = null;
    let lastError: any = null;
    for (const model of MODELS) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: 1024,
          messages: [{ role: 'user', content: [contentBlock, { type: 'text', text: prompt }] }],
        });
        break;
      } catch (modelErr: any) {
        lastError = modelErr;
        if (modelErr?.status === 404 || modelErr?.error?.error?.type === 'not_found_error') continue;
        throw modelErr;
      }
    }
    if (!response) throw lastError;

    const text = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ success: false, error: 'OCR: risposta non valida' });
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const fields = {
      name: typeof parsed.name === 'string' ? parsed.name : '',
      role: typeof parsed.role === 'string' ? parsed.role : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      phone: typeof parsed.phone === 'string' ? parsed.phone : '',
      wechat: typeof parsed.wechat === 'string' ? parsed.wechat : '',
      notes: typeof parsed.notes === 'string' ? parsed.notes : '',
    };
    res.json({ success: true, data: fields });
  } catch (error) {
    console.error('ocr-business-card error:', error);
    res.status(500).json({ success: false, error: 'Errore OCR: ' + (error as Error).message });
  }
});

// Business card download (presigned URL) — side = 'front' | 'back'
router.get('/:clientId/contacts/:contactId/business-card/download', async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const side = req.query.side === 'back' ? 'back' : 'front';
    const contacts = await clientService.getClientContacts(req.params.clientId);
    const contact = contacts.find(c => c.id === contactId);
    const s3Key = side === 'back' ? (contact as any)?.business_card_back_s3_key : contact?.business_card_s3_key;
    if (!contact || !s3Key) {
      return res.status(404).json({ success: false, error: 'Business card not found' });
    }

    const presignedUrl = await s3Service.getDownloadUrl(s3Key);
    const response: ApiResponse<any> = { success: true, data: { url: presignedUrl } };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// Business card delete — side = 'front' | 'back'
router.delete('/:clientId/contacts/:contactId/business-card', async (req: Request, res: Response) => {
  try {
    const { contactId, clientId } = req.params;
    const side = req.query.side === 'back' ? 'back' : 'front';
    const contacts = await clientService.getClientContacts(clientId);
    const contact = contacts.find(c => c.id === contactId);
    const s3Key = side === 'back' ? (contact as any)?.business_card_back_s3_key : contact?.business_card_s3_key;
    if (!contact || !s3Key) {
      return res.status(404).json({ success: false, error: 'Business card not found' });
    }

    await s3Service.deleteFile(s3Key);
    await clientService.updateContact(contactId, (side === 'back' ? {
      business_card_back_filename: null,
      business_card_back_s3_key: null,
      business_card_back_file_size: null,
    } : {
      business_card_filename: null,
      business_card_s3_key: null,
      business_card_file_size: null,
    }) as any);

    const response: ApiResponse<any> = { success: true, message: 'Business card deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

export default router;
