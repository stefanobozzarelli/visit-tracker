import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

// A holiday added by hand (a country's lunar holiday not in the library,
// an extra office closure day, a correction...). country: ISO code, e.g. IT, KH.
@Entity('custom_holidays')
export class CustomHoliday {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 2 })
  country: string;

  @Column({ type: 'date' })
  date: string;

  @Column()
  name: string;

  @Column({ type: 'uuid', nullable: true })
  created_by: string | null;

  @CreateDateColumn()
  created_at: Date;
}
