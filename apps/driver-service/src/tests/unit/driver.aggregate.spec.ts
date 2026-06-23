import {
  Driver,
  DriverStatus,
  DriverOnlineStatus,
  FatigueLevel,
} from "../../modules/driver/domain/driver.aggregate";

describe("Driver Aggregate", () => {
  const createProps = {
    userId: "user-123",
    fullName: "Nguyen Van B",
    phoneNumber: "+84901112222",
    email: "driver@example.com",
    idCardNumber: "123456789",
    driverLicenseNumber: "DL-987654321",
    vehicleRegistrationNumber: "VR-12345",
    insuranceNumber: "INS-67890",
  };

  describe("create", () => {
    it("should create a driver with INACTIVE status and OFFLINE", () => {
      const driver = Driver.create(createProps);

      expect(driver.driverStatus).toBe(DriverStatus.INACTIVE);
      expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.OFFLINE);
      expect(driver.driverFullName).toBe("Nguyen Van B");
      expect(driver.driverUserId).toBe("user-123");
      expect(driver.driverFatigueLevel).toBe(FatigueLevel.NORMAL);
      expect(driver.driverTotalOrders).toBe(0);
      expect(driver.driverRating).toBe(0);
      expect(driver.isAvailable).toBe(false);
    });
  });

  describe("activation", () => {
    it("should not activate driver without training", () => {
      const driver = Driver.create(createProps);
      expect(() => driver.activate()).toThrow(
        "Driver must complete training before activation",
      );
    });

    it("should activate driver after training", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      expect(driver.driverStatus).toBe(DriverStatus.ACTIVE);
      expect(driver.driverIsTrainingCompleted).toBe(true);
    });
  });

  describe("online/offline", () => {
    it("should only allow active drivers to go online", () => {
      const driver = Driver.create(createProps);
      expect(() => driver.goOnline()).toThrow(
        "Only active drivers can go online",
      );
    });

    it("should go online successfully", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.ONLINE);
      expect(driver.driverCurrentSessionStartAt).toBeDefined();
      expect(driver.hasUncommittedEvents()).toBe(true);
    });

    it("should not go online twice", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      expect(() => driver.goOnline()).toThrow("Driver is already online");
    });

    it("should go offline", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.goOffline();
      expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.OFFLINE);
    });
  });

  describe("GPS location", () => {
    it("should update location when online", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.updateLocation(10.775, 106.7);
      expect(driver.driverCurrentLatitude).toBe(10.775);
      expect(driver.driverCurrentLongitude).toBe(106.7);
      expect(driver.driverLastLocationUpdateAt).toBeDefined();
    });

    it("should not update location when offline", () => {
      const driver = Driver.create(createProps);
      expect(() => driver.updateLocation(10.775, 106.7)).toThrow(
        "Cannot update location when offline",
      );
    });
  });

  describe("goHome", () => {
    it("should allow go-home up to 2 times per day", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.goHome();
      expect(driver.driverGoHomeCountToday).toBe(1);
      expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.OFFLINE);

      driver.goOnline();
      driver.goHome();
      expect(driver.driverGoHomeCountToday).toBe(2);
      expect(() => driver.goHome()).toThrow(/Maximum go-home limit reached/);
    });
  });

  describe("fatigue management", () => {
    const setupOnline = () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      return driver;
    };

    it("should detect WARNING fatigue after 300 minutes", () => {
      const driver = setupOnline();
      driver.updateFatigueStatus(300);
      expect(driver.driverFatigueLevel).toBe(FatigueLevel.WARNING);
    });

    it("should detect CRITICAL fatigue after 360 minutes", () => {
      const driver = setupOnline();
      driver.updateFatigueStatus(360);
      expect(driver.driverFatigueLevel).toBe(FatigueLevel.CRITICAL);
    });

    it("should prevent online at critical fatigue", () => {
      const driver = setupOnline();
      driver.updateFatigueStatus(360);
      driver.goOffline();
      expect(() => driver.goOnline()).toThrow(/critical fatigue level/);
    });

    it("should force break and reset", () => {
      const driver = setupOnline();
      driver.updateFatigueStatus(360);
      driver.forceBreak();
      expect(driver.driverOnlineStatus).toBe(DriverOnlineStatus.OFFLINE);
      expect(driver.driverFatigueLevel).toBe(FatigueLevel.CRITICAL);
    });

    it("should take break and reset fatigue", () => {
      const driver = setupOnline();
      driver.updateFatigueStatus(360);
      driver.takeBreak();
      expect(driver.driverConsecutiveDrivingMinutes).toBe(0);
      expect(driver.driverFatigueLevel).toBe(FatigueLevel.NORMAL);
    });
  });

  describe("order assignment", () => {
    it("should assign order to available driver", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.assignOrder("order-123");
      expect(driver.driverCurrentOrderId).toBe("order-123");
      expect(driver.isAvailable).toBe(false);
    });

    it("should not assign two orders", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.assignOrder("order-1");
      expect(() => driver.assignOrder("order-2")).toThrow(
        "Driver already has an active order",
      );
    });

    it("should complete order", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.assignOrder("order-1");
      driver.completeOrder();
      expect(driver.driverCurrentOrderId).toBeNull();
      expect(driver.driverTotalOrders).toBe(1);
    });
  });

  describe("rating", () => {
    it("should update rating with weighted average", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.assignOrder("order-1");
      driver.completeOrder();
      driver.goOffline();

      // First rating at score 4: (0*0 + 4) / 1 = 4
      driver.addRating(4);
      expect(driver.driverRating).toBe(4);
      expect(driver.driverTotalRatings).toBe(1);

      // Need second order to test weighted average
      driver.goOnline();
      driver.assignOrder("order-2");
      driver.completeOrder();
      driver.goOffline();

      // Second rating at score 5: (4*1 + 5) / 2 = 4.5
      driver.addRating(5);
      expect(driver.driverRating).toBe(4.5);
      expect(driver.driverTotalRatings).toBe(2);
    });
  });

  describe("wallet", () => {
    it("should deposit credit", () => {
      const driver = Driver.create(createProps);
      driver.depositCredit(200000);
      expect(driver.driverCreditWalletBalance).toBe(200000);
    });

    it("should hold credit for COD", () => {
      const driver = Driver.create(createProps);
      driver.depositCredit(200000);
      driver.holdCreditForCOD(50000);
      expect(driver.driverCreditWalletBalance).toBe(150000);
    });

    it("should reject COD hold if insufficient balance", () => {
      const driver = Driver.create(createProps);
      expect(() => driver.holdCreditForCOD(50000)).toThrow(
        "Insufficient credit wallet balance for COD order",
      );
    });

    it("should add and withdraw income", () => {
      const driver = Driver.create(createProps);
      driver.addIncome(100000);
      expect(driver.driverIncomeWalletBalance).toBe(100000);
      driver.withdrawIncome(50000);
      expect(driver.driverIncomeWalletBalance).toBe(50000);
    });
  });

  describe("daily reset", () => {
    it("should reset daily counters", () => {
      const driver = Driver.create(createProps);
      driver.completeTraining();
      driver.activate();
      driver.goOnline();
      driver.updateFatigueStatus(100);
      driver.goOffline();
      expect(driver.driverTotalDrivingMinutesToday).toBeGreaterThan(0);
      driver.dailyReset();
      expect(driver.driverTotalDrivingMinutesToday).toBe(0);
      expect(driver.driverGoHomeCountToday).toBe(0);
      expect(driver.driverFatigueLevel).toBe(FatigueLevel.NORMAL);
    });
  });
});
