import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateDispatchDto } from "../../modules/dispatch/application/dtos/dispatch.dto";

const BASE_PAYLOAD = {
  orderId: "11111111-1111-4111-8111-111111111111",
  merchantId: "22222222-2222-4222-8222-222222222222",
  deliveryAddress: "12 Nguyễn Văn Bảo",
  deliveryLatitude: 10.82,
  deliveryLongitude: 106.68,
  merchantLatitude: 10.828,
  merchantLongitude: 106.684,
  deliveryOption: "SAVER",
  maxStackedOrders: 3,
  dispatchTimeoutSeconds: 600,
  driverResponseTimeoutSeconds: 90,
};

async function validatePayload(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateDispatchDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe("CreateDispatchDto", () => {
  /**
   * Regression: order-service gửi kèm `priorityRank` khi tạo dispatch. Nếu DTO
   * không khai báo field này, ValidationPipe (forbidNonWhitelisted) trả 400 →
   * đơn READY không có dispatch và bị tạo lại nhầm thành FAST ở driver-app.
   */
  it("nhận payload đầy đủ từ order-service (kể cả priorityRank)", async () => {
    const errors = await validatePayload({
      ...BASE_PAYLOAD,
      priorityRank: 0,
      promisedDeliveryAt: new Date("2026-10-20T14:10:00.000Z").toISOString(),
    });

    expect(errors).toHaveLength(0);
  });

  it("vẫn từ chối field lạ để giữ chặt whitelist", async () => {
    const errors = await validatePayload({
      ...BASE_PAYLOAD,
      unknownField: "x",
    });

    expect(errors.some((error) => error.property === "unknownField")).toBe(
      true,
    );
  });
});
