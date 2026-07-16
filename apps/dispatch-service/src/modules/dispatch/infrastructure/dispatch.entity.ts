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

  @Column({ type: "text" })
  deliveryAddress!: string;

  @Column({ type: "double precision" })
  deliveryLatitude!: number;

  @Column({ type: "double precision" })
  deliveryLongitude!: number;

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
