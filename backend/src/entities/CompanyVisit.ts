import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Company } from './Company';
import { CompanyVisitAttachment } from './CompanyVisitAttachment';

@Entity('company_visits')
export class CompanyVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @Column({ type: 'date' })
  date: Date;

  @Column()
  subject: string;

  @Column({ type: 'text', nullable: true })
  report: string | null;

  @Column({ type: 'text', nullable: true })
  preparation: string | null;

  @Column({ type: 'text', nullable: true })
  participants_user_ids: string | null; // JSON array of user IDs

  @Column({ type: 'text', nullable: true })
  participants_external: string | null; // Free text for external participants

  @Column({
    type: 'enum',
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled',
  })
  status: 'scheduled' | 'completed' | 'cancelled';

  @Column({ default: 'in_person' })
  meeting_type: 'in_person' | 'call' | 'video_call';

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => Company, { eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => CompanyVisitAttachment, attachment => attachment.company_visit, { cascade: true })
  attachments: CompanyVisitAttachment[];
}
