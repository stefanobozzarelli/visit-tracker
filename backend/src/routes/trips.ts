import { Router, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { TripService } from '../services/TripService';
import { Request } from 'express';

const router = Router();
const tripService = new TripService();

// GET all trips — admins see all, sales_rep see only their own
router.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const trips = await tripService.getTrips(req.user!.id, req.user!.role);
    res.json({ success: true, data: trips });
  } catch (e) {
    console.error('GET /trips error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET single trip
router.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const trip = await tripService.getTripById(req.params.id, req.user!.id, req.user!.role);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, data: trip });
  } catch (e) {
    console.error('GET /trips/:id error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST create trip
router.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const trip = await tripService.createTrip(req.body, req.user!.id);
    res.status(201).json({ success: true, data: trip });
  } catch (e) {
    console.error('POST /trips error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT update trip
router.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const trip = await tripService.updateTrip(req.params.id, req.body, req.user!.id, req.user!.role);
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, data: trip });
  } catch (e) {
    console.error('PUT /trips/:id error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// DELETE trip
router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const deleted = await tripService.deleteTrip(req.params.id, req.user!.id, req.user!.role);
    if (!deleted) return res.status(404).json({ success: false, message: 'Trip not found' });
    res.json({ success: true, message: 'Trip deleted' });
  } catch (e) {
    console.error('DELETE /trips/:id error:', e);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
