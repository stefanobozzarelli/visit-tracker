import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CompanyVisit } from './CompanyVisit';
import { User } from './User';

@Entity('company_visit_attachments')
export class CompanyVisitAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_visit_id: string;

  @Column()
  filename: string;

  @Column()
  file_size: number;

  @Column()
  s3_key: string;

  @Column({ default: 'post_visit' })
  attachment_type: 'pre_visit' | 'post_visit';

  @Column()
  uploaded_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => CompanyVisit, visit => visit.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_visit_id' })
  company_visit: CompanyVisit;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
