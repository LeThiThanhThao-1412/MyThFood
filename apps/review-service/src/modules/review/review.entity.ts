import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("reviews")
export class ReviewEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  orderId!: string;

  @Column({ type: "uuid" })
  consumerId!: string;

  @Column({ type: "uuid" })
  merchantId!: string;

  @Column({ type: "uuid", nullable: true })
  driverId!: string | null;

  @Column({ type: "int", nullable: true })
  driverRating!: number | null;

  @Column({ type: "text", nullable: true })
  driverComment!: string | null;

  @Column({ type: "int" })
  rating!: number;

  @Column({ type: "text", nullable: true })
  comment!: string | null;

  @Column({ type: "jsonb", nullable: true })
  tags!: string[];

  @Column({ type: "jsonb", nullable: true })
  images!: string[] | null;

  @Column({ type: "text", nullable: true })
  merchantReply!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
