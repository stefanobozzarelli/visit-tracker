import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Company } from './Company';
import { PriceList } from './PriceList';

/**
 * One article of a supplier (azienda), identified by the supplier's own code.
 * normalized_code (upper case, no spaces/dots/dashes/slashes) is what invoice
 * lines are matched on.
 */
@Entity('articles')
@Index('idx_articles_company_code', ['company_id', 'normalized_code'], { unique: true })
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @Column()
  code: string;

  @Column()
  normalized_code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  unit: string | null;

  // Price from the most recent price list that contains the article
  @Column({ type: 'decimal', precision: 14, scale: 4, nullable: true })
  list_price: number | null;

  @Column({ type: 'uuid', nullable: true })
  price_list_id: string | null;

  // Other columns of the price list (collection, size, pieces per box, ...)
  @Column({ type: 'jsonb', nullable: true })
  extra: Record<string, any> | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => PriceList, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'price_list_id' })
  price_list: PriceList;
}
