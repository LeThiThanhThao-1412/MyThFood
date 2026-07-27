import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  Index,
} from "typeorm";

@Entity("wallets")
export class WalletEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid")
  ownerId!: string;

  @Index()
  @Column({ type: "varchar", length: 20 })
  ownerType!: string;

  @Column("decimal", { precision: 14, scale: 2, default: 0 })
  balance!: number;

  @Column({ type: "varchar", length: 10, default: "VND" })
  currency!: string;

  // FIX #9: Optimistic locking - prevents race conditions on balance updates
  @VersionColumn()
  version!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}