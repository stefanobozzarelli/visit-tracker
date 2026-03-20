import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Client } from './Client';
import { User } from './User';
import { VisitReport } from './VisitReport';
import { CustomerOrder } from './CustomerOrder';
import { VisitDirectAttachment } from './VisitDirectAttachment';

@Entity('visits')
export class Visit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  client_id: string;

  @Column()
  visited_by_user_id: string;

  @Column({ type: 'date' })
  visit_date: Date;

  @Column({
    type: 'enum',
    enum: ['scheduled', 'completed', 'cancelled'],
    default: 'scheduled',
  })
  status: 'scheduled' | 'completed' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  preparation: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Client, client => client.visits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => User, user => user.visits)
  @JoinColumn({ name: 'visited_by_user_id' })
  visited_by_user: User;

  @OneToMany(() => VisitReport, report => report.visit, { cascade: true })
  reports: VisitReport[];

  @OneToMany(() => CustomerOrder, order => order.visit, { cascade: true })
  orders: CustomerOrder[];

  @OneToMany(() => VisitDirectAttachment, attachment => attachment.visit, { cascade: true })
  direct_attachments: VisitDirectAttachment[];
}
