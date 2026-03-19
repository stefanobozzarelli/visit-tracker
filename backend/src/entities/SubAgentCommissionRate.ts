import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { SubAgent } from './SubAgent';
import { Company } from './Company';
import { Client } from './Client';

@Entity('sub_agent_commission_rates')
export class SubAgentCommissionRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sub_agent_id: string;

  @Column()
  company_id: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  client_id: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  rate_percent: number;

  @Column({ type: 'enum', enum: ['gross', 'residual'], default: 'gross' })
  calc_on: string;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => SubAgent, sa => sa.rates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sub_agent_id' })
  sub_agent: SubAgent;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;
}
