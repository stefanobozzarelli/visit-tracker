import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Client } from './Client';

@Entity('client_relationships')
@Unique('UQ_client_relationship', ['from_client_id', 'to_client_id'])
export class ClientRelationship {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  from_client_id: string;

  @Column({ type: 'uuid' })
  to_client_id: string;

  @Column({ type: 'varchar', length: 50, default: 'referral' })
  relationship_type: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Client, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'from_client_id' })
  from_client: Client;

  @ManyToOne(() => Client, { onDelete: 'CASCADE', eager: false })
  @JoinColumn({ name: 'to_client_id' })
  to_client: Client;
}
