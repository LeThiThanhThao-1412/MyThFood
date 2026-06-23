import {
  AggregateRoot,
  BusinessRuleViolationError,
} from "@mythfood/shared-kernel";
import { DriverId } from "./driver-id";
import { DriverOnlineStatusChangedEvent } from "./events/driver-online-status-changed.event";

export enum DriverStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}

export enum DriverOnlineStatus {
  ONLINE = "ONLINE",
  OFFLINE = "OFFLINE",
}

export enum FatigueLevel {
  NORMAL = "NORMAL",
  WARNING = "WARNING",
  CRITICAL = "CRITICAL",
}

const MAX_GO_HOME_PER_DAY = 2;
const MAX_CONSECUTIVE_DRIVING_MINUTES = 360; // 6h
const FATIGUE_WARNING_MINUTES = 300; // 5h

export class Driver extends AggregateRoot<DriverId> {
  private _userId: string;
  private _fullName: string;
  private _phoneNumber: string;
  private _email: string;
  private _avatar: string | null;
  private _idCardNumber: string;
  private _driverLicenseNumber: string;
  private _vehicleRegistrationNumber: string;
  private _insuranceNumber: string;
  private _criminalRecordUrl: string | null;
  private _status: DriverStatus;
  private _onlineStatus: DriverOnlineStatus;
  private _currentLatitude: number | null;
  private _currentLongitude: number | null;
  private _lastLocationUpdateAt: Date | null;
  private _totalDrivingMinutesToday: number;
  private _currentSessionStartAt: Date | null;
  private _consecutiveDrivingMinutes: number;
  private _fatigueLevel: FatigueLevel;
  private _goHomeCountToday: number;
  private _lastGoHomeAt: Date | null;
  private _totalOrders: number;
  private _rating: number;
  private _currentOrderId: string | null;
  private _isTrainingCompleted: boolean;
  private _depositAmount: number;
  private _creditWalletBalance: number;
  private _incomeWalletBalance: number;

  private constructor(
    id: DriverId,
    props: {
      userId: string;
      fullName: string;
      phoneNumber: string;
      email: string;
      avatar: string | null;
      idCardNumber: string;
      driverLicenseNumber: string;
      vehicleRegistrationNumber: string;
      insuranceNumber: string;
      criminalRecordUrl: string | null;
      status: DriverStatus;
      onlineStatus: DriverOnlineStatus;
      currentLatitude: number | null;
      currentLongitude: number | null;
      lastLocationUpdateAt: Date | null;
      totalDrivingMinutesToday: number;
      currentSessionStartAt: Date | null;
      consecutiveDrivingMinutes: number;
      fatigueLevel: FatigueLevel;
      goHomeCountToday: number;
      lastGoHomeAt: Date | null;
      totalOrders: number;
      rating: number;
      currentOrderId: string | null;
      isTrainingCompleted: boolean;
      depositAmount: number;
      creditWalletBalance: number;
      incomeWalletBalance: number;
    },
  ) {
    super(id);
    this._userId = props.userId;
    this._fullName = props.fullName;
    this._phoneNumber = props.phoneNumber;
    this._email = props.email;
    this._avatar = props.avatar;
    this._idCardNumber = props.idCardNumber;
    this._driverLicenseNumber = props.driverLicenseNumber;
    this._vehicleRegistrationNumber = props.vehicleRegistrationNumber;
    this._insuranceNumber = props.insuranceNumber;
    this._criminalRecordUrl = props.criminalRecordUrl;
    this._status = props.status;
    this._onlineStatus = props.onlineStatus;
    this._currentLatitude = props.currentLatitude;
    this._currentLongitude = props.currentLongitude;
    this._lastLocationUpdateAt = props.lastLocationUpdateAt;
    this._totalDrivingMinutesToday = props.totalDrivingMinutesToday;
    this._currentSessionStartAt = props.currentSessionStartAt;
    this._consecutiveDrivingMinutes = props.consecutiveDrivingMinutes;
    this._fatigueLevel = props.fatigueLevel;
    this._goHomeCountToday = props.goHomeCountToday;
    this._lastGoHomeAt = props.lastGoHomeAt;
    this._totalOrders = props.totalOrders;
    this._rating = props.rating;
    this._currentOrderId = props.currentOrderId;
    this._isTrainingCompleted = props.isTrainingCompleted;
    this._depositAmount = props.depositAmount;
    this._creditWalletBalance = props.creditWalletBalance;
    this._incomeWalletBalance = props.incomeWalletBalance;
  }

  // ===================== Factory Methods =====================

