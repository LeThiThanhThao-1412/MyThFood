import { Entity, PrimaryColumn, Column, Index } from "typeorm";

@Entity("order_timeline")
export class OrderTimelineEntity {
  @PrimaryColumn("uuid")
  id!: string;

  @Index()
  @Column("uuid", { name: "order_id" })
  order_id!: string;

  @Column("varchar", { length: 30, name: "previous_status", nullable: true })
  previous_status!: string | null;

  @Column("varchar", { length: 30, name: "new_status" })
  new_status!: string;

  @Column("text", { nullable: true })
  reason!: string | null;

  @Column("timestamptz", { name: "occurred_at" })
  occurred_at!: Date;
}
