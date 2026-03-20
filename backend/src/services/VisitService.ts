import { AppDataSource } from '../config/database';
import { Visit } from '../entities/Visit';
import { VisitReport } from '../entities/VisitReport';
import { VisitAttachment } from '../entities/VisitAttachment';
import { VisitDirectAttachment } from '../entities/VisitDirectAttachment';
import { CreateVisitRequest, CreateVisitReportRequest } from '../types';

export class VisitService {
  private visitRepository = AppDataSource.getRepository(Visit);
  private reportRepository = AppDataSource.getRepository(VisitReport);
  private attachmentRepository = AppDataSource.getRepository(VisitAttachment);
  private directAttachmentRepository = AppDataSource.getRepository(VisitDirectAttachment);

  async createVisit(userId: string, data: CreateVisitRequest): Promise<Visit> {
    const visit = this.visitRepository.create({
      client_id: data.client_id,
      visited_by_user_id: userId,
      visit_date: new Date(data.visit_date),
      status: (data as any).status || 'scheduled',
      preparation: (data as any).preparation || null,
    });
    const savedVisit = await this.visitRepository.save(visit);

    // Create reports for each company
    for (const reportData of data.reports) {
      await this.addReport(savedVisit.id, reportData);
    }

    return this.getVisitById(savedVisit.id) as Promise<Visit>;
  }

  async updateVisit(id: string, data: Partial<{
    visit_date: Date;
    status: 'scheduled' | 'completed' | 'cancelled';
    preparation: string | null;
    client_id: string;
  }>): Promise<Visit> {
    await this.visitRepository.update(id, data as any);
    const updated = await this.getVisitById(id);
    if (!updated) throw new Error('Visit not found');
    return updated;
  }

  async getVisits(filters?: { client_id?: string; user_id?: string; status?: string }): Promise<Visit[]> {
    let query = this.visitRepository.createQueryBuilder('visit')
      .leftJoinAndSelect('visit.client', 'client')
      .leftJoinAndSelect('visit.visited_by_user', 'user')
      .leftJoinAndSelect('visit.reports', 'reports')
      .leftJoinAndSelect('reports.company', 'company')
      .leftJoinAndSelect('reports.attachments', 'attachments')
      .leftJoinAndSelect('visit.direct_attachments', 'direct_attachments');

    if (filters?.client_id) {
      query = query.where('visit.client_id = :client_id', { client_id: filters.client_id });
    }
    if (filters?.user_id) {
      query = query.andWhere('visit.visited_by_user_id = :user_id', { user_id: filters.user_id });
    }
    if (filters?.status) {
      query = query.andWhere('visit.status = :status', { status: filters.status });
    }

    return await query.orderBy('visit.visit_date', 'DESC').getMany();
  }

  async getVisitById(id: string): Promise<Visit | null> {
    return await this.visitRepository.findOne({
      where: { id },
      relations: ['client', 'visited_by_user', 'reports', 'reports.company', 'reports.attachments', 'direct_attachments', 'direct_attachments.uploaded_by_user'],
    });
  }

  async addReport(visitId: string, data: CreateVisitReportRequest): Promise<VisitReport> {
    const report = this.reportRepository.create({
      visit_id: visitId,
      company_id: data.company_id,
      section: data.section,
      content: data.content,
    });
    return await this.reportRepository.save(report);
  }

  async updateReport(reportId: string, data: Partial<CreateVisitReportRequest>): Promise<VisitReport> {
    await this.reportRepository.update(reportId, data);
    const updated = await this.reportRepository.findOne({ where: { id: reportId } });
    if (!updated) throw new Error('Report not found');
    return updated;
  }

  async deleteReport(reportId: string): Promise<void> {
    await this.reportRepository.delete(reportId);
  }

  async addAttachment(
    reportId: string,
    userId: string,
    filename: string,
    fileSize: number,
    s3Key: string
  ): Promise<VisitAttachment> {
    const attachment = this.attachmentRepository.create({
      visit_report_id: reportId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
    });
    return await this.attachmentRepository.save(attachment);
  }

  async deleteAttachment(attachmentId: string): Promise<void> {
    await this.attachmentRepository.delete(attachmentId);
  }

  async getAttachment(attachmentId: string): Promise<VisitAttachment | null> {
    return await this.attachmentRepository.findOne({ where: { id: attachmentId } });
  }

  async canDeleteVisit(visitId: string): Promise<{ canDelete: boolean; reportCount: number }> {
    // Check if visit exists
    const visit = await this.visitRepository.findOne({ where: { id: visitId } });
    if (!visit) {
      throw new Error('Visit not found');
    }

    // Count reports for this visit
    const reportCount = await this.reportRepository.countBy({ visit_id: visitId });

    return {
      canDelete: reportCount === 0,
      reportCount,
    };
  }

  async deleteVisit(visitId: string): Promise<void> {
    const visit = await this.visitRepository.findOne({ where: { id: visitId } });
    if (!visit) {
      throw new Error('Visit not found');
    }

    await this.visitRepository.delete(visitId);
  }

  // --- Direct Attachment Methods ---

  async addDirectAttachment(visitId: string, userId: string, filename: string, fileSize: number, s3Key: string): Promise<VisitDirectAttachment> {
    const attachment = this.directAttachmentRepository.create({
      visit_id: visitId,
      uploaded_by_user_id: userId,
      filename,
      file_size: fileSize,
      s3_key: s3Key,
    });
    return await this.directAttachmentRepository.save(attachment);
  }

  async getDirectAttachments(visitId: string): Promise<VisitDirectAttachment[]> {
    return await this.directAttachmentRepository.find({
      where: { visit_id: visitId },
      relations: ['uploaded_by_user'],
      order: { created_at: 'DESC' },
    });
  }

  async getDirectAttachment(attachmentId: string): Promise<VisitDirectAttachment | null> {
    return await this.directAttachmentRepository.findOne({ where: { id: attachmentId } });
  }

  async deleteDirectAttachment(attachmentId: string): Promise<void> {
    await this.directAttachmentRepository.delete(attachmentId);
  }
}
