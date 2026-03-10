import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { VisitReport } from './VisitReport';
import { User } from './User';

@Entity('visit_attachments')
export class VisitAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_report_id: string;

  @Column()
  filename: string;

  @Column()
  file_size: number;

  @Column()
  s3_key: string; // Path in S3 bucket

  @Column()
  uploaded_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => VisitReport, report => report.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_report_id' })
  visit_report: VisitReport;

  @ManyToOne(() => User, user => user.attachments)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
