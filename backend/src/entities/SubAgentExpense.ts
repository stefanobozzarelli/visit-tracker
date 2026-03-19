import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SubAgent } from './SubAgent';

@Entity('sub_agent_expenses')
export class SubAgentExpense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  sub_agent_id: string;

  @Column({ type: 'date' })
  expense_date: string;

  @Column()
  expense_type: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => SubAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sub_agent_id' })
  sub_agent: SubAgent;

  @CreateDateColumn()
  created_at: Date;
}
