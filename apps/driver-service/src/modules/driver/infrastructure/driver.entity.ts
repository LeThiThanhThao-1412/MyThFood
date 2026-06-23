import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import {
  DriverStatus,
  DriverOnlineStatus,
  FatigueLevel,
} from "../domain/driver.aggregate";

@Entity("drivers")
@Index(["userId"], { unique: true })
@Index(["status"])
@Index(["onlineStatus"])
@Index(["fatigueLevel"])
export class DriverEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  userId!: string;

  @Column({ type: "varchar", length: 255 })
  fullName!: string;

  @Column({ type: "varchar", length: 20 })
  phoneNumber!: string;

  @Column({ type: "varchar", length: 255 })
  email!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  avatar!: string | null;

  @Column({ type: "varchar", length: 20 })
  idCardNumber!: string;

  @Column({ type: "varchar", length: 30 })
  driverLicenseNumber!: string;

  @Column({ type: "varchar", length: 30 })
  vehicleRegistrationNumber!: string;

  @Column({ type: "varchar", length: 30 })
  insuranceNumber!: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  criminalRecordUrl!: string | null;

  @Column({ type: "enum", enum: DriverStatus, default: DriverStatus.INACTIVE })
  status!: DriverStatus;

  @Column({
    type: "enum",
    enum: DriverOnlineStatus,
    default: DriverOnlineStatus.OFFLINE,
  })
  onlineStatus!: DriverOnlineStatus;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  currentLatitude!: number | null;

  @Column({ type: "decimal", precision: 10, scale: 7, nullable: true })
  currentLongitude!: number | null;

  @Column({ type: "timestamptz", nullable: true })
  lastLocationUpdateAt!: Date | null;

  @Column({ type: "int", default: 0 })
  totalDrivingMinutesToday!: number;

  @Column({ type: "timestamptz", nullable: true })
  currentSessionStartAt!: Date | null;

  @Column({ type: "int", default: 0 })
  consecutiveDrivingMinutes!: number;

  @Column({ type: "enum", enum: FatigueLevel, default: FatigueLevel.NORMAL })
  fatigueLevel!: FatigueLevel;

  @Column({ type: "int", default: 0 })
  goHomeCountToday!: number;

  @Column({ type: "timestamptz", nullable: true })
  lastGoHomeAt!: Date | null;

  @Column({ type: "int", default: 0 })
  totalOrders!: number;

  @Column({ type: "decimal", precision: 3, scale: 2, default: 0 })
  rating!: number;

  @Column({ type: "int", default: 0 })
  totalRatings!: number;

  @Column({ type: "uuid", nullable: true })
  currentOrderId!: string | null;

  @Column({ type: "boolean", default: false })
  isTrainingCompleted!: boolean;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  depositAmount!: number;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  creditWalletBalance!: number;

  @Column({ type: "decimal", precision: 12, scale: 2, default: 0 })
  incomeWalletBalance!: number;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
