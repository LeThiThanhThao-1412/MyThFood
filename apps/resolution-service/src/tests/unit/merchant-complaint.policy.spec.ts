import {
  complaintPeriodKey,
  decideMerchantComplaintLevel,
  MERCHANT_COMPLAINT_DEFAULTS,
  startOfIsoWeek,
} from "../../modules/monitor/domain/merchant-complaint.policy";

const base = {
  minOrders: MERCHANT_COMPLAINT_DEFAULTS.minOrders,
  warnRate: MERCHANT_COMPLAINT_DEFAULTS.warnRate,
  lockRate: MERCHANT_COMPLAINT_DEFAULTS.lockRate,
};

describe("decideMerchantComplaintLevel", () => {
  it("không đánh giá khi chưa có đơn (tránh chia cho 0)", () => {
    expect(
      decideMerchantComplaintLevel({
        ...base,
        totalOrders: 0,
        validComplaints: 0,
      }),
    ).toEqual({ level: "NONE", rate: 0 });
  });

  it("không cảnh báo khi tỉ lệ đúng 5%", () => {
    expect(
      decideMerchantComplaintLevel({
        ...base,
        totalOrders: 20,
        validComplaints: 1,
      }),
    ).toEqual({ level: "NONE", rate: 0.05 });
  });

  it("cảnh báo khi tỉ lệ trên 5%", () => {
    expect(
      decideMerchantComplaintLevel({
        ...base,
        totalOrders: 20,
        validComplaints: 2,
      }),
    ).toEqual({ level: "WARNING", rate: 0.1 });
  });

  it("chỉ cảnh báo khi tỉ lệ đúng 15%", () => {
    expect(
      decideMerchantComplaintLevel({
        ...base,
        totalOrders: 20,
        validComplaints: 3,
      }),
    ).toEqual({ level: "WARNING", rate: 0.15 });
  });

  it("khóa tài khoản khi tỉ lệ trên 15%", () => {
    expect(
      decideMerchantComplaintLevel({
        ...base,
        totalOrders: 20,
        validComplaints: 4,
      }),
    ).toEqual({ level: "LOCK", rate: 0.2 });
  });

  it("bỏ qua nhà hàng chưa đủ số đơn tối thiểu", () => {
    expect(
      decideMerchantComplaintLevel({
        ...base,
        minOrders: 10,
        totalOrders: 5,
        validComplaints: 5,
      }),
    ).toEqual({ level: "NONE", rate: 1 });
  });

  it("tỉ lệ được làm tròn 4 chữ số thập phân", () => {
    const decision = decideMerchantComplaintLevel({
      ...base,
      totalOrders: 3,
      validComplaints: 1,
    });
    expect(decision.rate).toBe(0.3333);
    expect(decision.level).toBe("LOCK");
  });
});

describe("complaintPeriodKey", () => {
  it("cùng một tuần cho cùng khóa (chống tạo cảnh báo trùng)", () => {
    const monday = new Date("2026-11-16T03:00:00.000Z");
    const sunday = new Date("2026-11-22T20:00:00.000Z");
    expect(complaintPeriodKey(monday)).toBe("2026-W47");
    expect(complaintPeriodKey(sunday)).toBe("2026-W47");
  });

  it("tuần kế tiếp đổi khóa", () => {
    expect(complaintPeriodKey(new Date("2026-11-23T00:00:00.000Z"))).toBe(
      "2026-W48",
    );
  });

  it("startOfIsoWeek trả về thứ Hai 00:00 UTC", () => {
    const start = startOfIsoWeek(new Date("2026-11-21T15:30:00.000Z"));
    expect(start.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});
