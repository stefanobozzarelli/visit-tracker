import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToOne, OneToMany, JoinColumn } from 'typeorm';
import { Invoice } from './Invoice';
import { InvoiceSubAgentCommission } from './InvoiceSubAgentCommission';

@Entity('invoice_commissions')
export class InvoiceCommission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  invoice_id: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  commission_rate_percent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  gross_commission: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  net_commission: number;

  @Column({ default: false })
  manual_override: boolean;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  manual_amount: number;

  @Column({
    type: 'enum',
    enum: ['aggiunta', 'controllata', 'fatturata', 'pagata', 'pagati_subagenti'],
    default: 'aggiunta',
  })
  commission_status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToOne(() => Invoice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @OneToMany(() => InvoiceSubAgentCommission, isac => isac.invoice_commission, { cascade: true })
  sub_agent_commissions: InvoiceSubAgentCommission[];
}
