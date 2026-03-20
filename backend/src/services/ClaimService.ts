import { AppDataSource } from '../config/database';
import { Claim } from '../entities/Claim';
import { ClaimMovement } from '../entities/ClaimMovement';
import { ClaimMovementAttachment } from '../entities/ClaimMovementAttachment';

interface ClaimFilters {
  client_id?: string;
  company_id?: string;
  status?: string;
}

export class ClaimService {
  private claimRepository = AppDataSource.getRepository(Claim);
  private movementRepository = AppDataSource.getRepository(ClaimMovement);
  private attachmentRepository = AppDataSource.getRepository(ClaimMovementAttachment);

  // --- Claim CRUD ---

  async createClaim(data: {
    client_id: string;
    company_id: string;
    date: Date;
    comments?: string;
    status?: 'open' | 'in_progress' | 'resolved' | 'closed';
    created_by_user_id: string;
  }): Promise<Claim> {
    const claim = this.claimRepository.create(data);
    const saved = await this.claimRepository.save(claim);
    return saved as Claim;
  }

  async getClaims(filters?: ClaimFilters): Promise<Claim[]> {
    let query = this.claimRepository
      .createQueryBuilder('claim')
      .leftJoinAndSelect('claim.client', 'client')
      .leftJoinAndSelect('claim.company', 'company')
      .leftJoinAndSelect('claim.created_by_user', 'created_user')
      .leftJoinAndSelect('claim.movements', 'movements')
      .leftJoinAndSelect('movements.attachments', 'attachments');

    if (filters?.client_id) {
      query = query.andWhere('claim.client_id = :clientId', { clientId: filters.client_id });
    }
    if (filters?.company_id) {
      query = query.andWhere('claim.company_id = :companyId', { companyId: filters.company_id });
    }
    if (filters?.status) {
      query = query.andWhere('claim.status = :status', { status: filters.status });
    }

    return await query.orderBy('claim.date', 'DESC').addOrderBy('claim.created_at', 'DESC').getMany();
  }

  async getClaimById(id: string): Promise<Claim | null> {
    return await this.claimRepository.findOne({
      where: { id },
      relations: ['client', 'company', 'created_by_user', 'movements', 'movements.attachments', 'movements.created_by_user'],
    });
  }

  async updateClaim(id: string, data: Partial<{
    client_id: string;
    company_id: string;
    date: Date;
    comments: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
  }>): Promise<Claim> {
    await this.claimRepository.update(id, data as any);
    const updated = await this.getClaimById(id);
    if (!updated) throw new Error('Claim not found');
    return updated;
  }

  async deleteClaim(id: string): Promise<void> {
    await this.claimRepository.delete(id);
  }

  // --- Movement CRUD ---

  async addMovement(claimId: string, data: {
    date: Date;
    action: string;
    created_by_user_id: string;
  }): Promise<ClaimMovement> {
    const movement = this.movementRepository.create({
      claim_id: claimId,
      ...data,
    });
    return await this.movementRepository.save(movement);
  }

  async getMovements(claimId: string): Promise<ClaimMovement[]> {
    return await this.movementRepository.find({
      where: { claim_id: claimId },
      relations: ['attachments', 'created_by_user'],
      order: { date: 'DESC', created_at: 'DESC' },
    });
  }

  async deleteMovement(movementId: string): Promise<void> {
    await this.movementRepository.delete(movementId);
  }

  // --- Attachment methods ---

  async addAttachment(movementId: string, userId: string, filename: string, fileSize: number, s3Key: string): Promise<ClaimMovementAttachment> {
    const attachment = this.attachmentRepository.create({
      movement_id: movementId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
    });
    return await this.attachmentRepository.save(attachment);
  }

  async getAttachment(attachmentId: string): Promise<ClaimMovementAttachment | null> {
    return await this.attachmentRepository.findOne({
      where: { id: attachmentId },
    });
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.attachmentRepository.delete(attachmentId);
  }
}