  public static create(props: {
    userId: string;
    fullName: string;
    phoneNumber: string;
    email: string;
    idCardNumber: string;
    driverLicenseNumber: string;
    vehicleRegistrationNumber: string;
    insuranceNumber: string;
    criminalRecordUrl?: string;
  }): Driver {
    const driverId = DriverId.create();
    const now = new Date();

    return new Driver(driverId, {
      userId: props.userId,
      fullName: props.fullName,
      phoneNumber: props.phoneNumber,
      email: props.email,
      avatar: null,
      idCardNumber: props.idCardNumber,
      driverLicenseNumber: props.driverLicenseNumber,
      vehicleRegistrationNumber: props.vehicleRegistrationNumber,
      insuranceNumber: props.insuranceNumber,
      criminalRecordUrl: props.criminalRecordUrl ?? null,
      status: DriverStatus.INACTIVE,
      onlineStatus: DriverOnlineStatus.OFFLINE,
      currentLatitude: null,
      currentLongitude: null,
      lastLocationUpdateAt: null,
      totalDrivingMinutesToday: 0,
      currentSessionStartAt: null,
      consecutiveDrivingMinutes: 0,
      fatigueLevel: FatigueLevel.NORMAL,
      goHomeCountToday: 0,
      lastGoHomeAt: null,
      totalOrders: 0,
      rating: 0,
      currentOrderId: null,
      isTrainingCompleted: false,
      depositAmount: 0,
      creditWalletBalance: 0,
      incomeWalletBalance: 0,
    });
  }

  public static rehydrate(
    id: DriverId,
    props: {
      userId: string;
      fullName: string;
      phoneNumber: string;
      email: string;
      avatar: string | null;
      idCardNumber: string;
      driverLicenseNumber: string;
      vehicleRegistrationNumber: string;
      insuranceNumber: string;
      criminalRecordUrl: string | null;
      status: DriverStatus;
      onlineStatus: DriverOnlineStatus;
      currentLatitude: number | null;
      currentLongitude: number | null;
      lastLocationUpdateAt: Date | null;
      totalDrivingMinutesToday: number;
      currentSessionStartAt: Date | null;
      consecutiveDrivingMinutes: number;
      fatigueLevel: FatigueLevel;
      goHomeCountToday: number;
      lastGoHomeAt: Date | null;
      totalOrders: number;
      rating: number;
      currentOrderId: string | null;
      isTrainingCompleted: boolean;
      depositAmount: number;
      creditWalletBalance: number;
      incomeWalletBalance: number;
    },
  ): Driver {
    return new Driver(id, props);
  }

  // ---- Profile Management (CRUD) ----

  public updateProfile(updates: {
    fullName?: string;
    email?: string;
    avatar?: string | null;
  }): void {
    if (updates.fullName !== undefined) {
      this._fullName = updates.fullName;
    }
    if (updates.email !== undefined) {
      this._email = updates.email;
    }
    if (updates.avatar !== undefined) {
      this._avatar = updates.avatar;
    }
    this.markUpdated();
  }

  public completeTraining(): void {
    this._isTrainingCompleted = true;
    this.markUpdated();
  }

  public activate(): void {
    if (!this._isTrainingCompleted) {
      throw new BusinessRuleViolationError(
        "Driver must complete training before activation",
      );
    }
    this._status = DriverStatus.ACTIVE;
    this.markUpdated();
  }

  public deactivate(): void {
    this._status = DriverStatus.INACTIVE;
    this._onlineStatus = DriverOnlineStatus.OFFLINE;
    this._releaseCurrentSession();
    this.markUpdated();
  }

  public suspend(): void {
    this._status = DriverStatus.SUSPENDED;
    this._onlineStatus = DriverOnlineStatus.OFFLINE;
    this._releaseCurrentSession();
    this.markUpdated();
  }

  // ---- Online/Offline Status ----

  public goOnline(): void {
    if (this._status !== DriverStatus.ACTIVE) {
      throw new BusinessRuleViolationError("Only active drivers can go online");
    }
    if (this._onlineStatus === DriverOnlineStatus.ONLINE) {
      throw new BusinessRuleViolationError("Driver is already online");
    }
    if (this._fatigueLevel === FatigueLevel.CRITICAL) {
      throw new BusinessRuleViolationError(
        "Driver is at critical fatigue level and cannot go online. Please rest.",
      );
    }

    this._onlineStatus = DriverOnlineStatus.ONLINE;
    this._currentSessionStartAt = new Date();
    this.markUpdated();

    this.addDomainEvent(new DriverOnlineStatusChangedEvent(this.id, true));
  }

