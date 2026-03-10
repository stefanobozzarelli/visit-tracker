import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Visit } from './Visit';
import { Company } from './Company';
import { Client } from './Client';
import { CustomerOrderItem } from './CustomerOrderItem';

export enum OrderStatus {
  DRAFT = 'draft',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed'
}

@Entity('customer_orders')
export class CustomerOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  visit_id: string;

  @Column()
  supplier_id: string; // Azienda che fornisce

  @Column()
  supplier_name: string; // Nome azienda (denormalizzato per tracciabilità storica)

  @Column()
  client_id: string;

  @Column()
  client_name: string; // Denormalizzato per tracciabilità storica

  @Column({ type: 'date' })
  order_date: Date;

  @Column({ nullable: true })
  payment_method: string; // bonifico, carta, contanti, ecc.

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.DRAFT
  })
  status: OrderStatus;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0
  })
  total_amount: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relazioni
  @ManyToOne(() => Visit, visit => visit.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visit_id' })
  visit: Visit;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'supplier_id' })
  supplier: Company;

  @ManyToOne(() => Client)
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @OneToMany(() => CustomerOrderItem, item => item.order, { cascade: true })
  items: CustomerOrderItem[];
}
