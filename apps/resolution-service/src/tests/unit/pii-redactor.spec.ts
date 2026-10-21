import {
  createPiiContext,
  pseudonym,
  redactPayload,
  redactText,
} from "../../modules/assistant/application/pii/pii-redactor";

describe("PII redactor", () => {
  const sample = {
    consumerId: "11111111-1111-4111-8111-111111111111",
    driverId: "22222222-2222-4222-8222-222222222222",
    merchantId: "33333333-3333-4333-8333-333333333333",
    orderId: "550e8400-e29b-41d4-a716-446655440000",
    full_name: "Nguyễn Văn A",
    phoneNumber: "0901234567",
    email: "a@example.com",
    id_card_number: "012345678901",
    addresses: ["12 Nguyễn Huệ, Quận 1"],
    payment_methods: [{ type: "CARD", last4: "1234" }],
    deliveryAddress: "12 Nguyễn Huệ, Quận 1",
    deliveryLatitude: 10.7769,
    deliveryLongitude: 106.7009,
    status: "DELIVERED",
    rating: 5,
    comment: "Giao nhanh, nhưng gọi 0901234567 không được",
    items: [
      {
        menuItemId: "item-1",
        name: "Phở bò",
        unitPrice: 65000,
        imageUrl: "http://localhost:3010/api/v1/upload/menu-items/pho.jpg",
      },
    ],
    promotion: {
      code: "SALE20",
      value: 20,
      isActive: true,
    },
  };

  it("enforce: loại bỏ PII nhưng giữ dữ liệu nghiệp vụ", () => {
    const ctx = createPiiContext("enforce", "test-secret");
    const out: any = redactPayload(sample, ctx);
    const json = JSON.stringify(out);

    expect(out.full_name).toBeUndefined();
    expect(out.phoneNumber).toBeUndefined();
    expect(out.email).toBeUndefined();
    expect(out.id_card_number).toBeUndefined();
    expect(out.addresses).toBeUndefined();
    expect(out.payment_methods).toBeUndefined();
    expect(out.deliveryAddress).toBeUndefined();
    expect(out.deliveryLatitude).toBeUndefined();
    expect(out.deliveryLongitude).toBeUndefined();

    // Dữ liệu nghiệp vụ phải còn.
    expect(out.status).toBe("DELIVERED");
    expect(out.rating).toBe(5);
    expect(out.items[0].name).toBe("Phở bò");
    expect(out.items[0].unitPrice).toBe(65000);
    expect(out.items[0].menuItemId).toBe("item-1");
    expect(out.promotion.code).toBe("SALE20");
    expect(out.orderId).toBe("550e8400-e29b-41d4-a716-446655440000");

    // ID người dùng → pseudonym, không còn UUID gốc.
    expect(out.consumerId).toMatch(/^KH-[0-9A-F]{6}$/);
    expect(out.driverId).toMatch(/^TX-[0-9A-F]{6}$/);
    expect(out.merchantId).toMatch(/^NH-[0-9A-F]{6}$/);
    expect(json).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(json).not.toContain("22222222-2222-4222-8222-222222222222");
    expect(json).not.toContain("33333333-3333-4333-8333-333333333333");

    // Text tự do: SĐT bị ẩn, nội dung vẫn đọc được.
    expect(out.comment).toContain("[SĐT_ẨN]");
    expect(out.comment).not.toContain("0901234567");
  });

  it("pseudonym ổn định trong cùng context và theo prefix", () => {
    const ctx = createPiiContext("enforce", "test-secret");
    const a = pseudonym("KH", "abc", ctx);
    const b = pseudonym("KH", "abc", ctx);
    expect(a).toBe(b);
    expect(a).not.toBe(pseudonym("KH", "xyz", ctx));
    expect(a).not.toBe(pseudonym("TX", "abc", ctx));
  });

  it("shadow: trả nguyên bản nhưng vẫn đếm PII", () => {
    const ctx = createPiiContext("shadow", "test-secret");
    const out: any = redactPayload(sample, ctx);
    expect(out.full_name).toBe("Nguyễn Văn A");
    expect(out.phoneNumber).toBe("0901234567");
    expect(out.consumerId).toBe(sample.consumerId);
    expect(ctx.fields).toBeGreaterThan(0);
    expect(ctx.ids).toBeGreaterThanOrEqual(3);
  });

  it("off: không đổi dữ liệu và không đếm", () => {
    const ctx = createPiiContext("off", "test-secret");
    const out: any = redactPayload(sample, ctx);
    expect(out).toBe(sample);
    expect(ctx.fields).toBe(0);
    expect(ctx.ids).toBe(0);
  });

  it("redactText ẩn SĐT/email/CCCD/số tài khoản", () => {
    const ctx = createPiiContext("enforce", "test-secret");
    const text = redactText(
      "Khách 0912 345 678, email a.b@example.com, CCCD 012345678901, STK 1234567890123",
      ctx,
    );
    expect(text).not.toContain("0912 345 678");
    expect(text).not.toContain("a.b@example.com");
    expect(text).not.toContain("012345678901");
    expect(text).not.toContain("1234567890123");
    expect(text).toContain("[SĐT_ẨN]");
    expect(text).toContain("[EMAIL_ẨN]");
    expect(text).toContain("[STK_ẨN]");
  });

  it("không cắt nhầm UUID/mã đơn trong key id", () => {
    const ctx = createPiiContext("enforce", "test-secret");
    const out: any = redactPayload(
      { id: "550e8400-e29b-41d4-a716-446655440000", code: "SALE2026" },
      ctx,
    );
    expect(out.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(out.code).toBe("SALE2026");
  });
});
