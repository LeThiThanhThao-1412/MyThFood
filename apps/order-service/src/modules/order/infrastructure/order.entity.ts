import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from "typeorm";

@Entity("orders")
export class OrderEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Column("uuid", { name: "consumer_id" })
  consumer_id!: string;

  @Column("uuid", { name: "merchant_id" })
  merchant_id!: string;

  @Column("varchar", { length: 20, name: "order_type" })
  order_type!: string;

  @Column("varchar", { length: 30 })
  status!: string;

  @Column("decimal", { precision: 12, scale: 2 })
  subtotal!: number;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    name: "delivery_fee",
    default: 0,
  })
  delivery_fee!: number;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    name: "service_fee",
    default: 0,
  })
  service_fee!: number;

  @Column("decimal", { precision: 12, scale: 2, default: 0 })
  discount!: number;

  @Column("decimal", { precision: 12, scale: 2, name: "total_amount" })
  total_amount!: number;

  @Column("text", { name: "delivery_address", nullable: true })
  delivery_address!: string | null;

  @Column("decimal", {
    precision: 10,
    scale: 7,
    name: "delivery_latitude",
    nullable: true,
  })
  delivery_latitude!: number | null;

  @Column("decimal", {
    precision: 10,
    scale: 7,
    name: "delivery_longitude",
    nullable: true,
  })
  delivery_longitude!: number | null;

  @Column("timestamptz", { name: "estimated_delivery_time", nullable: true })
  estimated_delivery_time!: Date | null;

  @Column("text", { nullable: true })
  notes!: string | null;

  @Column("uuid", { name: "driver_id", nullable: true })
  driver_id!: string | null;

  @Column("text", { name: "cancel_reason", nullable: true })
  cancel_reason!: string | null;

  @Column("text", { name: "rejection_reason", nullable: true })
  rejection_reason!: string | null;

  @CreateDateColumn({ name: "created_at" })
  created_at!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updated_at!: Date;

  @DeleteDateColumn({ name: "deleted_at" })
  deleted_at!: Date | null;
}
