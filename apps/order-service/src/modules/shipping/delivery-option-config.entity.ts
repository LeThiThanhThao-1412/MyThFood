import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Cấu hình phương thức giao hàng do admin chỉnh (Phase 3).
 * Một dòng cho mỗi option: SAVER / FAST / PRIORITY.
 */
@Entity("delivery_option_configs")
export class DeliveryOptionConfigEntity {
  @PrimaryColumn({ type: "varchar", length: 20 })
  option!: string;

  @Column("numeric", {
    precision: 6,
    scale: 3,
    name: "fee_factor",
    default: 1,
  })
  fee_factor!: number;

  @Column("numeric", {
    precision: 12,
    scale: 2,
    name: "fixed_surcharge",
    default: 0,
  })
  fixed_surcharge!: number;

  @Column("numeric", {
    precision: 12,
    scale: 2,
    name: "min_fee",
    default: 8000,
  })
  min_fee!: number;

  @Column("numeric", {
    precision: 12,
    scale: 2,
    name: "max_fee",
    default: 80000,
  })
  max_fee!: number;

  @Column("int", { name: "prep_minutes", default: 15 })
  prep_minutes!: number;

  @Column("int", { name: "eta_buffer_minutes", default: 5 })
  eta_buffer_minutes!: number;

  @Column("int", { name: "dispatch_timeout_seconds", default: 300 })
  dispatch_timeout_seconds!: number;

  @Column("int", { name: "driver_response_timeout_seconds", default: 60 })
  driver_response_timeout_seconds!: number;

  @Column("int", { name: "max_stacked_orders", default: 1 })
  max_stacked_orders!: number;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updated_at!: Date;
}