  public goOffline(): void {
    if (this._onlineStatus === DriverOnlineStatus.OFFLINE) {
      throw new BusinessRuleViolationError("Driver is already offline");
    }

    this._releaseCurrentSession();
    this._onlineStatus = DriverOnlineStatus.OFFLINE;
    this.markUpdated();

    this.addDomainEvent(new DriverOnlineStatusChangedEvent(this.id, false));
  }

  public goHome(): void {
    if (this._goHomeCountToday >= MAX_GO_HOME_PER_DAY) {
      throw new BusinessRuleViolationError(
        `Maximum go-home limit reached (${MAX_GO_HOME_PER_DAY} times per day)`,
      );
    }

    this._goHomeCountToday += 1;
    this._lastGoHomeAt = new Date();
    this._releaseCurrentSession();
    this._onlineStatus = DriverOnlineStatus.OFFLINE;
    this.markUpdated();

    this.addDomainEvent(new DriverOnlineStatusChangedEvent(this.id, false));
  }

  // ---- GPS Real-time Location ----

  public updateLocation(latitude: number, longitude: number): void {
    if (this._onlineStatus !== DriverOnlineStatus.ONLINE) {
      throw new BusinessRuleViolationError(
        "Cannot update location when offline",
      );
    }

    this._currentLatitude = latitude;
    this._currentLongitude = longitude;
    this._lastLocationUpdateAt = new Date();
    this.markUpdated();
  }

  // ---- Order Assignment ----

  public assignOrder(orderId: string): void {
    if (this._onlineStatus !== DriverOnlineStatus.ONLINE) {
      throw new BusinessRuleViolationError(
        "Cannot assign order to an offline driver",
      );
    }
    if (this._currentOrderId) {
      throw new BusinessRuleViolationError(
        "Driver already has an active order",
      );
    }
    this._currentOrderId = orderId;
    this.markUpdated();
  }

  public completeOrder(): void {
    if (!this._currentOrderId) {
      throw new BusinessRuleViolationError("Driver has no active order");
    }
    this._currentOrderId = null;
    this._totalOrders += 1;
    this.markUpdated();
  }

  // ---- Fatigue Management ----

  /**
   * Update fatigue level based on current driving session.
   * Called periodically (e.g., every minute by a cron job or GPS heartbeat).
   */
  public updateFatigueStatus(minutesSinceLastCheck: number): void {
    if (this._onlineStatus !== DriverOnlineStatus.ONLINE) return;
    if (!this._currentSessionStartAt) return;

    this._consecutiveDrivingMinutes += minutesSinceLastCheck;
    this._totalDrivingMinutesToday += minutesSinceLastCheck;

    if (this._consecutiveDrivingMinutes >= MAX_CONSECUTIVE_DRIVING_MINUTES) {
      this._fatigueLevel = FatigueLevel.CRITICAL;
    } else if (this._consecutiveDrivingMinutes >= FATIGUE_WARNING_MINUTES) {
      this._fatigueLevel = FatigueLevel.WARNING;
    }
    this.markUpdated();
  }

  /**
   * Take a voluntary break. Resets fatigue after sufficient rest.
   */
  public takeBreak(): void {
    if (this._fatigueLevel !== FatigueLevel.CRITICAL) {
      throw new BusinessRuleViolationError(
        "Break is only required when fatigue is critical",
      );
    }

    this.goOffline();
    this._consecutiveDrivingMinutes = 0;
    this._fatigueLevel = FatigueLevel.NORMAL;
    this.markUpdated();
  }

  /**
   * Force-break by system when driver hits 6 hours continuous driving.
   */
  public forceBreak(): void {
    this._onlineStatus = DriverOnlineStatus.OFFLINE;
    this._releaseCurrentSession();
    this._fatigueLevel = FatigueLevel.CRITICAL;
    this.markUpdated();

    this.addDomainEvent(new DriverOnlineStatusChangedEvent(this.id, false));
  }

  // ---- Shift Management ----

  public startShift(): void {
    if (this._fatigueLevel === FatigueLevel.CRITICAL) {
      throw new BusinessRuleViolationError(
        "Cannot start shift at critical fatigue level",
      );
    }
    this.goOnline();
  }

  public endShift(): void {
    this.goOffline();
  }

  // ---- Daily Reset (cron job) ----

  public dailyReset(): void {
    this._totalDrivingMinutesToday = 0;
    this._goHomeCountToday = 0;
    this._fatigueLevel = FatigueLevel.NORMAL;
    this.markUpdated();
  }

  // ---- Wallet Operations ----

  public depositCredit(amount: number): void {
    if (amount <= 0) {
      throw new BusinessRuleViolationError("Deposit amount must be positive");
    }
    this._creditWalletBalance += amount;
    this.markUpdated();
  }

