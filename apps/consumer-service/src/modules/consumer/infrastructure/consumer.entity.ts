import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from "typeorm";

@Entity("consumers")
@Index(["user_id"], { unique: true })
export class ConsumerEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "varchar", length: 36 })
  user_id!: string;

  @Column({ type: "varchar", length: 200 })
  full_name!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  avatar!: string | null;

  @Column({ type: "date", nullable: true })
  date_of_birth!: Date | null;

  @Column({ type: "varchar", length: 10, nullable: true })
  gender!: string | null;

  @Column({ type: "jsonb", default: "[]" })
  addresses!: string;

  @Column({ type: "jsonb", default: "[]" })
  payment_methods!: string;

  @Column({ type: "jsonb", default: "[]" })
  favorite_merchant_ids!: string;

  @Column({ type: "jsonb", default: "[]" })
  favorite_menu_item_ids!: string;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updated_at!: Date;

  @DeleteDateColumn({ type: "timestamptz", nullable: true })
  deleted_at!: Date | null;
}
