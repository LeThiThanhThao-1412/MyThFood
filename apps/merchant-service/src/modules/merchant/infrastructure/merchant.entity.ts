import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('merchants')
export class MerchantEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo_url!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  cover_image_url!: string | null;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'text' })
  address!: string;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status!: string;

  @Column({ type: 'float', default: 0 })
  rating!: number;

  @Column({ type: 'integer', default: 0 })
  total_orders!: number;

  @Column({ type: 'simple-json', nullable: true })
  capacity_config!: { maxConcurrentOrders: number; prepTimePerOrder: number } | null;

  @Column({ type: 'varchar', length: 20, default: 'NORMAL' })
  capacity_status!: string;

  @Column({ type: 'integer', default: 0 })
  current_order_count!: number;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at!: Date;

  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deleted_at!: Date | null;
}