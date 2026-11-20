import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";

/**
 * Bảng lưu lịch sử vị trí GPS của tài xế.
 * Mỗi lần tài xế cập nhật vị trí (mô phỏng hoặc thật) sẽ ghi thêm 1 dòng,
 * phục vụ việc theo dõi quãng đường / kiểm chứng cơ chế "ghi nhận GPS mỗi 5s".
 */
@Entity("driver_location_history")
@Index(["driverId"])
@Index(["driverId", "recordedAt"])
export class DriverLocationHistoryEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  driverId!: string;

  /** Đơn đang giao tại thời điểm ghi vị trí (nếu có). */
  @Column({ type: "uuid", nullable: true })
  orderId!: string | null;

  @Column({ type: "decimal", precision: 10, scale: 7 })
  latitude!: number;

  @Column({ type: "decimal", precision: 10, scale: 7 })
  longitude!: number;

  @CreateDateColumn({ type: "timestamptz" })
  recordedAt!: Date;
}
