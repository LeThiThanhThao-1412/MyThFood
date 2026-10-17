import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from "typeorm";

/**
 * Lưu bậc phạt leo thang hiện tại của từng nhà hàng để:
 * - Không phạt lặp lại cùng 1 bậc.
 * - Biết bậc kế tiếp cần leo lên.
 */
@Entity("merchant_compliance_states")
export class MerchantComplianceStateEntity {
  @PrimaryColumn({ type: "uuid", name: "merchant_id" })
  merchant_id!: string;

  @Column({ type: "integer", default: 0 })
  penalty_level!: number;

  @Column({ type: "timestamptz", nullable: true })
  last_penalty_at!: Date | null;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;
}
