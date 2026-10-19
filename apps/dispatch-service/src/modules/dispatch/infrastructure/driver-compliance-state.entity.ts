import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Lưu bậc khiếu nại hiện tại của tài xế để:
 * - Không mở case lặp lại cùng một bậc.
 * - Biết bậc kế tiếp cần leo lên khi tỉ lệ vẫn vượt ngưỡng.
 */
@Entity("driver_compliance_states")
export class DriverComplianceStateEntity {
  @PrimaryColumn({ type: "uuid", name: "driver_id" })
  driver_id!: string;

  @Column({ type: "integer", default: 0 })
  complaint_level!: number;

  @Column({ type: "timestamptz", name: "last_complaint_at", nullable: true })
  last_complaint_at!: Date | null;

  @Column({
    type: "numeric",
    precision: 6,
    scale: 4,
    name: "last_bad_rate",
    nullable: true,
  })
  last_bad_rate!: string | number | null;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updated_at!: Date;
}
