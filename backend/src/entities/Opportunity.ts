import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Client } from './Client';
import { Company } from './Company';
import { Visit } from './Visit';
import { VisitReport } from './VisitReport';
import { OpportunityAdvance } from './OpportunityAdvance';
import { OpportunityAttachment } from './OpportunityAttachment';

@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  title: string;

  @Column()
  client_id: string;

  @Column()
  company_id: string;

  @Column({ nullable: true })
  visit_id: string;

  @Column({ nullable: true })
  report_id: string;

  @Column({ default: 'open' })
  status: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  estimated_value: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  currency: string;

  @Column({ type: 'date', nullable: true })
  expected_close_date: Date;

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

  @ManyToOne(() => Visit, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @ManyToOne(() => VisitReport, { eager: true, nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'report_id' })
  report: VisitReport;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => OpportunityAdvance, advance => advance.opportunity, { cascade: true })
  advances: OpportunityAdvance[];

  @OneToMany(() => OpportunityAttachment, attachment => attachment.opportunity, { cascade: true })
  attachments: OpportunityAttachment[];
}
