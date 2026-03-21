import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { User } from './User';

@Entity('user_countries')
@Unique('UQ_user_country', ['user_id', 'country'])
export class UserCountry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  user_id: string;

  @Column()
  country: string;

  @Column({ nullable: true })
  assigned_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, user => user.userCountries, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_by_user_id' })
  assigned_by_user: User;
}
