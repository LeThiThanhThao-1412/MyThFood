import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MerchantEntity } from './merchant.entity';

@Entity('operating_hours')
export class OperatingHoursEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  merchant_id!: string;

  @Column({ type: 'integer' })
  day_of_week!: number;

  @Column({ type: 'time', nullable: true })
  open_time!: string | null;

  @Column({ type: 'time', nullable: true })
  close_time!: string | null;

  @Column({ type: 'boolean', default: false })
  is_closed!: boolean;

  @Column({ type: 'date', nullable: true })
  special_date!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @ManyToOne(() => MerchantEntity)
  @JoinColumn({ name: 'merchant_id' })
  merchant!: MerchantEntity;
}