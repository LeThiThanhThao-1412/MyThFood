/**
 * Hồi quy cho hai lỗi parity đã phát hiện bằng phép đối chiếu thật (11/11/2026):
 *   (i) bốn cột danh sách của `consumers` lưu JSON trong text ⇒ handler phải
 *       parse, nếu không sẽ trả `"[]"` (chuỗi) thay vì `[]` (mảng);
 *   (ii) `latitude`/`longitude`/`rating` là `numeric` ⇒ `pg` trả chuỗi, nên câu
 *       SELECT phải ép `::float8`, và handler phải giữ nguyên số khi đã ép.
 *
 * Không có Postgres trong test: `pg.Pool` được thay bằng hàng đã chuẩn bị sẵn.
 * Điều này kiểm tra đúng phần dễ sai (ánh xạ hàng → payload), không kiểm tra SQL
 * thật — việc đó do `scripts/research/parity-check.js` làm trên container.
 */
const mockPgState: { rows: Record<string, unknown>[]; queries: string[] } = {
  rows: [],
  queries: [],
};

jest.mock("pg", () => ({
  Pool: jest.fn().mockImplementation(() => ({
    query: async (sql: string) => {
      mockPgState.queries.push(sql);
      return { rows: mockPgState.rows };
    },
    end: async () => undefined,
  })),
}));

import { InProcessHttpError } from "../in-process/in-process.types";
import { pgReadHandlers } from "../in-process/pg-read-handlers";

const consumerRoute = pgReadHandlers().find(
  (route) => route.name === "consumer.getById(pg)",
);
const merchantRoute = pgReadHandlers().find(
  (route) => route.name === "merchant.getById(pg)",
);

const CONSUMER_ID = "7f4d2a58-0000-4000-8000-000000000001";
const MERCHANT_ID = "21b76b38-00fa-4c82-a68a-79ad754a012d";

function consumerRequest() {
  return {
    method: "GET",
    url: `/api/v1/consumers/${CONSUMER_ID}`,
    target: "consumer-service:3002",
    path: `/api/v1/consumers/${CONSUMER_ID}`,
    query: {},
    body: null,
    headers: {},
  };
}

function merchantRequest() {
  return {
    method: "GET",
    url: `/api/v1/merchants/${MERCHANT_ID}`,
    target: "merchant-service:3003",
    path: `/api/v1/merchants/${MERCHANT_ID}`,
    query: {},
    body: null,
    headers: {},
  };
}

const consumerRow = (): Record<string, unknown> => ({
  id: CONSUMER_ID,
  user_id: "u-1",
  full_name: "Nguyen Van A",
  avatar: null,
  date_of_birth: null,
  gender: "male",
  status: "active",
  is_verified: true,
  id_card_number: null,
  addresses: '[{"label":"nha","lat":10.1}]',
  payment_methods: '["cod"]',
  favorite_merchant_ids: '["m-1"]',
  favorite_menu_item_ids: "[]",
});

describe("pgReadHandlers", () => {
  beforeEach(() => {
    mockPgState.rows = [];
    mockPgState.queries = [];
  });

  it("parse bốn cột danh sách của consumer từ text JSON thành mảng", async () => {
    mockPgState.rows = [consumerRow()];

    const response = await consumerRoute!.handler(consumerRequest());
    const payload = response.data as {
      statusCode: number;
      data: Record<string, unknown>;
    };

    expect(payload.statusCode).toBe(200);
    expect(payload.data.addresses).toEqual([{ label: "nha", lat: 10.1 }]);
    expect(payload.data.paymentMethods).toEqual(["cod"]);
    expect(payload.data.favoriteMerchantIds).toEqual(["m-1"]);
    expect(payload.data.favoriteMenuItemIds).toEqual([]);
  });

  it("đổi tên cột sang camelCase", async () => {
    mockPgState.rows = [consumerRow()];

    const response = await consumerRoute!.handler(consumerRequest());
    const data = (response.data as { data: Record<string, unknown> }).data;

    expect(data.userId).toBe("u-1");
    expect(data.fullName).toBe("Nguyen Van A");
    expect(data.isVerified).toBe(true);
    expect(data).not.toHaveProperty("user_id");
  });

  it("ép ::float8 cho các cột numeric của merchant và parse secondaryCategories", async () => {
    mockPgState.rows = [
      {
        id: MERCHANT_ID,
        user_id: "u-2",
        name: "Quan A",
        description: null,
        logo_url: null,
        cover_image_url: null,
        phone: null,
        email: null,
        address: "1 Duong ABC",
        latitude: 10.7626,
        longitude: 106.6602,
        status: "active",
        rating: 4.5,
        total_ratings: 10,
        total_orders: 99,
        capacity_status: "available",
        current_order_count: 0,
        primary_category: "com",
        secondary_categories: '["bun","pho"]',
        other_category_description: null,
        is_open: true,
        rejected_at: null,
        reject_reason: null,
        created_at: new Date("2026-01-02T03:04:05.000Z"),
        updated_at: new Date("2026-01-02T03:04:05.000Z"),
      },
    ];

    const response = await merchantRoute!.handler(merchantRequest());

    const sql = mockPgState.queries[mockPgState.queries.length - 1];
    expect(sql).toContain("latitude::float8");
    expect(sql).toContain("longitude::float8");
    expect(sql).toContain("rating::float8");

    // Bản HTTP trả entity trần, không envelope.
    const data = response.data as Record<string, unknown>;
    expect(data.statusCode).toBeUndefined();
    expect(typeof data.latitude).toBe("number");
    expect(typeof data.longitude).toBe("number");
    expect(data.secondaryCategories).toEqual(["bun", "pho"]);
    expect(data.createdAt).toBe("2026-01-02T03:04:05.000Z");
    // `isOpenNow` là trường tính toán, order-service không đọc ⇒ không có trong payload.
    expect(data).not.toHaveProperty("isOpenNow");
  });

  it("trả lỗi 404 có mã HTTP khi không tìm thấy bản ghi", async () => {
    mockPgState.rows = [];

    await expect(
      merchantRoute!.handler(merchantRequest()),
    ).rejects.toMatchObject({ name: "InProcessHttpError", status: 404 });
    await expect(
      merchantRoute!.handler(merchantRequest()),
    ).rejects.toBeInstanceOf(InProcessHttpError);
  });
});
