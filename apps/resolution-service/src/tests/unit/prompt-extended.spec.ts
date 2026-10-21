import { CaseContextSnapshot } from "../../modules/assistant/domain/assistant.types";
import {
  buildImagePrompt,
  buildUserPrompt,
} from "../../modules/assistant/domain/assistant.prompt";

function snapshot(): CaseContextSnapshot {
  return {
    generatedAt: "2026-01-01T00:00:00.000Z",
    case: {
      id: "case-1",
      caseNumber: "CASE-2026-000001",
      type: "COMPLAINT",
      category: "MISSING_ITEM",
      severity: "MEDIUM",
      status: "UNDER_REVIEW",
      orderId: "order-1",
      reporterId: "KH-ABC123",
      reporterType: "CONSUMER",
      respondentId: "NH-DEF456",
      respondentType: "MERCHANT",
      subject: "Thiếu 1 phần cơm gà",
      description: "Tôi đặt 2 phần nhưng chỉ nhận 1",
      evidence: ["http://img/1.jpg"],
      respondentResponse: "Quán đã đóng đủ 2 hộp",
      respondentEvidence: [],
      respondentRespondedAt: null,
      createdAt: "2026-01-01T11:00:00.000Z",
      responseDeadline: null,
    },
    sources: [
      {
        id: "D1",
        name: "Chi tiết đơn hàng",
        available: true,
        payload: { totalAmount: 130000 },
      },
      {
        id: "D15",
        name: "Thực đơn nhà hàng",
        available: true,
        payload: { SHOULD_NOT_BE_DUMPED: true },
      },
      {
        id: "D16",
        name: "Khuyến mãi",
        available: true,
        payload: { SHOULD_NOT_BE_DUMPED: true },
      },
    ],
    missingSourceIds: [],
    criticalMissingSourceIds: [],
    imagesAttached: 3,
    deliveryProofPhotoUrl: "http://img/proof.jpg",
    deliveryProofImageAttached: true,
    reporterImagesAttached: 1,
    respondentImagesAttached: 0,
    imagesSkipped: [],
    orderItems: [
      {
        menuItemId: "menu-1",
        name: "Cơm gà",
        quantity: 2,
        unitPrice: 65000,
        options: "Lớn",
        imageUrl: "http://img/menu.jpg",
        specialInstructions: null,
      },
    ],
    orderTotalAmount: 130000,
    menuItems: [
      {
        menuItemId: "menu-1",
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
        optionGroups: ["Size (bắt buộc): Nhỏ, Lớn (+10000)"],
        orderedQuantity: 2,
        orderUnitPrice: 65000,
        priceMismatch: true,
      },
    ],
    promotions: {
      orderUsage: {
        code: "SALE20",
        discountAmount: 20000,
        fundedBy: "MERCHANT",
        flashSaleDiscount: null,
      },
      merchantPromotions: [
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
      ],
      flashSaleItems: [],
      configured: 1,
      usedInOrder: 1,
    },
    reviews: {
      order: {
        rating: 5,
        comment: "Ngon",
        tags: ["ngon"],
        imageCount: 1,
        merchantReply: null,
        driverRating: 5,
        driverComment: "Thân thiện",
        createdAt: "2026-01-01T10:50:00.000Z",
      },
      merchant: {
        averageRating: 4.2,
        total: 120,
        recent: [
          {
            rating: 2,
            comment: "Thiếu món",
            tags: ["thiếu món"],
            hasMerchantReply: true,
            createdAt: "2026-01-01T09:00:00.000Z",
          },
        ],
      },
      driver: null,
    },
    driverProfile: null,
    timeline: [
      {
        at: "2026-01-01T09:00:00.000Z",
        source: "D1",
        event: "Đơn được tạo",
      },
      {
        at: "2026-01-01T09:30:00.000Z",
        source: "D3",
        event: "Hệ thống ghi nhận đã giao",
      },
    ],
    gpsSignals: null,
    pii: {
      mode: "enforce",
      redactedFields: 7,
      redactedKinds: ["key:phone", "id:KH"],
      pseudonymizedIds: 2,
    },
    imagePlan: {
      deliveryProof: 1,
      menuReference: 1,
      reporter: 1,
      respondent: 0,
      review: 0,
    },
    menuImagesAttached: 1,
    reviewImagesAttached: 0,
  } as unknown as CaseContextSnapshot;
}

describe("buildUserPrompt — dữ liệu mở rộng", () => {
  it("có đủ thẻ dữ liệu mới và không dump JSON nguồn D15/D16", () => {
    const base = snapshot();
    const prompt = buildUserPrompt({
      ...base,
      driverProfile: {
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
      },
      gpsSignals: {
        points: 20,
        firstPointAt: "2026-01-01T09:00:00.000Z",
        lastPointAt: "2026-01-01T09:30:00.000Z",
        minDistanceToDeliveryMeters: 40,
        closestAt: "2026-01-01T09:29:00.000Z",
        lastPointDistanceMeters: 45,
        avgSpeedKmh: 22,
        maxSpeedKmh: 45,
        jumpCount: 0,
        duplicateRatio: 0.1,
        stoppedMinutes: 4,
      },
    } as CaseContextSnapshot);

    expect(prompt).toContain("<THUC_DON>");
    expect(prompt).toContain("LỆCH GIÁ");
    expect(prompt).toContain("HẾT HÀNG");
    expect(prompt).toContain("<UU_DAI>");
    expect(prompt).toContain("SALE20");
    expect(prompt).toContain("<DANH_GIA>");
    expect(prompt).toContain("<HO_SO_TAI_XE>");
    expect(prompt).toContain("<DONG_THOI_GIAN>");
    expect(prompt).toContain("<TIN_HIEU_GPS>");
    expect(prompt).toContain("<AN_DANH>");
    expect(prompt).not.toContain("SHOULD_NOT_BE_DUMPED");
    expect(prompt).toContain("chi tiết ở thẻ dữ liệu tương ứng");
  });

  it("vẫn giữ món đã đặt và cảnh báo thiếu nguồn bắt buộc", () => {
    const base = snapshot();
    const prompt = buildUserPrompt({
      ...base,
      criticalMissingSourceIds: ["D15"],
    } as CaseContextSnapshot);
    expect(prompt).toContain("<MON_DA_DAT>");
    expect(prompt).toContain("CẢNH BÁO DỮ LIỆU");
    expect(prompt).toContain("D15");
  });
});

describe("buildImagePrompt — nhãn ảnh chuẩn món", () => {
  it("liệt kê ảnh chuẩn món đúng thứ tự và ghi chú so sánh", () => {
    const prompt = buildImagePrompt(snapshot());
    expect(prompt).toContain("[ẢNH HỆ THỐNG");
    expect(prompt).toContain("[BÊN KHIẾU NẠI]");
    expect(prompt).toContain("[ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — Cơm gà]");
    expect(prompt).toContain("khác biệt nhỏ KHÔNG đồng nghĩa sai món");
  });
});
