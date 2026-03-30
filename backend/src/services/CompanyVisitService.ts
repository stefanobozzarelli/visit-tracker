import { AppDataSource } from '../config/database';
import { CompanyVisit } from '../entities/CompanyVisit';
import { CompanyVisitAttachment } from '../entities/CompanyVisitAttachment';

interface CompanyVisitFilters {
  company_id?: string;
  company_ids?: string[];
  status?: string;
  country?: string;
}

export class CompanyVisitService {
  private visitRepository = AppDataSource.getRepository(CompanyVisit);
  private attachmentRepository = AppDataSource.getRepository(CompanyVisitAttachment);

  // --- CRUD ---

  async createVisit(data: {
    company_id: string;
    date: Date;
    subject: string;
    report?: string;
    preparation?: string;
    participants_user_ids?: string;
    participants_external?: string;
    status?: 'scheduled' | 'completed' | 'cancelled';
    meeting_type?: 'in_person' | 'call' | 'video_call';
    created_by_user_id: string;
  }): Promise<CompanyVisit> {
    const visit = this.visitRepository.create(data);
    return await this.visitRepository.save(visit);
  }

  async getVisits(filters?: CompanyVisitFilters): Promise<CompanyVisit[]> {
    let query = this.visitRepository
      .createQueryBuilder('cv')
      .leftJoinAndSelect('cv.company', 'company')
      .leftJoinAndSelect('cv.created_by_user', 'created_user')
      .leftJoinAndSelect('cv.attachments', 'attachments');

    if (filters?.company_ids && filters.company_ids.length > 0) {
      query = query.andWhere('cv.company_id IN (:...companyIds)', { companyIds: filters.company_ids });
    } else if (filters?.company_id) {
      query = query.andWhere('cv.company_id = :companyId', { companyId: filters.company_id });
    }
    if (filters?.status) {
      query = query.andWhere('cv.status = :status', { status: filters.status });
    }
    if (filters?.country) {
      query = query.andWhere('company.country = :country', { country: filters.country });
    }

    return await query.orderBy('cv.date', 'DESC').addOrderBy('cv.created_at', 'DESC').getMany();
  }

  async getVisitById(id: string): Promise<CompanyVisit | null> {
    return await this.visitRepository.findOne({
      where: { id },
      relations: ['company', 'created_by_user', 'attachments', 'attachments.uploaded_by_user'],
    });
  }

  async updateVisit(id: string, data: Partial<{
    company_id: string;
    date: Date;
    subject: string;
    report: string;
    preparation: string;
    participants_user_ids: string;
    participants_external: string;
    status: 'scheduled' | 'completed' | 'cancelled';
    meeting_type: 'in_person' | 'call' | 'video_call';
  }>): Promise<CompanyVisit> {
    await this.visitRepository.update(id, data as any);
    const updated = await this.getVisitById(id);
    if (!updated) throw new Error('Company visit not found');
    return updated;
  }

  async deleteVisit(id: string): Promise<void> {
    await this.visitRepository.delete(id);
  }

  // --- Attachment methods ---

  async addAttachment(visitId: string, userId: string, filename: string, fileSize: number, s3Key: string, attachmentType: string = 'post_visit'): Promise<CompanyVisitAttachment> {
    const attachment = this.attachmentRepository.create({
      company_visit_id: visitId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
      attachment_type: attachmentType as any,
    });
    return await this.attachmentRepository.save(attachment);
  }

  async getAttachments(visitId: string): Promise<CompanyVisitAttachment[]> {
    return await this.attachmentRepository.find({
      where: { company_visit_id: visitId },
      relations: ['uploaded_by_user'],
      order: { created_at: 'DESC' },
    });
  }

  async getAttachment(attachmentId: string): Promise<CompanyVisitAttachment | null> {
    return await this.attachmentRepository.findOne({
      where: { id: attachmentId },
    });
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.attachmentRepository.delete(attachmentId);
  }
}
