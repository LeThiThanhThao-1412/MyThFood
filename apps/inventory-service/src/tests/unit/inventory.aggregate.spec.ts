import { Inventory } from '../../modules/inventory/domain/inventory.aggregate';

describe('Inventory Aggregate', () => {
  const validProps = {
    menuItemId: '550e8400-e29b-41d4-a716-446655440001',
    merchantId: '550e8400-e29b-41d4-a716-446655440002',
    totalQuantity: 100,
  };

  describe('create()', () => {
    it('should create inventory with total = available', () => {
      const result = Inventory.create(validProps);
      expect(result.isSuccess).toBe(true);
      const inv = result.value;
      expect(inv.inventoryTotalQuantity).toBe(100);
      expect(inv.inventoryAvailableQuantity).toBe(100);
      expect(inv.inventoryReservedQuantity).toBe(0);
      expect(inv.inventoryReservations).toHaveLength(0);
    });

    it('should fail if menuItemId is empty', () => {
      const result = Inventory.create({ ...validProps, menuItemId: '' });
      expect(result.isFailure).toBe(true);
    });

    it('should fail if merchantId is empty', () => {
      const result = Inventory.create({ ...validProps, merchantId: '' });
      expect(result.isFailure).toBe(true);
    });

    it('should fail if totalQuantity is negative', () => {
      const result = Inventory.create({ ...validProps, totalQuantity: -1 });
      expect(result.isFailure).toBe(true);
    });
  });

  describe('reserve()', () => {
    let inv: Inventory;
    beforeEach(() => {
      inv = Inventory.create(validProps).value;
    });

    it('should reserve quantity and emit event', () => {
      inv.reserve('order-1', 10);
      expect(inv.inventoryAvailableQuantity).toBe(90);
      expect(inv.inventoryReservedQuantity).toBe(10);
      expect(inv.inventoryReservations).toHaveLength(1);

      const events = inv.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('com.mythfood.inventory.reserved');
    });

    it('should set 5-minute timeout by default', () => {
      inv.reserve('order-1', 5);
      const r = inv.inventoryReservations[0]!;
      const diff = r.expiresAt.getTime() - r.reservedAt.getTime();
      expect(diff).toBeGreaterThanOrEqual(4.9 * 60_000);
      expect(diff).toBeLessThanOrEqual(5.1 * 60_000);
    });

    it('should allow custom timeout', () => {
      inv.reserve('order-1', 5, 10);
      const r = inv.inventoryReservations[0]!;
      const diff = r.expiresAt.getTime() - r.reservedAt.getTime();
      expect(diff).toBeGreaterThanOrEqual(9.9 * 60_000);
    });

    it('should fail if insufficient stock', () => {
      expect(() => inv.reserve('order-1', 999)).toThrow('Insufficient stock');
    });

    it('should fail if quantity <= 0', () => {
      expect(() => inv.reserve('order-1', 0)).toThrow('positive');
    });

    it('should accumulate multiple reservations', () => {
      inv.reserve('order-1', 10);
      inv.reserve('order-2', 20);
      expect(inv.inventoryAvailableQuantity).toBe(70);
      expect(inv.inventoryReservedQuantity).toBe(30);
      expect(inv.inventoryReservations).toHaveLength(2);
    });
  });

  describe('release()', () => {
    let inv: Inventory;
    beforeEach(() => {
      inv = Inventory.create(validProps).value;
      inv.reserve('order-1', 10);
      inv.pullDomainEvents();
    });

    it('should release quantity back to available', () => {
      inv.release('order-1', 'Customer cancelled');
      expect(inv.inventoryAvailableQuantity).toBe(100);
      expect(inv.inventoryReservedQuantity).toBe(0);
      expect(inv.inventoryReservations).toHaveLength(0);

      const events = inv.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('com.mythfood.inventory.released');
    });

    it('should fail if no reservation found', () => {
      expect(() => inv.release('order-999', 'test')).toThrow('No reservation found');
    });

    it('should fail if reason is empty', () => {
      expect(() => inv.release('order-1', '')).toThrow('reason is required');
    });
  });

  describe('consume()', () => {
    let inv: Inventory;
    beforeEach(() => {
      inv = Inventory.create(validProps).value;
      inv.reserve('order-1', 10);
      inv.pullDomainEvents();
    });

    it('should consume: reserved -=, total -=, available unchanged', () => {
      inv.consume('order-1');
      expect(inv.inventoryAvailableQuantity).toBe(90); // unchanged
      expect(inv.inventoryReservedQuantity).toBe(0);
      expect(inv.inventoryTotalQuantity).toBe(90); // decreased
      expect(inv.inventoryReservations).toHaveLength(0);

      const events = inv.pullDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0]!.eventType).toBe('com.mythfood.inventory.consumed');
    });

    it('should fail if no reservation found', () => {
      expect(() => inv.consume('order-999')).toThrow('No reservation found');
    });
  });

  describe('getExpiredReservations()', () => {
    it('should return expired reservations', () => {
      const inv = Inventory.create(validProps).value;
      inv.reserve('order-1', 10, 5); // 5 min timeout
      // Simulate expired by calling getExpiredReservations with future date
      const future = new Date(Date.now() + 10 * 60_000);
      const expired = inv.getExpiredReservations(future);
      expect(expired).toHaveLength(1);
      expect(expired[0]!.orderId).toBe('order-1');
    });

    it('should return empty if not expired', () => {
      const inv = Inventory.create(validProps).value;
      inv.reserve('order-1', 10, 60);
      const expired = inv.getExpiredReservations(new Date());
      expect(expired).toHaveLength(0);
    });
  });

  describe('stock management', () => {
    it('should update total and adjust available', () => {
      const inv = Inventory.create(validProps).value;
      inv.updateTotal(150);
      expect(inv.inventoryTotalQuantity).toBe(150);
      expect(inv.inventoryAvailableQuantity).toBe(150);
    });

    it('should detect low stock', () => {
      const inv = Inventory.create({ ...validProps, totalQuantity: 10 }).value;
      inv.reserve('order-1', 6);
      expect(inv.isLowStock()).toBe(true); // 4 <= 5
    });

    it('should detect out of stock', () => {
      const inv = Inventory.create({ ...validProps, totalQuantity: 10 }).value;
      inv.reserve('order-1', 10);
      expect(inv.isOutOfStock()).toBe(true);
    });
  });

  describe('rehydrate()', () => {
    it('should reconstruct without events', () => {
      const original = Inventory.create(validProps).value;
      const rehydrated = Inventory.rehydrate(original.id, {
        menuItemId: original.inventoryMenuItemId,
        merchantId: original.inventoryMerchantId,
        totalQuantity: original.inventoryTotalQuantity,
        availableQuantity: original.inventoryAvailableQuantity,
        reservedQuantity: original.inventoryReservedQuantity,
        reservations: [...original.inventoryReservations],
        lowStockThreshold: original.inventoryLowStockThreshold,
      });
      expect(rehydrated.pullDomainEvents()).toHaveLength(0);
    });
  });
});