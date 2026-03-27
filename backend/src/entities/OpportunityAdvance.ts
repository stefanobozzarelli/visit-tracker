import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Opportunity } from './Opportunity';
import { User } from './User';
import { OpportunityAdvanceAttachment } from './OpportunityAdvanceAttachment';

@Entity('opportunity_advances')
export class OpportunityAdvance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  opportunity_id: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'text' })
  description: string;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Opportunity, opportunity => opportunity.advances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => OpportunityAdvanceAttachment, attachment => attachment.advance, { cascade: true })
  attachments: OpportunityAdvanceAttachment[];
}
