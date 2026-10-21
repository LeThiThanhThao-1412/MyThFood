import { CaseContextService } from "../../modules/assistant/application/case-context.service";
import { buildUserPrompt } from "../../modules/assistant/domain/assistant.prompt";
import { CaseCategory } from "../../modules/case/domain/case.enums";

describe("CaseContextService — ngữ cảnh mở rộng & ẩn danh", () => {
  beforeAll(() => {
    process.env.AI_PII_MODE = "enforce";
    process.env.AI_CONTEXT_MENU = "true";
    process.env.AI_CONTEXT_PROMO = "true";
    process.env.AI_CONTEXT_MERCHANT_REVIEWS = "true";
    process.env.AI_CONTEXT_DRIVER_REVIEWS = "true";
    process.env.AI_CONTEXT_DRIVER_PROFILE = "true";
  });

  const now = new Date("2026-01-01T10:00:00.000Z");

  const caseMock: any = {
    id: { toString: () => "case-1" },
    caseNumber: "CASE-2026-000001",
    caseNumberValue: "CASE-2026-000001",
    caseType: "COMPLAINT",
    caseCategory: CaseCategory.NOT_RECEIVED,
    caseSeverity: "MEDIUM",
    caseStatus: "UNDER_REVIEW",
    caseOrderId: "order-1",
    caseReporterId: "consumer-uuid",
    caseReporterType: "CONSUMER",
    caseRespondentId: "merchant-uuid",
    caseRespondentType: "MERCHANT",
    caseSubject: "Thiếu 1 phần cơm gà",
    caseDescription: "Tôi đặt 2 phần nhưng chỉ nhận 1. Gọi 0901234567 cho tôi.",
    caseEvidence: ["http://img/reporter.jpg"],
    caseRespondentResponse: "Quán đóng đủ 2 hộp.",
    caseRespondentEvidence: [],
    caseRespondentRespondedAt: null,
    caseResponseDeadline: null,
    createdAt: now,
  };

  const orderMock: any = {
    id: "order-1",
    consumerId: "consumer-uuid",
    driverId: "driver-uuid",
    merchantId: "merchant-uuid",
    status: "DELIVERED",
    totalAmount: 130000,
    deliveryAddress: "12 Nguyễn Huệ, Quận 1",
    deliveryLatitude: 10.7769,
    deliveryLongitude: 106.7009,
    notes: "Gọi 0901234567 khi tới",
    deliveryProofPhotoUrl: "http://img/proof.jpg",
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:40:00.000Z",
    items: [
      {
        menuItemId: "menu-1",
        name: "Cơm gà",
        quantity: 2,
        unitPrice: 65000,
        imageUrl: "http://img/menu.jpg",
        options: [{ optionName: "Lớn", priceDelta: 10000 }],
        specialInstructions: "Ít cay, gọi 0901234567",
      },
    ],
  };

  const integrationMock: any = {
    getOrder: jest.fn().mockResolvedValue(orderMock),
    getOrderTimeline: jest.fn().mockResolvedValue({
      timeline: [
        {
          previousStatus: "PICKED_UP",
          newStatus: "DELIVERED",
          reason: null,
          occurredAt: "2026-01-01T09:40:00.000Z",
        },
      ],
    }),
    getDispatchByOrder: jest.fn().mockResolvedValue({
      status: "DELIVERED",
      driverId: "driver-uuid",
      pickedUpAt: "2026-01-01T09:10:00.000Z",
      deliveredAt: "2026-01-01T09:40:00.000Z",
      deliveryAddress: "12 Nguyễn Huệ",
      deliveryLatitude: 10.7769,
      deliveryLongitude: 106.7009,
    }),
    getChatMessagesByOrder: jest.fn().mockResolvedValue([
      {
        senderId: "driver-user-uuid",
        senderRole: "DRIVER",
        content: "Gọi 0901234567 nhé",
        createdAt: "2026-01-01T09:35:00.000Z",
      },
    ]),
    getReviewsByOrder: jest.fn().mockResolvedValue({
      id: "review-1",
      consumerId: "consumer-uuid",
      rating: 5,
      comment: "Ngon",
      tags: ["ngon"],
      images: ["http://img/review.jpg"],
      merchantReply: null,
      driverRating: 5,
      driverComment: "Thân thiện",
      createdAt: "2026-01-01T09:45:00.000Z",
    }),
    getPaymentByOrder: jest.fn().mockResolvedValue(null),
    getDriverLocationHistory: jest.fn().mockResolvedValue([
      {
        latitude: 10.78,
        longitude: 106.695,
        recordedAt: "2026-01-01T09:35:00.000Z",
        orderId: "order-1",
      },
      {
        latitude: 10.777,
        longitude: 106.7005,
        recordedAt: "2026-01-01T09:39:00.000Z",
        orderId: "order-1",
      },
    ]),
    getDriverProfile: jest.fn().mockResolvedValue({
      rating: 4.8,
      totalRatings: 300,
      fullName: "Trần B",
      phoneNumber: "0908888888",
    }),
    getMerchant: jest.fn().mockResolvedValue({
      id: "merchant-uuid",
      name: "Quán A",
      phone: "0909999999",
      email: "a@quan.vn",
      address: "1 Lê Lợi",
      userId: "owner-uuid",
      rating: 4.2,
      totalRatings: 120,
      totalOrders: 1000,
      status: "ACTIVE",
      isOpen: true,
    }),
    getConsumerByUserId: jest.fn().mockResolvedValue({
      full_name: "Nguyễn Văn A",
      phone: "0901234567",
      addresses: ["12 Nguyễn Huệ"],
      payment_methods: [{ type: "CARD" }],
      status: "ACTIVE",
      isVerified: true,
      createdAt: "2025-01-01T00:00:00.000Z",
    }),
    getOrdersByConsumer: jest.fn().mockResolvedValue([]),
    getOrdersByDriver: jest.fn().mockResolvedValue([]),
    getWalletTransactions: jest.fn().mockResolvedValue([]),
    getMerchantMenu: jest.fn().mockResolvedValue([
      {
        id: "menu-1",
        merchantId: "merchant-uuid",
        name: "Cơm gà",
        description: "Cơm gà xối mỡ",
        price: 70000,
        originalPrice: null,
        imageUrl: "http://img/menu.jpg",
        isAvailable: false,
        availabilityStatus: "OUT_OF_STOCK",
        outOfStockUntil: "2026-01-02T00:00:00.000Z",
        preparationTime: 15,
        isFeatured: true,
        optionGroups: [
          {
            name: "Size",
            required: true,
            options: [{ name: "Lớn", priceDelta: 10000 }],
          },
        ],
      },
    ]),
    getMerchantPromotions: jest.fn().mockResolvedValue([
      {
        code: "SALE20",
        type: "PERCENT",
        target: "FOOD",
        fundedBy: "MERCHANT",
        value: 20,
        minOrderValue: 100000,
        maxDiscount: 30000,
        menuItemName: null,
        isActive: true,
        startAt: null,
        endAt: null,
        usageLimit: 100,
        usageLimitPerUser: 2,
        usedCount: 30,
      },
    ]),
    getMerchantFlashSales: jest.fn().mockResolvedValue([
      {
        id: "sale-1",
        status: "ACTIVE",
        startAt: null,
        endAt: null,
        items: [
          {
            menuItemId: "menu-1",
            menuItemName: "Cơm gà",
            originalPrice: 70000,
            salePrice: 60000,
            discountPercent: 14,
            totalQuantity: 100,
            soldQuantity: 30,
            limitPerUser: 2,
          },
        ],
      },
    ]),
    getPromotionUsageByOrder: jest.fn().mockResolvedValue({
      orderId: "order-1",
      promotionUsage: { promotionId: "promo-1", discountAmount: 20000 },
      promotion: { code: "SALE20", fundedBy: "MERCHANT" },
      flashSaleUsages: [],
    }),
    getMerchantReviews: jest.fn().mockResolvedValue({
      items: [
        {
          rating: 2,
          comment: "Thiếu món",
          tags: ["thiếu món"],
          merchantReply: null,
          createdAt: "2025-12-01T00:00:00.000Z",
        },
      ],
      total: 1,
      averageRating: 2,
    }),
    getDriverReviews: jest.fn().mockResolvedValue({
      items: [
        {
          driverRating: 5,
          driverComment: "Nhanh",
          createdAt: "2025-12-01T00:00:00.000Z",
        },
      ],
      total: 1,
      averageRating: 5,
      distribution: { "5": 1 },
    }),
    getDriverAnalyticsProfile: jest.fn().mockResolvedValue({
      rating: 4.8,
      totalRatings: 300,
      totalOrders: 1200,
      reputationScore: 96,
      status: "ACTIVE",
      onlineStatus: "ONLINE",
      vehicleType: "MOTORBIKE",
      fatigueLevel: "HIGH",
      consecutiveDrivingMinutes: 180,
      totalDrivingMinutesToday: 300,
      isTrainingCompleted: true,
      acceptBlockedUntil: null,
      activeOrderCount: 3,
      maxConcurrentOrders: 3,
      createdAt: "2024-01-01T00:00:00.000Z",
    }),
    downloadImage: jest.fn().mockImplementation((url: string) =>
      Promise.resolve({
        mimeType: "image/jpeg",
        base64: "AAAA",
        url,
      }),
    ),
  };

  const repoMock: any = {
    findById: jest.fn().mockResolvedValue(caseMock),
    findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
  };

  it("dựng snapshot đủ D15–D19, GPS/timeline và KHÔNG chứa PII", async () => {
    const service = new CaseContextService(repoMock, integrationMock);
    const { snapshot, images } = await service.build("case-1", 6);
    const json = JSON.stringify(snapshot);

    // PII không được lọt vào snapshot/prompt.
    expect(json).not.toContain("Nguyễn Văn A");
    expect(json).not.toContain("0901234567");
    expect(json).not.toContain("12 Nguyễn Huệ");
    expect(json).not.toContain("10.7769");
    expect(json).not.toContain("106.7009");
    expect(json).not.toContain("consumer-uuid");
    expect(json).not.toContain("driver-uuid");
    expect(json).not.toContain("merchant-uuid");
    expect(json).not.toContain("a@quan.vn");

    expect(snapshot.pii?.mode).toBe("enforce");
    expect(snapshot.pii?.redactedFields).toBeGreaterThan(0);
    expect(snapshot.case.reporterId).toMatch(/^KH-/);

    // Dữ liệu nghiệp vụ vẫn còn.
    expect(snapshot.orderItems?.[0]).toMatchObject({
      name: "Cơm gà",
      quantity: 2,
      unitPrice: 65000,
    });
    expect(snapshot.menuItems?.[0]).toMatchObject({
      name: "Cơm gà",
      price: 70000,
      orderUnitPrice: 65000,
      priceMismatch: true,
      isAvailable: false,
    });
    expect(snapshot.promotions?.orderUsage?.code).toBe("SALE20");
    expect(snapshot.promotions?.flashSaleItems[0]?.salePrice).toBe(60000);
    expect(snapshot.reviews?.order?.rating).toBe(5);
    expect(snapshot.reviews?.merchant?.recent[0]?.comment).toBe("Thiếu món");
    expect(snapshot.driverProfile?.reputationScore).toBe(96);
    expect(snapshot.gpsSignals?.minDistanceToDeliveryMeters).toBeLessThan(100);
    expect(snapshot.timeline?.length).toBeGreaterThan(0);

    const sourceIds = snapshot.sources.map((source) => source.id);
    expect(sourceIds).toEqual(
      expect.arrayContaining(["D15", "D16", "D17", "D18", "D19"]),
    );
    expect(snapshot.sources.find((s) => s.id === "D15")?.available).toBe(true);
    expect(snapshot.sources.find((s) => s.id === "D19")?.available).toBe(true);

    // Ảnh: proof + reporter + menu + review (không có respondent).
    expect(snapshot.imagePlan).toMatchObject({
      deliveryProof: 1,
      reporter: 1,
      menuReference: 1,
      review: 1,
      respondent: 0,
    });
    expect(images).toHaveLength(4);
    expect(images.map((image) => image.kind)).toEqual([
      "DELIVERY_PROOF",
      "REPORTER",
      "MENU_REFERENCE",
      "REVIEW",
    ]);

    // Prompt cuối cùng: có thẻ dữ liệu mới, không có PII, vẫn giữ dữ liệu nghiệp vụ.
    const prompt = buildUserPrompt(snapshot);
    expect(prompt).toContain("<THUC_DON>");
    expect(prompt).toContain("<UU_DAI>");
    expect(prompt).toContain("<DANH_GIA>");
    expect(prompt).toContain("<HO_SO_TAI_XE>");
    expect(prompt).toContain("<DONG_THOI_GIAN>");
    expect(prompt).toContain("<TIN_HIEU_GPS>");
    expect(prompt).toContain("<AN_DANH>");
    expect(prompt).toContain("Quán A");
    expect(prompt).toContain("SALE20");
    expect(prompt).not.toContain("0901234567");
    expect(prompt).not.toContain("Nguyễn Văn A");
    expect(prompt).not.toContain("10.7769");
  });
});
