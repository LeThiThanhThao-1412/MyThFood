import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("dispatches")
export class DispatchEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  @Index("idx_dispatch_order_id")
  orderId!: string;

  @Column({ type: "uuid" })
  @Index("idx_dispatch_merchant_id")
  merchantId!: string;

  @Column({ type: "double precision", default: 10.77 })
  merchantLatitude!: number;

  @Column({ type: "double precision", default: 106.7 })
  merchantLongitude!: number;

  @Column({ type: "text" })
  deliveryAddress!: string;

  @Column({ type: "double precision" })
  deliveryLatitude!: number;

  @Column({ type: "double precision" })
  deliveryLongitude!: number;

  /** Phương thức giao hàng: SAVER | FAST | PRIORITY. */
  @Column({ type: "varchar", length: 20, default: "FAST" })
  deliveryOption!: string;

  /** Thứ tự ưu tiên điều phối (SAVER 0, FAST 1, PRIORITY 2). */
  @Column({ type: "smallint", default: 1 })
  priorityRank!: number;

  /** Thời điểm cam kết giao hàng (SLA). */
  @Column({ type: "timestamptz", nullable: true })
  promisedDeliveryAt!: Date | null;

  /** Mã lô gộp đơn (Phase 2 — SAVER stacking). */
  @Column({ type: "uuid", nullable: true })
  batchId!: string | null;

  /** Thứ tự điểm dừng trong lô (Phase 2 — SAVER stacking). */
  @Column({ type: "int", nullable: true })
  routeSequence!: number | null;

  /** Số đơn tối đa tài xế được giữ khi nhận đơn này (SAVER: 3). */
  @Column({ type: "int", default: 1 })
  maxStackedOrders!: number;

  /** Timeout chờ tài xế nhận đơn (giây) — chụp lại từ cấu hình lúc tạo. */
  @Column({ type: "int", default: 300 })
  dispatchTimeoutSeconds!: number;

  /** Timeout chờ tài xế phản hồi sau khi được gán (giây). */
  @Column({ type: "int", default: 60 })
  driverResponseTimeoutSeconds!: number;

  @Column({ type: "varchar", length: 50 })
  @Index("idx_dispatch_status")
  status!: string;

  @Column({ type: "uuid", nullable: true })
  @Index("idx_dispatch_driver_id")
  driverId!: string | null;

  @Column({ type: "jsonb", default: "[]" })
  matchedDriverIds!: string[];

  @Column({ type: "int", default: 0 })
  retryCount!: number;

  @Column({ type: "text", nullable: true })
  declineReason!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  declineReasonType!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  pickedUpAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  expiresAt!: Date | null;

  @Column({ type: "text", nullable: true })
  cancellationReason!: string | null;

  @Column({ type: "text", nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
