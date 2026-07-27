import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

@Entity("wallet_transactions")
export class WalletTransactionEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid")
  walletId!: string;

  @Index()
  @Column("uuid")
  ownerId!: string;

  @Index()
  @Column({ type: "varchar", length: 20 })
  ownerType!: string;

  @Column({ type: "varchar", length: 10 })
  type!: string; // CREDIT | DEBIT

  @Column("decimal", { precision: 14, scale: 2 })
  amount!: number;

  @Column("decimal", { precision: 14, scale: 2 })
  balanceBefore!: number;

  @Column("decimal", { precision: 14, scale: 2 })
  balanceAfter!: number;

  @Column({ type: "varchar", length: 255, nullable: true })
  description!: string | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  orderId!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripeTransferId!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  stripePayoutId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}