import { AppDataSource } from '../config/database';
import { Opportunity } from '../entities/Opportunity';
import { OpportunityAdvance } from '../entities/OpportunityAdvance';
import { OpportunityAttachment } from '../entities/OpportunityAttachment';
import { OpportunityAdvanceAttachment } from '../entities/OpportunityAdvanceAttachment';

interface OpportunityFilters {
  client_id?: string;
  company_id?: string;
  visit_id?: string;
  report_id?: string;
  status?: string;
}

export class OpportunityService {
  private opportunityRepository = AppDataSource.getRepository(Opportunity);
  private advanceRepository = AppDataSource.getRepository(OpportunityAdvance);
  private attachmentRepository = AppDataSource.getRepository(OpportunityAttachment);
  private advanceAttachmentRepository = AppDataSource.getRepository(OpportunityAdvanceAttachment);

  // --- Opportunity CRUD ---

  async createOpportunity(data: {
    name: string;
    client_id: string;
    company_id: string;
    visit_id?: string;
    report_id?: string;
    status?: 'new' | 'qualifying' | 'proposal' | 'negotiation' | 'won' | 'lost';
    estimated_value?: number;
    notes?: string;
    created_by_user_id: string;
  }): Promise<Opportunity> {
    const opportunity = this.opportunityRepository.create(data);
    const saved = await this.opportunityRepository.save(opportunity);
    return saved as Opportunity;
  }

  async getOpportunities(filters?: OpportunityFilters): Promise<Opportunity[]> {
    let query = this.opportunityRepository
      .createQueryBuilder('opportunity')
      .leftJoinAndSelect('opportunity.client', 'client')
      .leftJoinAndSelect('opportunity.company', 'company')
      .leftJoinAndSelect('opportunity.visit', 'visit')
      .leftJoinAndSelect('opportunity.report', 'report')
      .leftJoinAndSelect('opportunity.created_by_user', 'created_user')
      .leftJoinAndSelect('opportunity.advances', 'advances')
      .leftJoinAndSelect('advances.attachments', 'advance_attachments')
      .leftJoinAndSelect('opportunity.attachments', 'attachments');

    if (filters?.client_id) {
      query = query.andWhere('opportunity.client_id = :clientId', { clientId: filters.client_id });
    }
    if (filters?.company_id) {
      query = query.andWhere('opportunity.company_id = :companyId', { companyId: filters.company_id });
    }
    if (filters?.visit_id) {
      query = query.andWhere('opportunity.visit_id = :visitId', { visitId: filters.visit_id });
    }
    if (filters?.report_id) {
      query = query.andWhere('opportunity.report_id = :reportId', { reportId: filters.report_id });
    }
    if (filters?.status) {
      query = query.andWhere('opportunity.status = :status', { status: filters.status });
    }

    return await query.orderBy('opportunity.created_at', 'DESC').getMany();
  }

  async getOpportunityById(id: string): Promise<Opportunity | null> {
    return await this.opportunityRepository.findOne({
      where: { id },
      relations: ['client', 'company', 'visit', 'report', 'report.company', 'report.attachments', 'created_by_user', 'advances', 'advances.attachments', 'advances.created_by_user', 'attachments'],
    });
  }

  async updateOpportunity(id: string, data: Partial<{
    name: string;
    client_id: string;
    company_id: string;
    visit_id: string;
    report_id: string;
    status: 'new' | 'qualifying' | 'proposal' | 'negotiation' | 'won' | 'lost';
    estimated_value: number;
    notes: string;
  }>): Promise<Opportunity> {
    await this.opportunityRepository.update(id, data as any);
    const updated = await this.getOpportunityById(id);
    if (!updated) throw new Error('Opportunity not found');
    return updated;
  }

  async deleteOpportunity(id: string): Promise<void> {
    await this.opportunityRepository.delete(id);
  }

  // --- Advance CRUD ---

  async addAdvance(opportunityId: string, data: {
    date: Date;
    description: string;
    created_by_user_id: string;
  }): Promise<OpportunityAdvance> {
    const advance = this.advanceRepository.create({
      opportunity_id: opportunityId,
      ...data,
    });
    return await this.advanceRepository.save(advance);
  }

  async getAdvances(opportunityId: string): Promise<OpportunityAdvance[]> {
    return await this.advanceRepository.find({
      where: { opportunity_id: opportunityId },
      relations: ['attachments', 'created_by_user'],
      order: { date: 'DESC', created_at: 'DESC' },
    });
  }

  async updateAdvance(advanceId: string, data: { date?: Date; description?: string }): Promise<OpportunityAdvance> {
    await this.advanceRepository.update(advanceId, data as any);
    const updated = await this.advanceRepository.findOne({ where: { id: advanceId }, relations: ['attachments', 'created_by_user'] });
    if (!updated) throw new Error('Advance not found');
    return updated;
  }

  async deleteAdvance(advanceId: string): Promise<void> {
    await this.advanceRepository.delete(advanceId);
  }

  // --- Opportunity Attachment methods ---

  async addAttachment(opportunityId: string, userId: string, filename: string, fileSize: number, s3Key: string): Promise<OpportunityAttachment> {
    const attachment = this.attachmentRepository.create({
      opportunity_id: opportunityId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
    });
    return await this.attachmentRepository.save(attachment);
  }

  async getAttachment(attachmentId: string): Promise<OpportunityAttachment | null> {
    return await this.attachmentRepository.findOne({
      where: { id: attachmentId },
    });
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.attachmentRepository.delete(attachmentId);
  }

  // --- Advance Attachment methods ---

  async addAdvanceAttachment(advanceId: string, userId: string, filename: string, fileSize: number, s3Key: string): Promise<OpportunityAdvanceAttachment> {
    const attachment = this.advanceAttachmentRepository.create({
      advance_id: advanceId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
    });
    return await this.advanceAttachmentRepository.save(attachment);
  }

  async getAdvanceAttachment(attachmentId: string): Promise<OpportunityAdvanceAttachment | null> {
    return await this.advanceAttachmentRepository.findOne({
      where: { id: attachmentId },
    });
  }

  async deleteAdvanceAttachment(attachmentId: string): Promise<void> {
    await this.advanceAttachmentRepository.delete(attachmentId);
  }
}