  public holdCreditForCOD(amount: number): void {
    if (this._creditWalletBalance < amount) {
      throw new BusinessRuleViolationError(
        "Insufficient credit wallet balance for COD order",
      );
    }
    this._creditWalletBalance -= amount;
    this.markUpdated();
  }

  public releaseCODHold(amount: number): void {
    this._creditWalletBalance += amount;
    this.markUpdated();
  }

  public addIncome(amount: number): void {
    if (amount <= 0) {
      throw new BusinessRuleViolationError("Income amount must be positive");
    }
    this._incomeWalletBalance += amount;
    this.markUpdated();
  }

  public withdrawIncome(amount: number): void {
    if (amount <= 0) {
      throw new BusinessRuleViolationError("Withdraw amount must be positive");
    }
    if (this._incomeWalletBalance < amount) {
      throw new BusinessRuleViolationError("Insufficient income balance");
    }
    this._incomeWalletBalance -= amount;
    this.markUpdated();
  }

  // ---- Rating ----

  public addRating(rating: number): void {
    if (rating < 1 || rating > 5) {
      throw new BusinessRuleViolationError("Rating must be between 1 and 5");
    }
    // Weighted average update
    const totalScore = this._rating * this._totalOrders;
    this._rating = (totalScore + rating) / (this._totalOrders + 1);
    this.markUpdated();
  }

  // ---- Queries / Accessors ----

  get driverUserId(): string {
    return this._userId;
  }
  get driverFullName(): string {
    return this._fullName;
  }
  get driverPhoneNumber(): string {
    return this._phoneNumber;
  }
  get driverEmail(): string {
    return this._email;
  }
  get driverAvatar(): string | null {
    return this._avatar;
  }
  get driverIdCardNumber(): string {
    return this._idCardNumber;
  }
  get driverLicenseNumber(): string {
    return this._driverLicenseNumber;
  }
  get driverVehicleRegistrationNumber(): string {
    return this._vehicleRegistrationNumber;
  }
  get driverInsuranceNumber(): string {
    return this._insuranceNumber;
  }
  get driverCriminalRecordUrl(): string | null {
    return this._criminalRecordUrl;
  }
  get driverStatus(): DriverStatus {
    return this._status;
  }
  get driverOnlineStatus(): DriverOnlineStatus {
    return this._onlineStatus;
  }
  get driverCurrentLatitude(): number | null {
    return this._currentLatitude;
  }
  get driverCurrentLongitude(): number | null {
    return this._currentLongitude;
  }
  get driverLastLocationUpdateAt(): Date | null {
    return this._lastLocationUpdateAt;
  }
  get driverTotalDrivingMinutesToday(): number {
    return this._totalDrivingMinutesToday;
  }
  get driverCurrentSessionStartAt(): Date | null {
    return this._currentSessionStartAt;
  }
  get driverConsecutiveDrivingMinutes(): number {
    return this._consecutiveDrivingMinutes;
  }
  get driverFatigueLevel(): FatigueLevel {
    return this._fatigueLevel;
  }
  get driverGoHomeCountToday(): number {
    return this._goHomeCountToday;
  }
  get driverLastGoHomeAt(): Date | null {
    return this._lastGoHomeAt;
  }
  get driverTotalOrders(): number {
    return this._totalOrders;
  }
  get driverRating(): number {
    return this._rating;
  }
  get driverCurrentOrderId(): string | null {
    return this._currentOrderId;
  }
  get driverIsTrainingCompleted(): boolean {
    return this._isTrainingCompleted;
  }
  get driverDepositAmount(): number {
    return this._depositAmount;
  }
  get driverCreditWalletBalance(): number {
    return this._creditWalletBalance;
  }
  get driverIncomeWalletBalance(): number {
    return this._incomeWalletBalance;
  }
  get isAvailable(): boolean {
    return (
      this._status === DriverStatus.ACTIVE &&
      this._onlineStatus === DriverOnlineStatus.ONLINE &&
      this._fatigueLevel !== FatigueLevel.CRITICAL &&
      !this._currentOrderId
    );
  }

  // ---- Private Helpers ----

  private _releaseCurrentSession(): void {
    if (this._currentSessionStartAt) {
      const now = new Date();
      const sessionMinutes = Math.floor(
        (now.getTime() - this._currentSessionStartAt.getTime()) / 60000,
      );
      this._totalDrivingMinutesToday += sessionMinutes;
      this._consecutiveDrivingMinutes += sessionMinutes;
    }
    this._currentSessionStartAt = null;
  }
}
