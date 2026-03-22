import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Showroom } from './Showroom';
import { User } from './User';
import { ShowroomPhoto } from './ShowroomPhoto';

@Entity('showroom_photo_albums')
export class ShowroomPhotoAlbum {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  showroom_id: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column()
  created_by_user_id: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Showroom, showroom => showroom.albums, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'showroom_id' })
  showroom: Showroom;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by_user_id' })
  created_by_user: User;

  @OneToMany(() => ShowroomPhoto, photo => photo.album, { cascade: true })
  photos: ShowroomPhoto[];
}
