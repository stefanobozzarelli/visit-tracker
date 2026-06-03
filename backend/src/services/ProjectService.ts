import { AppDataSource } from '../config/database';
import { Project } from '../entities/Project';
import { Offer } from '../entities/Offer';
import { ProjectAttachment } from '../entities/ProjectAttachment';
import { ProjectMovement } from '../entities/ProjectMovement';
import { ProjectMovementAttachment } from '../entities/ProjectMovementAttachment';

export class ProjectService {
  private projectRepo = AppDataSource.getRepository(Project);
  private offerRepo = AppDataSource.getRepository(Offer);
  private attachmentRepo = AppDataSource.getRepository(ProjectAttachment);
  private movementRepo = AppDataSource.getRepository(ProjectMovement);
  private movementAttachmentRepo = AppDataSource.getRepository(ProjectMovementAttachment);

  /**
   * Recalculate a project's value as the sum of its linked offers' totals,
   * unless the value has been manually overridden (project_value_manual = true).
   */
  async recalcValue(projectId: string): Promise<void> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) return;
    if (project.project_value_manual) return; // user overrode it — leave alone

    const offers = await this.offerRepo.find({ where: { project_id: projectId } });
    const total = offers.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    await this.projectRepo.update(projectId, { project_value: total });
  }

  /** Sum of the linked offers' totals (regardless of manual flag). */
  async getOffersTotal(projectId: string): Promise<number> {
    const offers = await this.offerRepo.find({ where: { project_id: projectId } });
    return offers.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  }

  // ─── Attachments ───────────────────────────────────────────────────────────
  async addAttachment(projectId: string, data: { filename: string; file_size: number; s3_key: string; uploaded_by_user_id: string }): Promise<ProjectAttachment> {
    const att = this.attachmentRepo.create({ ...data, project_id: projectId });
    return this.attachmentRepo.save(att) as unknown as Promise<ProjectAttachment>;
  }

  async getAttachments(projectId: string): Promise<ProjectAttachment[]> {
    return this.attachmentRepo.find({
      where: { project_id: projectId },
      relations: ['uploaded_by_user'],
      order: { created_at: 'DESC' },
    });
  }

  async getAttachment(id: string): Promise<ProjectAttachment | null> {
    return this.attachmentRepo.findOne({ where: { id } });
  }

  async deleteAttachment(id: string): Promise<void> {
    await this.attachmentRepo.delete(id);
  }

  // ─── Movements ───────────────────────────────────────────────────────────
  async addMovement(projectId: string, data: { date: Date; action: string; created_by_user_id: string }): Promise<ProjectMovement> {
    const mov = this.movementRepo.create({ ...data, project_id: projectId });
    return this.movementRepo.save(mov) as unknown as Promise<ProjectMovement>;
  }

  async getMovements(projectId: string): Promise<ProjectMovement[]> {
    return this.movementRepo.find({
      where: { project_id: projectId },
      relations: ['created_by_user', 'attachments', 'attachments.uploaded_by_user'],
      order: { date: 'DESC', created_at: 'DESC' },
    });
  }

  async getMovement(id: string): Promise<ProjectMovement | null> {
    return this.movementRepo.findOne({ where: { id } });
  }

  async updateMovement(id: string, data: Partial<{ date: Date; action: string }>): Promise<void> {
    await this.movementRepo.update(id, data);
  }

  async deleteMovement(id: string): Promise<void> {
    await this.movementRepo.delete(id);
  }

  // ─── Movement Attachments ──────────────────────────────────────────────────
  async addMovementAttachment(movementId: string, data: { filename: string; file_size: number; s3_key: string; uploaded_by_user_id: string }): Promise<ProjectMovementAttachment> {
    const att = this.movementAttachmentRepo.create({ ...data, movement_id: movementId });
    return this.movementAttachmentRepo.save(att) as unknown as Promise<ProjectMovementAttachment>;
  }

  async getMovementAttachment(id: string): Promise<ProjectMovementAttachment | null> {
    return this.movementAttachmentRepo.findOne({ where: { id } });
  }

  async deleteMovementAttachment(id: string): Promise<void> {
    await this.movementAttachmentRepo.delete(id);
  }
}
