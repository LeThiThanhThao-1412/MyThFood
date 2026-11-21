import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Cảnh báo/khóa nhà hàng theo tỉ lệ khiếu nại hợp lệ.
 *
 * Mỗi tuần ISO chỉ có tối đa một bản ghi cho một nhà hàng (`periodKey`), nhờ
 * vậy cron chạy hằng ngày không sinh cảnh báo trùng. Nhà hàng bấm "Đã hiểu"
 * ⇒ lưu `dismissedAt`/`dismissedBy` để cảnh báo không hiện lại trong tuần.
 */
@Entity("merchant_warnings")
@Index(["merchantId", "createdAt"])
@Index(["merchantId", "type", "periodKey"], { unique: true })
export class MerchantWarningEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", length: 100 })
  merchantId!: string;

  /** Loại cảnh báo — hiện tại chỉ có `COMPLAINT_RATE`. */
  @Column({ type: "varchar", length: 40, default: "COMPLAINT_RATE" })
  type!: string;

  /** `WARNING` (nhắc nhở, ẩn được) hoặc `LOCK` (khóa 1 tháng). */
  @Column({ type: "varchar", length: 20 })
  level!: string;

  /** Khóa tuần ISO, ví dụ `2026-W47` — chống trùng giữa các lần đánh giá. */
  @Column({ type: "varchar", length: 20 })
  periodKey!: string;

  @Column({ type: "int" })
  windowDays!: number;

  @Column({ type: "timestamptz" })
  windowStart!: Date;

  @Column({ type: "timestamptz" })
  windowEnd!: Date;

  @Column({ type: "int", default: 0 })
  totalOrders!: number;

  @Column({ type: "int", default: 0 })
  cancelledOrders!: number;

  @Column({ type: "int", default: 0 })
  totalComplaints!: number;

  @Column({ type: "int", default: 0 })
  validComplaints!: number;

  /** Tỉ lệ khiếu nại hợp lệ (0..1), 4 chữ số thập phân. */
  @Column({ type: "numeric", precision: 7, scale: 4, default: 0 })
  complaintRate!: string;

  @Column({ type: "varchar", length: 255 })
  title!: string;

  @Column({ type: "text" })
  message!: string;

  @Column({ type: "timestamptz", nullable: true })
  dismissedAt!: Date | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  dismissedBy!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
