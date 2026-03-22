import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Client } from './Client';
import { Company } from './Company';
import { User } from './User';
import { ShowroomPhotoAlbum } from './ShowroomPhotoAlbum';

@Entity('showrooms')
export class Showroom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  client_id: string;

  @Column({ nullable: true })
  company_id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: 'none' })
  status: 'open' | 'closed' | 'opening' | 'none';

  @Column({ type: 'varchar', nullable: true })
  type: 'shop_in_shop' | 'dedicated' | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  sqm: number;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ nullable: true })
  city: string;

  @Column({ nullable: true })
  province: string;

  @Column({ nullable: true })
  area: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToOne(() => Client, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @ManyToOne(() => Company, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => ShowroomPhotoAlbum, album => album.showroom, { cascade: true })
  albums: ShowroomPhotoAlbum[];
}
