import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { MenuItemEntity } from './menu-item.entity';

@Entity('price_history')
export class PriceHistoryEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ type: 'uuid' })
  menu_item_id!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  old_price!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  new_price!: number;

  @Column({ type: 'uuid', nullable: true })
  changed_by!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at!: Date;

  @ManyToOne(() => MenuItemEntity)
  @JoinColumn({ name: 'menu_item_id' })
  menuItem!: MenuItemEntity;
}