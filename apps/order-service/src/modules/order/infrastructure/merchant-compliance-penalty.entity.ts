import { Entity, PrimaryColumn, Column, CreateDateColumn } from "typeorm";

/**
 * Nhật ký các hình phạt leo thang đã áp dụng cho nhà hàng (phục vụ kiểm toán
 * và hiển thị cho admin).
 */
@Entity("merchant_compliance_penalties")
export class MerchantCompliancePenaltyEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid", name: "merchant_id" })
  merchant_id!: string;

  @Column({ type: "integer" })
  level!: number;

  @Column({ type: "varchar", length: 20 })
  type!: string;

  @Column({ type: "decimal", precision: 12, scale: 2, nullable: true })
  amount!: number | null;

  @Column({ type: "text" })
  reason!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;
}
