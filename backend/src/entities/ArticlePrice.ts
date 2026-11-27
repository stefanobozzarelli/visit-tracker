import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Article } from './Article';
import { PriceList } from './PriceList';

/** The price of an article in one price list: the article's price history. */
@Entity('article_prices')
@Index('idx_article_prices_unique', ['price_list_id', 'article_id'], { unique: true })
@Index(['article_id'])
export class ArticlePrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  article_id: string;

  @Column()
  price_list_id: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  price: number;

  @ManyToOne(() => Article, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'article_id' })
  article: Article;

  @ManyToOne(() => PriceList, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_list_id' })
  price_list: PriceList;
}
