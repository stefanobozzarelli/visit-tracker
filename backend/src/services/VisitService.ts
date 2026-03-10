import { AppDataSource } from '../config/database';
import { Visit } from '../entities/Visit';
import { VisitReport } from '../entities/VisitReport';
import { VisitAttachment } from '../entities/VisitAttachment';
import { CreateVisitRequest, CreateVisitReportRequest } from '../types';

export class VisitService {
  private visitRepository = AppDataSource.getRepository(Visit);
  private reportRepository = AppDataSource.getRepository(VisitReport);
  private attachmentRepository = AppDataSource.getRepository(VisitAttachment);

  async createVisit(userId: string, data: CreateVisitRequest): Promise<Visit> {
    const visit = this.visitRepository.create({
      client_id: data.client_id,
      visited_by_user_id: userId,
      visit_date: new Date(data.visit_date),
    });
    const savedVisit = await this.visitRepository.save(visit);

    // Create reports for each company
    for (const reportData of data.reports) {
      await this.addReport(savedVisit.id, reportData);
    }

    return this.getVisitById(savedVisit.id) as Promise<Visit>;
  }

  async getVisits(filters?: { client_id?: string; user_id?: string }): Promise<Visit[]> {
    let query = this.visitRepository.createQueryBuilder('visit')
      .leftJoinAndSelect('visit.client', 'client')
      .leftJoinAndSelect('visit.visited_by_user', 'user')
      .leftJoinAndSelect('visit.reports', 'reports')
      .leftJoinAndSelect('reports.company', 'company')
      .leftJoinAndSelect('reports.attachments', 'attachments');

    if (filters?.client_id) {
      query = query.where('visit.client_id = :client_id', { client_id: filters.client_id });
    }
    if (filters?.user_id) {
      query = query.andWhere('visit.visited_by_user_id = :user_id', { user_id: filters.user_id });
    }

    return await query.orderBy('visit.visit_date', 'DESC').getMany();
  }

  async getVisitById(id: string): Promise<Visit | null> {
    return await this.visitRepository.findOne({
      where: { id },
      relations: ['client', 'visited_by_user', 'reports', 'reports.company', 'reports.attachments'],
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
    // Check if visit exists
    const visit = await this.visitRepository.findOne({ where: { id: visitId } });
    if (!visit) {
      throw new Error('Visit not found');
    }

    // Delete the visit (cascade will delete all reports and attachments)
    await this.visitRepository.delete(visitId);
  }
}
