import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Cảnh báo biến động giá bất thường (thay đổi > 50%).
 * Được sinh tự động khi ghi nhận một thay đổi giá vượt ngưỡng.
 */
@Entity("price_alerts")
export class PriceAlertEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  @Index()
  merchant_id!: string;

  @Column({ type: "uuid" })
  menu_item_id!: string;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  old_price!: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  new_price!: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  change_percent!: number;

  @Column({ type: "text", nullable: true })
  message!: string | null;

  @Column({ type: "boolean", default: false })
  is_read!: boolean;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
