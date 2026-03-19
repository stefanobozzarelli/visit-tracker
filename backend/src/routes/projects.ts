import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { AppDataSource } from '../config/database';
import { Project } from '../entities/Project';
import { ApiResponse } from '../types';

const router = Router();
router.use(authMiddleware);

const repo = () => AppDataSource.getRepository(Project);

// GET all projects (with filters)
router.get('/', async (req: Request, res: Response) => {
  try {
    const { supplier_id, client_id, country, status, project_type, search } = req.query;

    let qb = repo().createQueryBuilder('p')
      .leftJoinAndSelect('p.supplier', 'supplier')
      .leftJoinAndSelect('p.client', 'client')
      .orderBy('p.project_number', 'DESC');

    if (supplier_id) qb = qb.andWhere('p.supplier_id = :supplier_id', { supplier_id });
    if (client_id) qb = qb.andWhere('p.client_id = :client_id', { client_id });
    if (country) qb = qb.andWhere('p.country = :country', { country });
    if (status) qb = qb.andWhere('p.status = :status', { status });
    if (project_type) qb = qb.andWhere('p.project_type = :project_type', { project_type });
    if (search) {
      qb = qb.andWhere(
        '(LOWER(p.project_name) LIKE LOWER(:search) OR LOWER(p.architect_designer) LIKE LOWER(:search) OR LOWER(p.developer) LIKE LOWER(:search) OR LOWER(p.contractor) LIKE LOWER(:search) OR LOWER(p.item) LIKE LOWER(:search))',
        { search: `%${search}%` }
      );
    }

    const projects = await qb.getMany();
    const response: ApiResponse<any> = { success: true, data: projects };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// GET single project
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await repo().findOne({
      where: { id: req.params.id },
      relations: ['supplier', 'client'],
    });
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });
    const response: ApiResponse<any> = { success: true, data: project };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// POST create project
router.post('/', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;
    if (!['admin', 'master_admin', 'manager'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Only admin/manager can create projects' });
    }

    // Auto-assign project_number
    const lastProject = await repo().createQueryBuilder('p')
      .orderBy('p.project_number', 'DESC')
      .getOne();
    const nextNumber = (lastProject?.project_number || 0) + 1;

    const projectData = { ...req.body, project_number: nextNumber };
    const project = new Project();
    Object.assign(project, projectData);
    const saved = await repo().save(project);

    // Reload with relations
    const result = await repo().findOne({ where: { id: (saved as any).id }, relations: ['supplier', 'client'] });
    const response: ApiResponse<any> = { success: true, data: result };
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// PUT update project
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;
    if (!['admin', 'master_admin', 'manager'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Only admin/manager can update projects' });
    }

    await repo().update(req.params.id, req.body);
    const result = await repo().findOne({ where: { id: req.params.id }, relations: ['supplier', 'client'] });
    const response: ApiResponse<any> = { success: true, data: result };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// DELETE project
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userRole = (req.user as any)?.role;
    if (!['admin', 'master_admin'].includes(userRole)) {
      return res.status(403).json({ success: false, error: 'Only admin can delete projects' });
    }

    await repo().delete(req.params.id);
    const response: ApiResponse<any> = { success: true, message: 'Project deleted' };
    res.json(response);
  } catch (error) {
    res.status(400).json({ success: false, error: (error as Error).message });
  }
});

// GET project stats
router.get('/stats/summary', async (req: Request, res: Response) => {
  try {
    const total = await repo().count();
    const active = await repo().count({ where: { status: 'ATTIVO' as any } });
    const completed = await repo().count({ where: { status: 'COMPLETATO' as any } });

    const valueResult = await repo().createQueryBuilder('p')
      .select('SUM(p.project_value)', 'total_value')
      .addSelect('SUM(p.total_value_shipped)', 'total_shipped')
      .where('p.status = :status', { status: 'ATTIVO' })
      .getRawOne();

    const response: ApiResponse<any> = {
      success: true,
      data: {
        total,
        active,
        completed,
        total_value: parseFloat(valueResult?.total_value || '0'),
        total_shipped: parseFloat(valueResult?.total_shipped || '0'),
      }
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

export default router;
