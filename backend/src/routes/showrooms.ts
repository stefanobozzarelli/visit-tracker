import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { ShowroomService } from '../services/ShowroomService';
import { S3Service } from '../services/S3Service';
import { PdfService } from '../services/PdfService';
import { ExcelService } from '../services/ExcelService';
import { PermissionService } from '../services/PermissionService';

const router = Router();
const showroomService = new ShowroomService();
const permissionService = new PermissionService();
const s3Service = new S3Service();
const pdfService = new PdfService();
const excelService = new ExcelService();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authMiddleware);

router.post('/export-pdf', async (req: Request, res: Response) => {
  try {
    const { clientId, companyId, status, area } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const filters: any = {};
    if (clientId) filters.client_id = clientId;
    if (companyId) filters.company_id = companyId;
    if (status) filters.status = status;
    if (area) filters.area = area;
    let showrooms = await showroomService.getShowrooms(filters);
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        showrooms = showrooms.filter((s: any) => s.client_id && visibleClientIds.includes(s.client_id));
      }
    }
    const buffer = await pdfService.generateShowroomsPdf(showrooms, { title: 'Showrooms Report', generatedAt: new Date() });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=showrooms-report.pdf');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

router.post('/export-excel', async (req: Request, res: Response) => {
  try {
    const { clientId, companyId, status, area } = req.body;
    const userId = (req.user as any)?.id;
    const userRole = (req.user as any)?.role;
    const filters: any = {};
    if (clientId) filters.client_id = clientId;
    if (companyId) filters.company_id = companyId;
    if (status) filters.status = status;
    if (area) filters.area = area;
    let showrooms = await showroomService.getShowrooms(filters);
    // Permission-based filtering for non-admin users
    if (userRole !== 'master_admin' && userRole !== 'admin' && userRole !== 'manager') {
      const visibleClientIds = await permissionService.getVisibleClients(userId);
      if (!visibleClientIds.includes('*')) {
        showrooms = showrooms.filter((s: any) => s.client_id && visibleClientIds.includes(s.client_id));
      }
    }
    const buffer = excelService.generateShowroomsExcel(showrooms);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=showrooms-report.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// SHOWROOM CRUD
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const showroom = await showroomService.createShowroom({
      ...req.body,
      created_by_user_id: userId,
    });
    res.json({ success: true, data: showroom });
  } catch (err: any) {
    console.error('Error creating showroom:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: any = {};
    if (req.query.clientId) filters.client_id = req.query.clientId;
    if (req.query.companyId) filters.company_id = req.query.companyId;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.area) filters.area = req.query.area;
    if (req.query.city) filters.city = req.query.city;
    const showrooms = await showroomService.getShowrooms(filters);
    res.json({ success: true, data: showrooms });
  } catch (err: any) {
    console.error('Error getting showrooms:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const showroom = await showroomService.getShowroomById(req.params.id);
    if (!showroom) return res.status(404).json({ success: false, error: 'Showroom not found' });
    res.json({ success: true, data: showroom });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const showroom = await showroomService.updateShowroom(req.params.id, req.body);
    res.json({ success: true, data: showroom });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await showroomService.deleteShowroom(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ALBUM CRUD
router.post('/:id/albums', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const album = await showroomService.createAlbum({
      showroom_id: req.params.id,
      ...req.body,
      created_by_user_id: userId,
    });
    res.json({ success: true, data: album });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/albums', async (req: Request, res: Response) => {
  try {
    const albums = await showroomService.getAlbums(req.params.id);
    res.json({ success: true, data: albums });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id/albums/:albumId', async (req: Request, res: Response) => {
  try {
    const album = await showroomService.updateAlbum(req.params.albumId, req.body);
    res.json({ success: true, data: album });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/albums/:albumId', async (req: Request, res: Response) => {
  try {
    // Get all photos in album to delete from S3
    const album = await showroomService.getAlbumById(req.params.albumId);
    if (album && album.photos) {
      for (const photo of album.photos) {
        try { await s3Service.deleteFile(photo.s3_key); } catch {}
      }
    }
    await showroomService.deleteAlbum(req.params.albumId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PHOTO CRUD
router.post('/:id/albums/:albumId/photos', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const ext = file.originalname.split('.').pop() || 'jpg';
    const s3Key = `showroom-photos/${uuidv4()}.${ext}`;
    await s3Service.uploadFile(s3Key, file.buffer, file.mimetype);

    const photo = await showroomService.addPhoto({
      album_id: req.params.albumId,
      filename: file.originalname,
      file_size: file.size,
      s3_key: s3Key,
      uploaded_by_user_id: userId,
    });

    res.json({ success: true, data: photo });
  } catch (err: any) {
    console.error('Error uploading photo:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/albums/:albumId/photos/:photoId/download', async (req: Request, res: Response) => {
  try {
    const photo = await showroomService.getPhoto(req.params.photoId);
    if (!photo) return res.status(404).json({ success: false, error: 'Photo not found' });
    const url = await s3Service.getDownloadUrl(photo.s3_key);
    res.json({ success: true, data: { url } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id/albums/:albumId/photos/:photoId', async (req: Request, res: Response) => {
  try {
    const photo = await showroomService.getPhoto(req.params.photoId);
    if (!photo) return res.status(404).json({ success: false, error: 'Photo not found' });
    try { await s3Service.deleteFile(photo.s3_key); } catch {}
    await showroomService.deletePhoto(req.params.photoId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
