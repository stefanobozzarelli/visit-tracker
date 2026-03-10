import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CustomerOrder } from './CustomerOrder';

@Entity('customer_order_items')
export class CustomerOrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  order_id: string;

  @Column()
  article_code: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ nullable: true })
  format: string; // es: A4, A3, custom dimensions, ecc.

  @Column()
  unit_of_measure: string; // pezzi, kg, litri, etc.

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2
  })
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2
  })
  unit_price: number;

  @Column({
    type: 'text',
    nullable: true,
    default: null
  })
  discount: string; // Campo testuale libero per sconto (es: "50+10", "10%", ecc)

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    asExpression: `"quantity" * "unit_price"`,
    generatedType: 'STORED'
  })
  total_line: number; // Calcolato: quantity * unit_price (il discount è solo testo libero)

  @CreateDateColumn()
  created_at: Date;

  // Relazioni
  @ManyToOne(() => CustomerOrder, order => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: CustomerOrder;
}
