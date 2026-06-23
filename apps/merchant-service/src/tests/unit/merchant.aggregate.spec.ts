import {
  Merchant,
  MerchantStatus,
  CapacityStatus,
} from "../../modules/merchant/domain/merchant.aggregate";
import { MerchantId } from "../../modules/merchant/domain/merchant-id";
import { MenuItemId } from "../../modules/merchant/domain/menu-item-id";
import {
  MenuItem,
  MenuItemCategory,
} from "../../modules/merchant/domain/menu-item.entity";
import { OperatingHours } from "../../modules/merchant/domain/operating-hours.vo";
import { MERCHANT_REGISTERED_EVENT_TYPE } from "../../modules/merchant/domain/events/merchant-registered.event";
import { MENU_UPDATED_EVENT_TYPE } from "../../modules/merchant/domain/events/menu-updated.event";

describe("Merchant Aggregate", () => {
  const validMerchantProps = {
    userId: "user-uuid-123",
    name: "Pho Ngon Restaurant",
    phone: "+84901234567",
    address: "123 Nguyen Hue, District 1, HCMC",
  };

  // ===================== Registration Tests =====================

  describe("register", () => {
    it("should register a new merchant with PENDING status", () => {
      const result = Merchant.register(validMerchantProps);

      expect(result.isSuccess).toBe(true);
      const merchant = result.value;
      expect(merchant.merchantName).toBe("Pho Ngon Restaurant");
      expect(merchant.merchantPhone).toBe("+84901234567");
      expect(merchant.merchantAddress).toBe("123 Nguyen Hue, District 1, HCMC");
      expect(merchant.merchantStatus).toBe("PENDING");
      expect(merchant.merchantRating).toBe(0);
      expect(merchant.merchantTotalOrders).toBe(0);
      expect(merchant.merchantCapacityStatus).toBe("NORMAL");
    });

    it("should register with default capacity config", () => {
      const result = Merchant.register(validMerchantProps);

      expect(result.isSuccess).toBe(true);
      const merchant = result.value;
      const config = merchant.merchantCapacityConfig;
      expect(config.maxConcurrentOrders).toBe(10);
      expect(config.prepTimePerOrder).toBe(20);
    });

    it("should register with custom capacity config", () => {
      const result = Merchant.register({
        ...validMerchantProps,
        capacityConfig: { maxConcurrentOrders: 20, prepTimePerOrder: 15 },
      });

      expect(result.isSuccess).toBe(true);
      const config = result.value.merchantCapacityConfig;
      expect(config.maxConcurrentOrders).toBe(20);
      expect(config.prepTimePerOrder).toBe(15);
    });

    it("should emit MerchantRegisteredEvent on register", () => {
      const result = Merchant.register(validMerchantProps);

      expect(result.isSuccess).toBe(true);
      const merchant = result.value;
      expect(merchant.hasUncommittedEvents()).toBe(true);

      const events = merchant.pullDomainEvents();
      expect(events.length).toBe(1);
      expect(events[0]?.eventType).toBe(MERCHANT_REGISTERED_EVENT_TYPE);
    });

    it("should have empty menu items, operating hours, and documents on registration", () => {
      const result = Merchant.register(validMerchantProps);

      expect(result.isSuccess).toBe(true);
      const merchant = result.value;
      expect(merchant.menuItemList).toHaveLength(0);
      expect(merchant.operatingHoursList).toHaveLength(0);
      expect(merchant.documentList).toHaveLength(0);
    });

    it("should set PENDING status by default", () => {
      const result = Merchant.register(validMerchantProps);

      expect(result.isSuccess).toBe(true);
      expect(result.value.isPending()).toBe(true);
      expect(result.value.isApproved()).toBe(false);
    });

    it("should fail when name is empty", () => {
      const result = Merchant.register({ ...validMerchantProps, name: "" });

      expect(result.isFailure).toBe(true);
      expect(result.error!.message).toBe("Merchant name is required");
    });

    it("should fail when phone is empty", () => {
      const result = Merchant.register({ ...validMerchantProps, phone: "" });

      expect(result.isFailure).toBe(true);
      expect(result.error!.message).toBe("Phone number is required");
    });

    it("should fail when address is empty", () => {
      const result = Merchant.register({ ...validMerchantProps, address: "" });

      expect(result.isFailure).toBe(true);
      expect(result.error!.message).toBe("Address is required");
    });

    it("should fail when userId is empty", () => {
      const result = Merchant.register({ ...validMerchantProps, userId: "" });

      expect(result.isFailure).toBe(true);
      expect(result.error!.message).toBe("User ID is required");
    });

    it("should accept optional email and description", () => {
      const result = Merchant.register({
        ...validMerchantProps,
        email: "pho@ngon.com",
        description: "Best pho in town",
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.merchantEmail).toBe("pho@ngon.com");
      expect(result.value.merchantDescription).toBe("Best pho in town");
    });
  });

  // ===================== Merchant Status Tests =====================

  describe("status transitions", () => {
    let merchant: Merchant;

    beforeEach(() => {
      const result = Merchant.register(validMerchantProps);
      merchant = result.value!;
    });

    it("should approve a PENDING merchant", () => {
      merchant.approve();
      expect(merchant.merchantStatus).toBe("APPROVED");
      expect(merchant.isApproved()).toBe(true);
    });

    it("should not approve an already approved merchant", () => {
      merchant.approve();
      expect(() => merchant.approve()).toThrow("Merchant is already approved");
    });

    it("should reject a PENDING merchant", () => {
      merchant.reject();
      expect(merchant.merchantStatus).toBe("REJECTED");
    });

    it("should not reject an approved merchant", () => {
      merchant.approve();
      expect(() => merchant.reject()).toThrow(
        "Cannot reject an approved merchant",
      );
    });

    it("should suspend an approved merchant", () => {
      merchant.approve();
      merchant.suspend();
      expect(merchant.merchantStatus).toBe("SUSPENDED");
    });

    it("should not suspend a rejected merchant", () => {
      merchant.reject();
      expect(() => merchant.suspend()).toThrow(
        "Cannot suspend a rejected merchant",
      );
    });

    it("should reactivate a suspended merchant", () => {
      merchant.approve();
      merchant.suspend();
      merchant.reactivate();
      expect(merchant.merchantStatus).toBe("APPROVED");
    });

    it("should not reactivate a non-suspended merchant", () => {
      expect(() => merchant.reactivate()).toThrow(
        "Only suspended merchants can be reactivated",
      );
    });
  });

  // ===================== Update Info Tests =====================

  describe("updateInfo", () => {
    let merchant: Merchant;

    beforeEach(() => {
      const result = Merchant.register(validMerchantProps);
      merchant = result.value!;
    });

    it("should update merchant name", () => {
      merchant.updateInfo({ name: "New Pho House" });
      expect(merchant.merchantName).toBe("New Pho House");
    });

    it("should update merchant phone", () => {
      merchant.updateInfo({ phone: "+84909999999" });
      expect(merchant.merchantPhone).toBe("+84909999999");
    });

    it("should update merchant address", () => {
      merchant.updateInfo({ address: "456 Le Loi, District 1" });
      expect(merchant.merchantAddress).toBe("456 Le Loi, District 1");
    });

    it("should update logo and cover image URLs", () => {
      merchant.updateInfo({
        logoUrl: "https://img.com/logo.png",
        coverImageUrl: "https://img.com/cover.png",
      });
      expect(merchant.merchantLogoUrl).toBe("https://img.com/logo.png");
      expect(merchant.merchantCoverImageUrl).toBe("https://img.com/cover.png");
    });

    it("should update GPS coordinates", () => {
      merchant.updateInfo({ latitude: 10.8231, longitude: 106.6297 });
      expect(merchant.merchantLatitude).toBe(10.8231);
      expect(merchant.merchantLongitude).toBe(106.6297);
    });

    it("should throw when name is set to empty string", () => {
      expect(() => merchant.updateInfo({ name: "" })).toThrow(
        "Merchant name cannot be empty",
      );
    });

    it("should throw when phone is set to empty string", () => {
      expect(() => merchant.updateInfo({ phone: "" })).toThrow(
        "Phone cannot be empty",
      );
    });

    it("should throw when address is set to empty string", () => {
      expect(() => merchant.updateInfo({ address: "" })).toThrow(
        "Address cannot be empty",
      );
    });
  });

  // ===================== Menu Management Tests =====================

  describe("menu management", () => {
    let merchant: Merchant;

    beforeEach(() => {
      const result = Merchant.register(validMerchantProps);
      merchant = result.value!;
    });

    it("should add a menu item", () => {
      const menuItem = merchant.addMenuItem({
        category: "MAIN_COURSE",
        name: "Pho Bo",
        price: 50000,
      });

      expect(menuItem.itemName).toBe("Pho Bo");
      expect(menuItem.itemPrice).toBe(50000);
      expect(menuItem.available).toBe(true);
      expect(merchant.menuItemList).toHaveLength(1);
    });

    it("should emit MenuUpdatedEvent with CREATED action", () => {
      merchant.addMenuItem({
        category: "MAIN_COURSE",
        name: "Pho Bo",
        price: 50000,
      });

      const events = merchant.pullDomainEvents();
      const menuEvents = events.filter(
        (e) => e.eventType === MENU_UPDATED_EVENT_TYPE,
      );
      expect(menuEvents.length).toBe(1);
    });

    it("should update a menu item name", () => {
      const menuItem = merchant.addMenuItem({
        category: "MAIN_COURSE",
        name: "Pho Bo",
        price: 50000,
      });

      const updated = merchant.updateMenuItem(menuItem.id, {
        name: "Pho Bo Dac Biet",
      });
      expect(updated.itemName).toBe("Pho Bo Dac Biet");
    });

    it("should emit price change event when price is updated", () => {
      const menuItem = merchant.addMenuItem({
        category: "MAIN_COURSE",
        name: "Pho Bo",
        price: 50000,
      });

      // Clear events from add
      merchant.pullDomainEvents();

      merchant.updateMenuItem(menuItem.id, { price: 60000 });
      const events = merchant.pullDomainEvents();
      const priceEvents = events.filter(
        (e) => e.eventType === MENU_UPDATED_EVENT_TYPE,
      );

      expect(priceEvents.length).toBe(1);
      const payload = (priceEvents[0] as any).payload;
      expect(payload.action).toBe("PRICE_CHANGED");
      expect(payload.oldPrice).toBe(50000);
      expect(payload.newPrice).toBe(60000);
    });

    it("should toggle menu item availability", () => {
      const menuItem = merchant.addMenuItem({
        category: "DRINK",
        name: "Tra Da",
        price: 5000,
      });

      merchant.toggleMenuItem(menuItem.id);
      expect(menuItem.available).toBe(false);

      merchant.toggleMenuItem(menuItem.id);
      expect(menuItem.available).toBe(true);
    });

    it("should remove a menu item", () => {
      const menuItem = merchant.addMenuItem({
        category: "DRINK",
        name: "Tra Da",
        price: 5000,
      });

      expect(merchant.menuItemList).toHaveLength(1);
      merchant.removeMenuItem(menuItem.id);
      expect(merchant.menuItemList).toHaveLength(0);
    });

    it("should throw when removing non-existent menu item", () => {
      const fakeId = MenuItemId.create();
      expect(() => merchant.removeMenuItem(fakeId)).toThrow("not found");
    });

    it("should throw when adding menu item with empty name", () => {
      expect(() =>
        merchant.addMenuItem({
          category: "MAIN_COURSE",
          name: "",
          price: 10000,
        }),
      ).toThrow("Menu item name is required");
    });

    it("should throw when adding menu item with negative price", () => {
      expect(() =>
        merchant.addMenuItem({
          category: "MAIN_COURSE",
          name: "Test",
          price: -100,
        }),
      ).toThrow("Price cannot be negative");
    });

    it("should track original price when price changes", () => {
      const menuItem = merchant.addMenuItem({
        category: "MAIN_COURSE",
        name: "Pho Bo",
        price: 50000,
      });

      merchant.updateMenuItem(menuItem.id, { price: 70000 });
      expect(menuItem.itemOriginalPrice).toBe(50000);
      expect(menuItem.itemPrice).toBe(70000);
    });
  });

  // ===================== Operating Hours Tests =====================

  describe("operating hours", () => {
    let merchant: Merchant;

    beforeEach(() => {
      const result = Merchant.register(validMerchantProps);
      merchant = result.value!;
    });

    it("should set operating hours for all days", () => {
      const hours = [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        dayOfWeek: day,
        openTime: "08:00:00",
        closeTime: "22:00:00",
        isClosed: day === 0, // Closed on Sunday
      }));

      merchant.setOperatingHours(hours);
      expect(merchant.operatingHoursList).toHaveLength(7);
    });

    it("should throw when operating hours is empty", () => {
      expect(() => merchant.setOperatingHours([])).toThrow(
        "Operating hours cannot be empty",
      );
    });

    it("should return false from isOpen when merchant is not approved", () => {
      merchant.setOperatingHours([
        {
          dayOfWeek: 1,
          openTime: "08:00:00",
          closeTime: "22:00:00",
          isClosed: false,
        },
      ]);

      expect(merchant.isOpen()).toBe(false); // Not approved
    });

    it("should return true from isOpen when within hours", () => {
      merchant.approve();
      const now = new Date("2026-01-05T09:00:00"); // Monday 9am
      merchant.setOperatingHours([
        {
          dayOfWeek: 1,
          openTime: "08:00:00",
          closeTime: "22:00:00",
          isClosed: false,
        },
      ]);

      expect(merchant.isOpen(now)).toBe(true);
    });

    it("should return false from isOpen when outside hours", () => {
      merchant.approve();
      const now = new Date("2026-01-05T23:00:00"); // Monday 11pm
      merchant.setOperatingHours([
        {
          dayOfWeek: 1,
          openTime: "08:00:00",
          closeTime: "22:00:00",
          isClosed: false,
        },
      ]);

      expect(merchant.isOpen(now)).toBe(false);
    });

    it("should support overnight hours", () => {
      merchant.approve();
      const now = new Date("2026-01-05T01:00:00"); // Monday 1am
      merchant.setOperatingHours([
        {
          dayOfWeek: 1,
          openTime: "22:00:00",
          closeTime: "04:00:00",
          isClosed: false,
        },
      ]);

      expect(merchant.isOpen(now)).toBe(true);
    });
  });

  // ===================== Capacity Tests =====================

  describe("capacity management", () => {
    let merchant: Merchant;

    beforeEach(() => {
      const result = Merchant.register({
        ...validMerchantProps,
        capacityConfig: { maxConcurrentOrders: 10, prepTimePerOrder: 20 },
      });
      merchant = result.value!;
    });

    it("should start at NORMAL capacity", () => {
      expect(merchant.merchantCapacityStatus).toBe("NORMAL");
    });

    it("should become BUSY at 60% capacity", () => {
      for (let i = 0; i < 6; i++) merchant.incrementOrderCount();
      expect(merchant.merchantCapacityStatus).toBe("BUSY");
    });

    it("should become OVERLOADED at 80% capacity", () => {
      for (let i = 0; i < 8; i++) merchant.incrementOrderCount();
      expect(merchant.merchantCapacityStatus).toBe("OVERLOADED");
    });

    it("should become CRITICAL at 100% capacity", () => {
      for (let i = 0; i < 10; i++) merchant.incrementOrderCount();
      expect(merchant.merchantCapacityStatus).toBe("CRITICAL");
    });

    it("should decrease order count and recalculate", () => {
      for (let i = 0; i < 8; i++) merchant.incrementOrderCount();
      expect(merchant.merchantCapacityStatus).toBe("OVERLOADED");

      for (let i = 0; i < 3; i++) merchant.decrementOrderCount();
      expect(merchant.merchantCapacityStatus).toBe("NORMAL");
    });

    it("should not go below 0 order count", () => {
      merchant.decrementOrderCount();
      expect(merchant.merchantCurrentOrderCount).toBe(0);
    });

    it("should update max concurrent orders config", () => {
      merchant.updateCapacityConfig({ maxConcurrentOrders: 5 });
      expect(merchant.merchantCapacityConfig.maxConcurrentOrders).toBe(5);
    });

    it("should throw for invalid max concurrent orders", () => {
      expect(() =>
        merchant.updateCapacityConfig({ maxConcurrentOrders: 0 }),
      ).toThrow("Max concurrent orders must be at least 1");
    });

    it("should throw for invalid prep time", () => {
      expect(() =>
        merchant.updateCapacityConfig({ prepTimePerOrder: 0 }),
      ).toThrow("Prep time must be at least 1 minute");
    });
  });

  // ===================== Rehydrate Tests =====================

  describe("rehydrate", () => {
    it("should rehydrate without emitting events", () => {
      const id = MerchantId.create();
      const merchant = Merchant.rehydrate(id, {
        userId: "user-123",
        name: "Test Restaurant",
        description: "Test desc",
        logoUrl: null,
        coverImageUrl: null,
        phone: "+84901234567",
        email: null,
        address: "Test Address",
        latitude: null,
        longitude: null,
        status: "APPROVED",
        rating: 4.5,
        totalOrders: 100,
        capacityConfig: { maxConcurrentOrders: 10, prepTimePerOrder: 20 },
        capacityStatus: "NORMAL",
        menuItems: [],
        operatingHours: [],
        documents: [],
        currentOrderCount: 0,
      });

      expect(merchant.id.equals(id)).toBe(true);
      expect(merchant.merchantName).toBe("Test Restaurant");
      expect(merchant.merchantStatus).toBe("APPROVED");
      expect(merchant.hasUncommittedEvents()).toBe(false);
    });
  });
});
