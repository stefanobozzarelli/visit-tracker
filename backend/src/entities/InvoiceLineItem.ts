import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Invoice } from './Invoice';

@Entity('invoice_line_items')
export class InvoiceLineItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  invoice_id: string;

  @Column({ default: 0 })
  line_number: number;

  @Column({ nullable: true })
  article_code: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantity: number;

  @Column({ default: 'pz' })
  unit: string; // m2, pz, ml, kg, lt, etc.

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  unit_price: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discount_percent: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  line_total: number;

  @Column({ type: 'text', nullable: true })
  raw_text: string;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Invoice, invoice => invoice.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;
}
