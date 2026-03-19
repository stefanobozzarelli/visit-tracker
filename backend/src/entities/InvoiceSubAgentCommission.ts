import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { InvoiceCommission } from './InvoiceCommission';
import { SubAgent } from './SubAgent';

@Entity('invoice_sub_agent_commissions')
export class InvoiceSubAgentCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoice_commission_id: string;

  @Column()
  sub_agent_id: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  rate_percent: number;

  @Column({ type: 'enum', enum: ['gross', 'residual'], default: 'gross' })
  calc_on: string;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  amount: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => InvoiceCommission, ic => ic.sub_agent_commissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_commission_id' })
  invoice_commission: InvoiceCommission;

  @ManyToOne(() => SubAgent, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sub_agent_id' })
  sub_agent: SubAgent;
}
