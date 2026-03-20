import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Visit } from './Visit';
import { User } from './User';

@Entity('visit_direct_attachments')
export class VisitDirectAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @Column()
  filename: string;

  @Column()
  file_size: number;

  @Column()
  s3_key: string;

  @Column()
  uploaded_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Visit, visit => visit.direct_attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
