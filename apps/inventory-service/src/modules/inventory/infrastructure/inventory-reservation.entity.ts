import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('inventory_reservations')
export class InventoryReservationEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid', { name: 'inventory_id' })
  inventory_id!: string;

  @Column('uuid', { name: 'order_id' })
  order_id!: string;

  @Column('int')
  quantity!: number;

  @CreateDateColumn({ name: 'reserved_at' })
  reserved_at!: Date;

  @Column('timestamptz', { name: 'expires_at' })
  expires_at!: Date;
}