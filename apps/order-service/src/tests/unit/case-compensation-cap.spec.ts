import { of } from "rxjs";
import { OrderService } from "../../modules/order/application/order.service";

/**
 * Server-side cap cho bồi thường phí ship.
 *
 * `settleCompensation()` nhận `amount` từ resolution-service (hoặc admin gọi
 * tay), nên KHÔNG được tin tuyệt đối: trần là phí ship khách **thực trả** —
 * tức phí ship niêm yết trừ phần khuyến mãi của đơn được phân bổ cho ship.
 *
 * Lỗi gốc: đơn #883f25a8 có `deliveryFee` 21.862đ nhưng khách được giảm giá;
 * bồi thường theo giá niêm yết khiến khách nhận nhiều hơn số đã bỏ ra và tài
 * xế bị trừ oan.
 */

const ORDER_ID = "883f25a8-4c1e-4a0e-9d5f-2b6f0b3c9a11";

function buildOrder(overrides: Record<string, any> = {}) {
  return {
    orderStatus: "DELIVERED",
    orderConsumerId: "consumer-1",
    orderMerchantId: "merchant-1",
    orderDriverId: "driver-1",
    orderSubtotal: 60000,
    orderDeliveryFee: 20000,
    orderServiceFee: 0,
    orderDiscount: 30000,
    orderTotalAmount: 50000,
    ...overrides,
  };
}

function buildService(order: any, walletResponse: any) {
  const orderRepository = {
    findByIdOrFail: jest.fn(async () => order),
  };
  const httpService = {
    post: jest.fn(() => of({ data: walletResponse })),
    get: jest.fn(() => of({ data: walletResponse })),
    patch: jest.fn(() => of({ data: walletResponse })),
  };
  const service = new OrderService(
    orderRepository as any,
    {} as any,
    httpService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, orderRepository, httpService };
}

const walletOk = (amount: number) => ({
  duplicated: false,
  amount,
  charged: amount,
  clawback: 0,
  skipped: null,
});

describe("OrderService.paidShippingFeeOf — phí ship khách THỰC TRẢ", () => {
  it("không khuyến mãi: bằng đúng phí ship niêm yết", () => {
    const order = buildOrder({ orderDiscount: 0, orderTotalAmount: 80000 });
    const { service } = buildService(order, walletOk(20000));

    expect((service as any).paidShippingFeeOf(order)).toBe(20000);
  });

  it("khuyến mãi chia theo trọng số món : ship", () => {
    const order = buildOrder();
    const { service } = buildService(order, walletOk(0));

    // base = 60.000 + 20.000 = 80.000; giảm 30.000 ⇒ ship 7.500 ⇒ thực trả 12.500.
    expect((service as any).paidShippingFeeOf(order)).toBe(12500);
  });

  it("giảm 100% đơn: khách không thực trả phí ship", () => {
    const order = buildOrder({
      orderSubtotal: 0,
      orderDiscount: 20000,
      orderTotalAmount: 0,
    });
    const { service } = buildService(order, walletOk(0));

    expect((service as any).paidShippingFeeOf(order)).toBe(0);
  });

  it("đơn không có phí ship: trần bằng 0", () => {
    const order = buildOrder({ orderDeliveryFee: 0, orderTotalAmount: 0 });
    const { service } = buildService(order, walletOk(0));

    expect((service as any).paidShippingFeeOf(order)).toBe(0);
  });
});

describe("OrderService.settleCompensation — chặn trần ở phía server", () => {
  it("yêu cầu vượt phí ship thực trả: chỉ chuyển số thực trả", async () => {
    const order = buildOrder();
    const { service, httpService } = buildService(order, walletOk(12500));

    const res = await service.settleCompensation(ORDER_ID, {
      faultParty: "DRIVER",
      amount: 20000,
    });

    expect(httpService.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ amount: 12500 }),
      expect.anything(),
    );
    expect(res.amount).toBe(12500);
    expect(res.settled).toBe(true);
  });

  it("yêu cầu thấp hơn trần: giữ nguyên số policy", async () => {
    const order = buildOrder();
    const { service, httpService } = buildService(order, walletOk(5000));

    const res = await service.settleCompensation(ORDER_ID, {
      faultParty: "DRIVER",
      amount: 5000,
    });

    expect(httpService.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ amount: 5000 }),
      expect.anything(),
    );
    expect(res.amount).toBe(5000);
  });

  it("đơn được giảm 100%: không có gì để bồi thường, không gọi ví", async () => {
    const order = buildOrder({
      orderSubtotal: 0,
      orderDiscount: 20000,
      orderTotalAmount: 0,
    });
    const { service, httpService } = buildService(order, walletOk(0));

    const res = await service.settleCompensation(ORDER_ID, {
      faultParty: "DRIVER",
      amount: 20000,
    });

    expect(res.settled).toBe(false);
    expect(res.reason).toBe("EXCEEDS_PAID_SHIPPING_FEE");
    expect(httpService.post).not.toHaveBeenCalled();
  });
});
