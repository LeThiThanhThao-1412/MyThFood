import { Injectable } from "@nestjs/common";
import { DriverId } from "../domain/driver-id";
import {
  Driver,
  DriverStatus,
  DriverOnlineStatus,
  FatigueLevel,
} from "../domain/driver.aggregate";
import { DriverEntity } from "./driver.entity";

@Injectable()
export class DriverMapper {
  public toDomain(entity: DriverEntity): Driver {
    return Driver.rehydrate(DriverId.from(entity.id), {
      userId: entity.userId,
      fullName: entity.fullName,
      phoneNumber: entity.phoneNumber,
      email: entity.email,
      avatar: entity.avatar,
      idCardNumber: entity.idCardNumber,
      driverLicenseNumber: entity.driverLicenseNumber,
      vehicleRegistrationNumber: entity.vehicleRegistrationNumber,
      insuranceNumber: entity.insuranceNumber,
      criminalRecordUrl: entity.criminalRecordUrl,
      status: entity.status as DriverStatus,
      onlineStatus: entity.onlineStatus as DriverOnlineStatus,
      currentLatitude: entity.currentLatitude,
      currentLongitude: entity.currentLongitude,
      lastLocationUpdateAt: entity.lastLocationUpdateAt,
      totalDrivingMinutesToday: entity.totalDrivingMinutesToday,
      currentSessionStartAt: entity.currentSessionStartAt,
      consecutiveDrivingMinutes: entity.consecutiveDrivingMinutes,
      fatigueLevel: entity.fatigueLevel as FatigueLevel,
      goHomeCountToday: entity.goHomeCountToday,
      lastGoHomeAt: entity.lastGoHomeAt,
      totalOrders: entity.totalOrders,
      rating: entity.rating,
      currentOrderId: entity.currentOrderId,
      isTrainingCompleted: entity.isTrainingCompleted,
      depositAmount: entity.depositAmount,
      creditWalletBalance: entity.creditWalletBalance,
      incomeWalletBalance: entity.incomeWalletBalance,
    });
  }

  public toPersistence(domain: Driver): DriverEntity {
    const entity = new DriverEntity();
    entity.id = domain.id.toString();
    entity.userId = domain.driverUserId;
    entity.fullName = domain.driverFullName;
    entity.phoneNumber = domain.driverPhoneNumber;
    entity.email = domain.driverEmail;
    entity.avatar = domain.driverAvatar;
    entity.idCardNumber = domain.driverIdCardNumber;
    entity.driverLicenseNumber = domain.driverLicenseNumber;
    entity.vehicleRegistrationNumber = domain.driverVehicleRegistrationNumber;
    entity.insuranceNumber = domain.driverInsuranceNumber;
    entity.criminalRecordUrl = domain.driverCriminalRecordUrl;
    entity.status = domain.driverStatus;
    entity.onlineStatus = domain.driverOnlineStatus;
    entity.currentLatitude = domain.driverCurrentLatitude;
    entity.currentLongitude = domain.driverCurrentLongitude;
    entity.lastLocationUpdateAt = domain.driverLastLocationUpdateAt;
    entity.totalDrivingMinutesToday = domain.driverTotalDrivingMinutesToday;
    entity.currentSessionStartAt = domain.driverCurrentSessionStartAt;
    entity.consecutiveDrivingMinutes = domain.driverConsecutiveDrivingMinutes;
    entity.fatigueLevel = domain.driverFatigueLevel;
    entity.goHomeCountToday = domain.driverGoHomeCountToday;
    entity.lastGoHomeAt = domain.driverLastGoHomeAt;
    entity.totalOrders = domain.driverTotalOrders;
    entity.rating = domain.driverRating;
    entity.currentOrderId = domain.driverCurrentOrderId;
    entity.isTrainingCompleted = domain.driverIsTrainingCompleted;
    entity.depositAmount = domain.driverDepositAmount;
    entity.creditWalletBalance = domain.driverCreditWalletBalance;
    entity.incomeWalletBalance = domain.driverIncomeWalletBalance;
    entity.createdAt = domain.createdAt;
    entity.updatedAt = domain.updatedAt;
    return entity;
  }
}
