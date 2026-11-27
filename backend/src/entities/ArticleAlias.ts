import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Article } from './Article';

/**
 * A code written on invoices that differs from the price list code, linked by
 * hand to the right article (e.g. "13288" on the invoice for "0013288-A").
 */
@Entity('article_aliases')
@Index('idx_article_aliases_company_code', ['company_id', 'normalized_code'], { unique: true })
export class ArticleAlias {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  company_id: string;

  @Column()
  normalized_code: string;

  @Column()
  article_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: Article;
}
