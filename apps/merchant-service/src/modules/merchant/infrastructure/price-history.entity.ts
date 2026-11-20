import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { MenuItemEntity } from "./menu-item.entity";

export const PRICE_HISTORY_STATUSES = [
  "RECORDED",
  "AUDITED",
  "FLAGGED",
] as const;
export type PriceHistoryStatus = (typeof PRICE_HISTORY_STATUSES)[number];

export const PRICE_HISTORY_TYPES = ["MANUAL", "FLASH_SALE"] as const;
export type PriceHistoryType = (typeof PRICE_HISTORY_TYPES)[number];

@Entity("price_history")
export class PriceHistoryEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  merchant_id!: string;

  @Column({ type: "uuid" })
  menu_item_id!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  menu_item_name!: string | null;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  old_price!: number;

  @Column({ type: "decimal", precision: 10, scale: 2 })
  new_price!: number;

  @Column({ type: "uuid", nullable: true })
  changed_by!: string | null;

  @Column({ type: "text", nullable: true })
  reason!: string | null;

  @Column({ type: "varchar", length: 20, default: "RECORDED" })
  status!: PriceHistoryStatus;

  @Column({ type: "varchar", length: 20, default: "MANUAL" })
  type!: PriceHistoryType;

  @CreateDateColumn({ type: "timestamptz" })
  created_at!: Date;

  @ManyToOne(() => MenuItemEntity)
  @JoinColumn({ name: "menu_item_id" })
  menuItem!: MenuItemEntity;
}
