import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { User } from './User';
import { Client } from './Client';
import { Company } from './Company';
import { ClaimMovement } from './ClaimMovement';

@Entity('claims')
export class Claim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  client_id: string;

  @Column()
  company_id: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'text', nullable: true })
  comments: string;

  @Column({
    type: 'enum',
    enum: ['open', 'in_progress', 'resolved', 'closed'],
    default: 'open',
  })
  status: 'open' | 'in_progress' | 'resolved' | 'closed';

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  // Relations
  @ManyToOne(() => Client, { eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, { eager: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => ClaimMovement, movement => movement.claim, { cascade: true })
  movements: ClaimMovement[];
}
