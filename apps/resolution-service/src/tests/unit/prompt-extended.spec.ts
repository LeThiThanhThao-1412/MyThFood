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

  it("báo rõ bên khiếu nại CÓ ảnh nhưng chưa gửi kèm thay vì nói 'không có ảnh'", () => {
    const base = snapshot();
    const prompt = buildUserPrompt({
      ...base,
      imagesAttached: 1,
      reporterImagesAttached: 0,
      reporterImageUrls: [],
      imagesAvailable: {
        deliveryProof: 1,
        menuReference: 1,
        reporter: 2,
        respondent: 0,
        review: 0,
      },
    } as CaseContextSnapshot);

    expect(prompt).toContain(
      "Bên KHIẾU NẠI CÓ 2 ảnh bằng chứng nhưng không được gửi kèm",
    );
    expect(prompt).not.toContain(
      'Bên KHIẾU NẠI không có ảnh ⇒ reporterImages.support="NO_IMAGE".',
    );
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

  it("tôn trọng imageOrder món-trước của snapshot mới", () => {
    const base = snapshot();
    const prompt = buildImagePrompt({
      ...base,
      imageOrder: [
        "DELIVERY_PROOF",
        "MENU_REFERENCE",
        "REPORTER",
        "RESPONDENT",
        "REVIEW",
      ],
    } as CaseContextSnapshot);

    const menuPos = prompt.indexOf("[ẢNH CHUẨN MÓN TỪ THỰC ĐƠN");
    const reporterPos = prompt.indexOf("[BÊN KHIẾU NẠI]");
    expect(menuPos).toBeGreaterThan(-1);
    expect(reporterPos).toBeGreaterThan(-1);
    expect(menuPos).toBeLessThan(reporterPos);
  });

  it("liệt kê đúng URL ảnh ĐÃ TẢI (reporterImageUrls), không phải toàn bộ evidence", () => {
    const base = snapshot();
    const prompt = buildImagePrompt({
      ...base,
      imagesAttached: 2,
      case: {
        ...base.case,
        evidence: ["http://img/hong-khong-tai-duoc", "http://img/that.jpg"],
      },
      reporterImageUrls: ["http://img/that.jpg"],
      reporterImagesAttached: 1,
    } as CaseContextSnapshot);

    expect(prompt).toContain("[BÊN KHIẾU NẠI] http://img/that.jpg");
    // Link hỏng (đã bị bỏ qua khi tải) không được gán nhãn ảnh.
    expect(prompt).not.toContain("hong-khong-tai-duoc");
  });

  it("nhãn “[BÊN KHIẾU NẠI]” xuất hiện đúng số ảnh đã tải, kể cả URL không đuôi ảnh", () => {
    const base = snapshot();
    const prompt = buildImagePrompt({
      ...base,
      imagesAttached: 3,
      case: {
        ...base.case,
        evidence: [
          "https://cdn.local/api/v1/upload/complaints/1729000000-ab12cd",
        ],
      },
      reporterImageUrls: [
        "https://cdn.local/api/v1/upload/complaints/1729000000-ab12cd",
      ],
      reporterImagesAttached: 1,
    } as CaseContextSnapshot);

    const labels = prompt.match(/\[BÊN KHIẾU NẠI\]/g) ?? [];
    expect(labels).toHaveLength(1);
    expect(prompt).toContain(
      "[BÊN KHIẾU NẠI] https://cdn.local/api/v1/upload/complaints/1729000000-ab12cd",
    );
  });
});

describe("buildUserPrompt — nhãn ảnh khớp đúng thứ tự ảnh đã gửi", () => {
  it("sự cố món ăn: ảnh chuẩn món chen giữa ảnh giao hàng và ảnh khách, số thứ tự liền mạch", () => {
    const base = snapshot();
    const prompt = buildUserPrompt({
      ...base,
      imageOrder: [
        "DELIVERY_PROOF",
        "MENU_REFERENCE",
        "REPORTER",
        "RESPONDENT",
        "REVIEW",
      ],
      imagePlan: {
        deliveryProof: 1,
        menuReference: 1,
        reporter: 1,
        respondent: 0,
        review: 0,
      },
      imagesAttached: 3,
    } as CaseContextSnapshot);

    const proofPos = prompt.indexOf("1. [ẢNH HỆ THỐNG");
    const menuPos = prompt.indexOf("2. [ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — Cơm gà]");
    const reporterPos = prompt.indexOf("3. [BÊN KHIẾU NẠI]");
    expect(proofPos).toBeGreaterThan(-1);
    expect(menuPos).toBeGreaterThan(proofPos);
    expect(reporterPos).toBeGreaterThan(menuPos);
    expect(prompt).toContain(
      "2. [ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — Cơm gà] http://img/menu.jpg",
    );
  });

  it("không gán nhãn cho ảnh vượt quá số ảnh thực sự đính kèm", () => {
    const base = snapshot();
    const prompt = buildUserPrompt({
      ...base,
      imageOrder: ["DELIVERY_PROOF", "REPORTER", "RESPONDENT"],
      imagePlan: {
        deliveryProof: 1,
        menuReference: 0,
        reporter: 1,
        respondent: 0,
        review: 0,
      },
      imagesAttached: 1,
    } as CaseContextSnapshot);

    expect(prompt).toContain("1. [ẢNH HỆ THỐNG");
    expect(prompt).not.toContain("2. [BÊN KHIẾU NẠI]");
  });

  it("bỏ qua URL tải hỏng (imagesSkipped) để nhãn không lệch ảnh đã gửi", () => {
    const base = snapshot();
    const context = {
      ...base,
      imagesSkipped: ["http://img/menu-a.jpg"],
      imageOrder: ["DELIVERY_PROOF", "MENU_REFERENCE", "REPORTER"] as const,
      imagePlan: {
        deliveryProof: 1,
        menuReference: 1,
        reporter: 0,
        respondent: 0,
        review: 0,
      },
      imagesAttached: 2,
      reporterImagesAttached: 0,
      reporterImageUrls: [],
      menuItems: [
        {
          ...base.menuItems![0],
          menuItemId: "menu-a",
          name: "Menu A",
          imageUrl: "http://img/menu-a.jpg",
        },
        {
          ...base.menuItems![0],
          menuItemId: "menu-b",
          name: "Menu B",
          imageUrl: "http://img/menu-b.jpg",
        },
      ],
    } as unknown as CaseContextSnapshot;

    const imagePrompt = buildImagePrompt(context);
    const userPrompt = buildUserPrompt(context);

    // Ảnh menu-a tải hỏng ⇒ không được gán nhãn; menu-b nhận đúng số 2.
    expect(imagePrompt).not.toContain("menu-a.jpg");
    expect(imagePrompt).toContain("2. [ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — Menu B]");
    expect(imagePrompt).toContain("http://img/menu-b.jpg");
    // `<THUC_DON>` vẫn nêu URL ảnh chuẩn của món A (dữ liệu), nhưng KHÔNG được
    // gán nhãn ảnh vì ảnh đó không được gửi.
    expect(userPrompt).not.toContain("[ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — Menu A]");
    expect(userPrompt).toContain("2. [ẢNH CHUẨN MÓN TỪ THỰC ĐƠN — Menu B]");
  });
});
