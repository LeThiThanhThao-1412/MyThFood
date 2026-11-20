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
      {
        menuItemId: "menu-2",
        name: "Trà đá",
        quantity: 1,
        unitPrice: 5000,
        imageUrl: "http://img/menu2.jpg",
        options: [],
        specialInstructions: null,
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
    getConsumerProfile: jest.fn().mockResolvedValue({
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
      {
        id: "menu-2",
        merchantId: "merchant-uuid",
        name: "Trà đá",
        description: null,
        price: 5000,
        originalPrice: null,
        imageUrl: "http://img/menu2.jpg",
        isAvailable: true,
        availabilityStatus: "AVAILABLE",
        outOfStockUntil: null,
        preparationTime: 2,
        isFeatured: false,
        optionGroups: [],
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
    downloadImageDetailed: jest.fn().mockImplementation((url: string) =>
      Promise.resolve({
        image: { mimeType: "image/jpeg", base64: "AAAA", url },
        reason: "",
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
      menuReference: 2,
      review: 1,
      respondent: 0,
    });
    expect(snapshot.imageOrder).toEqual([
      "DELIVERY_PROOF",
      "REPORTER",
      "RESPONDENT",
      "MENU_REFERENCE",
      "REVIEW",
    ]);
    expect(images).toHaveLength(5);
    expect(images.map((image) => image.kind)).toEqual([
      "DELIVERY_PROOF",
      "REPORTER",
      "MENU_REFERENCE",
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

  it("sự cố món ăn: ảnh chuẩn món đứng trước nhưng vẫn chừa 1 suất cho mỗi bên", async () => {
    const itemRepoMock: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseCategory: CaseCategory.MISSING_ITEM,
        caseRespondentEvidence: [
          "http://img/respondent1.jpg",
          "http://img/respondent2.jpg",
        ],
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const service = new CaseContextService(itemRepoMock, integrationMock);
    const { snapshot, images } = await service.build("case-1", 4);

    expect(snapshot.imageOrder).toEqual([
      "DELIVERY_PROOF",
      "MENU_REFERENCE",
      "REPORTER",
      "RESPONDENT",
      "REVIEW",
    ]);
    // Limit 4: proof 1 + món tối đa 2, nhưng phải chừa 1 suất cho MỖI bên có ảnh
    // ⇒ món chỉ còn 1. Trước đây món lấy 2 ⇒ bên bị khiếu nại bị 0 ảnh.
    expect(snapshot.imagePlan).toMatchObject({
      deliveryProof: 1,
      menuReference: 1,
      reporter: 1,
      respondent: 1,
      review: 0,
    });
    expect(images.map((image) => image.kind)).toEqual([
      "DELIVERY_PROOF",
      "MENU_REFERENCE",
      "REPORTER",
      "RESPONDENT",
    ]);
  });

  it("tải được ảnh của bên khiếu nại dù URL không có đuôi ảnh", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseEvidence: [
          "https://cdn.example.com/api/v1/upload/complaints/1729000000-ab12cd",
          "https://cdn.example.com/api/v1/upload/complaints/1729000001-ef34gh.jpg",
        ],
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const integration: any = {
      ...integrationMock,
      downloadImageDetailed: jest.fn().mockResolvedValue({
        image: { mimeType: "image/jpeg", base64: "AAAA" },
        reason: "",
      }),
    };

    const service = new CaseContextService(repo, integration);
    const { snapshot, images } = await service.build("case-1", 3);

    const reporterImages = images.filter((image) => image.kind === "REPORTER");
    expect(reporterImages).toHaveLength(2);
    // URL không đuôi vẫn được tải (trước đây bị lọc bằng IMAGE_EXT).
    expect(integration.downloadImageDetailed).toHaveBeenCalledWith(
      "https://cdn.example.com/api/v1/upload/complaints/1729000000-ab12cd",
    );
    expect(snapshot.imagePlan?.reporter).toBe(2);
    expect(snapshot.imagesSkipped).toHaveLength(0);
  });

  it("vụ món ăn: ảnh chuẩn món không được chiếm hết suất của ảnh bên khiếu nại", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseCategory: CaseCategory.MISSING_ITEM,
        caseEvidence: ["http://img/reporter.jpg"],
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const service = new CaseContextService(repo, integrationMock);
    // Chỉ 2 suất: 1 cho ảnh giao hàng ⇒ phải chừa 1 suất cho ảnh khách.
    const { snapshot, images } = await service.build("case-1", 2);

    expect(snapshot.imageOrder?.[1]).toBe("MENU_REFERENCE");
    expect(images.map((image) => image.kind)).toEqual([
      "DELIVERY_PROOF",
      "REPORTER",
    ]);
    expect(snapshot.imagePlan?.reporter).toBe(1);
    expect(snapshot.imagePlan?.menuReference).toBe(0);
  });

  it("xem trước ngữ cảnh (maxImages = 0) vẫn báo ảnh CÓ SẴN của hai bên", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseEvidence: ["http://img/reporter.webp", "ghi chú: ảnh bị mờ"],
        caseRespondentEvidence: ["http://img/respondent.jpg"],
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const integration: any = {
      ...integrationMock,
      downloadImageDetailed: jest.fn(),
    };

    const service = new CaseContextService(repo, integration);
    const { snapshot, images } = await service.build("case-1", 0);

    expect(images).toHaveLength(0);
    expect(snapshot.imagesAttached).toBe(0);
    expect(snapshot.imagePlan).toMatchObject({ reporter: 0, respondent: 0 });
    // Ảnh tồn tại ⇒ admin thấy được, không phải "không có ảnh".
    expect(snapshot.imagesAvailable).toMatchObject({
      reporter: 1,
      respondent: 1,
      deliveryProof: 1,
    });
    expect(integration.downloadImageDetailed).not.toHaveBeenCalled();
  });

  it("nguồn lỗi ghi rõ nguyên nhân (401/404) thay vì thông báo chung", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseCategory: CaseCategory.CHARGEBACK_FRAUD,
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const integration: any = {
      ...integrationMock,
      getPaymentByOrder: jest
        .fn()
        .mockRejectedValue(
          new Error(
            "GET /api/v1/payments/order/order-1 thất bại (1 lần thử): http://localhost:3006/api/v1/payments/order/order-1 → 401 Unauthorized",
          ),
        ),
    };

    const service = new CaseContextService(repo, integration);
    const { snapshot } = await service.build("case-1", 0);

    const paymentSource = snapshot.sources.find((s) => s.id === "D6");
    expect(paymentSource?.available).toBe(false);
    expect(paymentSource?.detail).toContain("401");
    expect(paymentSource?.detail).toContain("/api/v1/payments/order/order-1");
  });

  it("D8 truyền ownerType của chủ ví (wallet mặc định DRIVER)", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseCategory: CaseCategory.COD_THEFT,
        caseRespondentId: "consumer-uuid",
        caseRespondentType: "CONSUMER",
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const integration: any = {
      ...integrationMock,
      getWalletTransactions: jest
        .fn()
        .mockResolvedValue([{ id: "tx-1", amount: 50000 }]),
    };

    const service = new CaseContextService(repo, integration);
    await service.build("case-1", 0);

    expect(integration.getWalletTransactions).toHaveBeenCalledWith(
      "consumer-uuid",
      "CONSUMER",
    );
  });

  it("gọi service nội bộ bằng ID gốc, không dùng mã ẩn danh TX-/NH-", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseCategory: CaseCategory.WRONG_ITEM,
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };

    const service = new CaseContextService(repo, integrationMock);
    const { snapshot } = await service.build("case-1", 0);

    // Snapshot đã ẩn danh cho model…
    expect(snapshot.case.respondentId).toMatch(/^NH-/);
    // …nhưng driver-service/merchant-service phải nhận UUID. Gửi TX-/NH- vào URL
    // làm Postgres lỗi cast uuid ⇒ mọi nguồn D4/D10–D12/D15–D19 trả 500.
    expect(integrationMock.getDriverLocationHistory).toHaveBeenCalledWith(
      "driver-uuid",
      expect.objectContaining({ orderId: "order-1" }),
    );
    expect(integrationMock.getDriverProfile).toHaveBeenCalledWith(
      "driver-uuid",
    );
    expect(integrationMock.getOrdersByDriver).toHaveBeenCalledWith(
      "driver-uuid",
    );
    expect(integrationMock.getDriverReviews).toHaveBeenCalledWith(
      "driver-uuid",
      expect.any(Number),
    );
    expect(integrationMock.getDriverAnalyticsProfile).toHaveBeenCalledWith(
      "driver-uuid",
    );
    expect(integrationMock.getMerchant).toHaveBeenCalledWith("merchant-uuid");
    expect(integrationMock.getMerchantMenu).toHaveBeenCalledWith(
      "merchant-uuid",
    );
    expect(integrationMock.getMerchantReviews).toHaveBeenCalledWith(
      "merchant-uuid",
      expect.any(Number),
    );
  });

  it("không gọi service bằng mã ẩn danh khi không có ID thật của tài xế", async () => {
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseOrderId: null,
        caseCategory: CaseCategory.DRIVER_BEHAVIOR,
        caseRespondentType: "DRIVER",
        caseRespondentId: "TX-2D8256",
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const integration: any = {
      ...integrationMock,
      getDriverLocationHistory: jest.fn(),
      getDriverProfile: jest.fn(),
      getOrdersByDriver: jest.fn(),
      getDriverAnalyticsProfile: jest.fn(),
    };

    const service = new CaseContextService(repo, integration);
    const { snapshot } = await service.build("case-1", 0);

    expect(integration.getDriverLocationHistory).not.toHaveBeenCalled();
    expect(integration.getDriverProfile).not.toHaveBeenCalled();
    const d4 = snapshot.sources.find((s) => s.id === "D4");
    expect(d4?.available).toBe(false);
    expect(d4?.detail).toContain("Không xác định được tài xế");
  });

  it("ghi nguyên nhân ảnh không tải được (imageSkipReasons)", async () => {
    const evidenceUrl = "http://localhost:3010/api/v1/upload/complaints/abc";
    const repo: any = {
      findById: jest.fn().mockResolvedValue({
        ...caseMock,
        caseCategory: CaseCategory.WRONG_ITEM,
        caseEvidence: [evidenceUrl],
        caseRespondentEvidence: [],
      }),
      findAndCount: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const integration: any = {
      ...integrationMock,
      downloadImageDetailed: jest.fn().mockResolvedValue({
        image: null,
        reason: `http://upload-service:3010/api/v1/upload/complaints/abc → 404 File not found`,
      }),
    };

    const service = new CaseContextService(repo, integration);
    const { snapshot, images } = await service.build("case-1", 3);

    expect(images.filter((image) => image.kind === "REPORTER")).toHaveLength(0);
    expect(snapshot.imagesSkipped).toContain(evidenceUrl);
    const entry = (snapshot.imageSkipReasons ?? []).find(
      (item) => item.url === evidenceUrl,
    );
    expect(entry?.reason).toContain("404 File not found");
  });
});
