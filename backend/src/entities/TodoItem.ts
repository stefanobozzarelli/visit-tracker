import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Client } from './Client';
import { Company } from './Company';
import { VisitReport } from './VisitReport';
import { TodoAttachment } from './TodoAttachment';
import { Claim } from './Claim';

@Entity('todo_items')
export class TodoItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: ['todo', 'in_progress', 'done'], default: 'todo' })
  status: 'todo' | 'in_progress' | 'done';

  @Column({ type: 'date', nullable: true })
  due_date: Date | null;

  @Column()
  assigned_to_user_id: string;

  @Column()
  created_by_user_id: string;

  @Column()
  client_id: string;

  @Column()
  company_id: string;

  @Column({ nullable: true })
  visit_report_id: string | null;

  @Column({ nullable: true })
  claim_id: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_to_user_id' })
  assigned_to_user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @ManyToOne(() => Client, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => VisitReport, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_report_id' })
  visit_report: VisitReport | null;

  @ManyToOne(() => Claim, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'claim_id' })
  claim: Claim | null;

  @OneToMany(() => TodoAttachment, attachment => attachment.todo, { cascade: true })
  attachments: TodoAttachment[];
}
