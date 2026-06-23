import {
  Consumer,
  Gender,
} from "../../modules/consumer/domain/consumer.aggregate";
import {
  Address,
  GpsCoordinates,
} from "../../modules/consumer/domain/address.vo";
import { PaymentMethod } from "../../modules/consumer/domain/payment-method.vo";

describe("Consumer Aggregate", () => {
  const validCreateProps = {
    userId: "550e8400-e29b-41d4-a716-446655440000",
    fullName: "Nguyen Van A",
    avatar: "https://example.com/avatar.jpg",
    dateOfBirth: new Date("1995-06-15"),
    gender: "MALE" as Gender,
  };

  describe("create", () => {
    it("should create a new consumer successfully", () => {
      const result = Consumer.create(validCreateProps);
      expect(result.isSuccess).toBe(true);
      const consumer = result.value;
      expect(consumer.displayName).toBe("Nguyen Van A");
      expect(consumer.userIdValue).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(consumer.consumerGender).toBe("MALE");
      expect(consumer.addressList).toHaveLength(0);
      expect(consumer.paymentMethodList).toHaveLength(0);
    });

    it("should emit ConsumerProfileUpdatedEvent on creation", () => {
      const result = Consumer.create(validCreateProps);
      expect(result.isSuccess).toBe(true);
      const consumer = result.value;
      const events = consumer.getDomainEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0]!.eventType).toBe(
        "com.mythfood.consumer.profile_updated",
      );
    });

    it("should fail if userId is empty", () => {
      const result = Consumer.create({ ...validCreateProps, userId: "" });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("User ID is required");
    });

    it("should fail if fullName is empty", () => {
      const result = Consumer.create({ ...validCreateProps, fullName: "" });
      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe("Full name is required");
    });

    it("should default avatar and gender to null", () => {
      const result = Consumer.create({
        userId: "550e8400-e29b-41d4-a716-446655440000",
        fullName: "Tran Thi B",
      });
      expect(result.isSuccess).toBe(true);
      expect(result.value.avatarUrl).toBeNull();
      expect(result.value.consumerGender).toBeNull();
    });

    it("should rehydrate without emitting events", () => {
      const result = Consumer.create(validCreateProps);
      const original = result.value;
      const rehydrated = Consumer.rehydrate(original.id, {
        userId: original.userIdValue,
        fullName: original.displayName,
        avatar: original.avatarUrl,
        dateOfBirth: original.birthDate,
        gender: original.consumerGender,
        addresses: original.addressList,
        paymentMethods: original.paymentMethodList,
      });
      expect(rehydrated.getDomainEvents()).toHaveLength(0);
      expect(rehydrated.displayName).toBe(original.displayName);
    });
  });

  describe("updateProfile", () => {
    it("should update fullName", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const updateResult = consumer.updateProfile({ fullName: "Le Van C" });
      expect(updateResult.isSuccess).toBe(true);
      expect(consumer.displayName).toBe("Le Van C");
    });

    it("should update avatar and gender", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      consumer.updateProfile({ avatar: "new-avatar.jpg", gender: "FEMALE" });
      expect(consumer.avatarUrl).toBe("new-avatar.jpg");
      expect(consumer.consumerGender).toBe("FEMALE");
    });

    it("should fail if fullName is empty", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const updateResult = consumer.updateProfile({ fullName: "" });
      expect(updateResult.isFailure).toBe(true);
    });

    it("should emit event on profile update", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      consumer.pullDomainEvents();
      consumer.updateProfile({ fullName: "Updated Name" });
      expect(consumer.getDomainEvents().length).toBeGreaterThan(0);
    });
  });

  describe("address management", () => {
    const createAddress = () => {
      return Address.create({
        label: "Home",
        fullAddress: "123 Le Loi, District 1",
        city: "Ho Chi Minh",
        district: "District 1",
        ward: "Ben Nghe",
        street: "Le Loi",
      }).value;
    };

    it("should add an address", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const addr = createAddress();
      const addResult = consumer.addAddress(addr);
      expect(addResult.isSuccess).toBe(true);
      expect(consumer.addressList).toHaveLength(1);
    });

    it("should make first address default automatically", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      consumer.addAddress(createAddress());
      const defaultAddr = consumer.defaultAddress;
      expect(defaultAddr).not.toBeNull();
      expect(defaultAddr!.isDefault).toBe(true);
    });

    it("should enforce max 10 addresses", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      for (let i = 1; i <= 10; i++) {
        consumer.addAddress(createAddress());
      }
      const addResult = consumer.addAddress(createAddress());
      expect(addResult.isFailure).toBe(true);
      expect(addResult.error.message).toContain("Maximum 10");
    });

    it("should remove an address", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const addr = createAddress();
      consumer.addAddress(addr);
      const removeResult = consumer.removeAddress(addr.id.toString());
      expect(removeResult.isSuccess).toBe(true);
      expect(consumer.addressList).toHaveLength(0);
    });

    it("should fail removing non-existent address", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const removeResult = consumer.removeAddress("non-existent-id");
      expect(removeResult.isFailure).toBe(true);
    });

    it("should set a specific address as default", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const addr1 = createAddress();
      const addr2 = Address.create({
        label: "Work",
        fullAddress: "456 Nguyen Hue",
        city: "Ho Chi Minh",
        district: "District 1",
        ward: "Ben Nghe",
        street: "Nguyen Hue",
      }).value;
      consumer.addAddress(addr1);
      consumer.addAddress(addr2);
      consumer.setDefaultAddress(addr2.id.toString());
      const defaultAddr = consumer.defaultAddress;
      expect(defaultAddr!.id.toString()).toBe(addr2.id.toString());
    });
  });

  describe("payment method management", () => {
    const createPaymentMethod = () => {
      return PaymentMethod.create({
        type: "CREDIT_CARD",
        provider: "Visa",
        token: "tok_abc123",
        lastFourDigits: "4242",
      }).value;
    };

    it("should add a payment method", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const pm = createPaymentMethod();
      const addResult = consumer.addPaymentMethod(pm);
      expect(addResult.isSuccess).toBe(true);
      expect(consumer.paymentMethodList).toHaveLength(1);
    });

    it("should make first payment method default", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      consumer.addPaymentMethod(createPaymentMethod());
      const defaultPm = consumer.defaultPaymentMethod;
      expect(defaultPm).not.toBeNull();
      expect(defaultPm!.isDefault).toBe(true);
    });

    it("should remove a payment method", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const pm = createPaymentMethod();
      consumer.addPaymentMethod(pm);
      consumer.removePaymentMethod(pm.id.toString());
      expect(consumer.paymentMethodList).toHaveLength(0);
    });

    it("should set a specific payment method as default", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      const pm1 = createPaymentMethod();
      const pm2 = PaymentMethod.create({
        type: "DEBIT_CARD",
        provider: "MasterCard",
        token: "tok_def456",
        lastFourDigits: "5555",
      }).value;
      consumer.addPaymentMethod(pm1);
      consumer.addPaymentMethod(pm2);
      consumer.setDefaultPaymentMethod(pm2.id.toString());
      const defaultPm = consumer.defaultPaymentMethod;
      expect(defaultPm!.id.toString()).toBe(pm2.id.toString());
    });
  });

  describe("getters", () => {
    it("should return correct userId", () => {
      const result = Consumer.create(validCreateProps);
      expect(result.value.userIdValue).toBe(validCreateProps.userId);
    });

    it("should return correct address count", () => {
      const result = Consumer.create(validCreateProps);
      const consumer = result.value;
      consumer.addAddress(
        Address.create({
          label: "Home",
          fullAddress: "123 St",
          city: "HCM",
          district: "",
          ward: "",
          street: "",
        }).value,
      );
      consumer.addAddress(
        Address.create({
          label: "Work",
          fullAddress: "456 St",
          city: "HN",
          district: "",
          ward: "",
          street: "",
        }).value,
      );
      expect(consumer.addressCount).toBe(2);
    });
  });
});
