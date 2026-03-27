import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { OpportunityAdvance } from './OpportunityAdvance';
import { User } from './User';

@Entity('opportunity_advance_attachments')
export class OpportunityAdvanceAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  advance_id: string;

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

  // Relations
  @ManyToOne(() => OpportunityAdvance, advance => advance.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'advance_id' })
  advance: OpportunityAdvance;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'uploaded_by_user_id' })
  uploaded_by_user: User;
}
