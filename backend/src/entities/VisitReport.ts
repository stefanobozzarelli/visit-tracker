import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Visit } from './Visit';
import { Company } from './Company';
import { VisitAttachment } from './VisitAttachment';

@Entity('visit_reports')
export class VisitReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @Column()
  company_id: string;

  @Column()
  section: string; // e.g., "Analisi", "Proposte", "Problemi"

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'enum', enum: ['draft', 'submitted', 'approved'], default: 'draft' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Visit, visit => visit.reports, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @ManyToOne(() => Company, company => company.reports)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @OneToMany(() => VisitAttachment, attachment => attachment.visit_report, { cascade: true })
  attachments: VisitAttachment[];
}
