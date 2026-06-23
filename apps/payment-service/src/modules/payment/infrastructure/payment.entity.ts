import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("payments")
export class PaymentEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid")
  orderId!: string;

  @Index()
  @Column("uuid")
  consumerId!: string;

  @Index()
  @Column("uuid")
  merchantId!: string;

  @Column("decimal", { precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: "varchar", length: 50 })
  paymentMethod!: string;

  @Index()
  @Column({ type: "varchar", length: 20, default: "PENDING" })
  status!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  transactionId!: string | null;

  @Column({ type: "text", nullable: true })
  failureReason!: string | null;

  @Column({ type: "text", nullable: true })
  refundReason!: string | null;

  @Column("decimal", { precision: 12, scale: 2, nullable: true })
  refundedAmount!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
