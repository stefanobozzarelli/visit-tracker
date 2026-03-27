import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Client } from './Client';
import { Company } from './Company';
import { Project } from './Project';
import { OpportunityAdvance } from './OpportunityAdvance';
import { OpportunityAttachment } from './OpportunityAttachment';

@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  client_id: string;

  @Column()
  company_id: string;

  @Column({ nullable: true })
  project_id: string;

  @Column({
    type: 'enum',
    enum: ['new', 'qualifying', 'proposal', 'negotiation', 'won', 'lost'],
    default: 'new',
  })
  status: 'new' | 'qualifying' | 'proposal' | 'negotiation' | 'won' | 'lost';

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  estimated_value: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => Client, { eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, { eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Project, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => OpportunityAdvance, advance => advance.opportunity, { cascade: true })
  advances: OpportunityAdvance[];

  @OneToMany(() => OpportunityAttachment, attachment => attachment.opportunity, { cascade: true })
  attachments: OpportunityAttachment[];
}
