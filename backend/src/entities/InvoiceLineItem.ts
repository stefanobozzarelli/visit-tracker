import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Invoice } from './Invoice';
import { Article } from './Article';

@Entity('invoice_line_items')
@Index(['article_id'])
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

  // Article of the supplier's price list this line refers to (matched on article_code)
  @Column({ type: 'uuid', nullable: true })
  article_id: string | null;

  // List price of the article valid on the invoice date, kept to measure the discount
  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  list_price: number | null;

  // matched | alias | unmatched | no_code (null = not checked yet)
  @Column({ type: 'varchar', nullable: true })
  match_status: string | null;

  @CreateDateColumn()
  created_at: Date;

  // Relations
  @ManyToOne(() => Invoice, invoice => invoice.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice: Invoice;

  @ManyToOne(() => Article, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'article_id' })
  article: Article;
}
