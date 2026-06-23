import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('inventories')
export class InventoryEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'menu_item_id' })
  menu_item_id!: string;

  @Column('uuid', { name: 'merchant_id' })
  merchant_id!: string;

  @Column('int', { name: 'total_quantity', default: 0 })
  total_quantity!: number;

  @Column('int', { name: 'available_quantity', default: 0 })
  available_quantity!: number;

  @Column('int', { name: 'reserved_quantity', default: 0 })
  reserved_quantity!: number;

  @Column('int', { name: 'low_stock_threshold', default: 5 })
  low_stock_threshold!: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at!: Date;
}