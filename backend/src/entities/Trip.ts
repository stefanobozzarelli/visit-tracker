import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './User';

@Entity('trips')
export class Trip {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column()
  name: string;

  @Column({ type: 'varchar', length: 20 })
  startDate: string;

  @Column({ type: 'varchar', length: 20 })
  endDate: string;

  @Column({ nullable: true })
  destination: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @Column({ type: 'jsonb', default: '[]' })
  days: any[];

  @Column({ type: 'jsonb', default: '[]' })
  hotels: any[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
