import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("order_items")
export class OrderItemEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column("uuid", { name: "order_id" })
  order_id!: string;

  @Column("uuid", { name: "menu_item_id" })
  menu_item_id!: string;

  @Column("varchar", { length: 255 })
  name!: string;

  @Column("int")
  quantity!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "unit_price" })
  unit_price!: number;

  @Column("decimal", { precision: 12, scale: 2 })
  subtotal!: number;

  @Column("text", { name: "special_instructions", nullable: true })
  special_instructions!: string | null;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;
}
