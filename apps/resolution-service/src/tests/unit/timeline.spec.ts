import { buildCaseTimeline } from "../../modules/assistant/application/timeline";

describe("buildCaseTimeline", () => {
  it("ghép đơn/điều phối/chat/đánh giá theo đúng thứ tự thời gian", () => {
    const timeline = buildCaseTimeline({
      order: { createdAt: "2026-01-01T10:00:00.000Z" },
      orderTimeline: {
        timeline: [
          {
            previousStatus: "PENDING",
            newStatus: "PICKED_UP",
            reason: "ok",
            occurredAt: "2026-01-01T10:20:00.000Z",
          },
          {
            previousStatus: "PICKED_UP",
            newStatus: "DELIVERED",
            occurredAt: "2026-01-01T10:40:00.000Z",
          },
        ],
      },
      dispatch: {
        status: "DELIVERED",
        pickedUpAt: "2026-01-01T10:20:00.000Z",
        deliveredAt: "2026-01-01T10:40:00.000Z",
      },
      chatMessages: [
        { senderRole: "DRIVER", createdAt: "2026-01-01T10:35:00.000Z" },
      ],
      review: { rating: 5, createdAt: "2026-01-01T10:45:00.000Z" },
      caseCreatedAt: "2026-01-01T11:00:00.000Z",
      gpsSignals: {
        points: 10,
        firstPointAt: "2026-01-01T10:00:00.000Z",
        lastPointAt: "2026-01-01T10:40:00.000Z",
        minDistanceToDeliveryMeters: 30,
        closestAt: "2026-01-01T10:39:00.000Z",
        lastPointDistanceMeters: 35,
        avgSpeedKmh: 20,
        maxSpeedKmh: 40,
        jumpCount: 0,
        duplicateRatio: 0,
        stoppedMinutes: 3,
      },
    });

    const times = timeline.map((event) => event.at);
    expect(times).toEqual([...times].sort());
    const text = timeline.map((event) => event.event).join(" | ");
    expect(text).toContain("Đơn được tạo");
    expect(text).toContain("PENDING → PICKED_UP — ok");
    expect(text).toContain("Tài xế đã lấy hàng");
    expect(text).toContain("Hệ thống ghi nhận đã giao");
    expect(text).toContain("Chat DRIVER");
    expect(text).toContain("Khách đánh giá đơn: 5★");
    expect(text).toContain("Khiếu nại được tạo");
    expect(text).toContain("GPS gần điểm giao nhất: 30m");
  });

  it("bỏ mốc thời gian không hợp lệ", () => {
    const timeline = buildCaseTimeline({
      order: { createdAt: "not-a-date" },
      chatMessages: [
        { senderRole: "DRIVER", createdAt: "2026-01-01T10:00:00.000Z" },
      ],
    });
    expect(timeline).toHaveLength(1);
    expect(timeline[0]!.source).toBe("D7");
  });

  it("giới hạn số mốc nhưng giữ mốc đầu và cuối", () => {
    const chatMessages = Array.from({ length: 50 }, (_, index) => ({
      senderRole: "DRIVER",
      createdAt: new Date(Date.UTC(2026, 0, 1, 10, index)).toISOString(),
    }));
    const timeline = buildCaseTimeline({ chatMessages, maxEvents: 10 });
    expect(timeline).toHaveLength(10);
    expect(timeline[0]!.at).toBe("2026-01-01T10:00:00.000Z");
    expect(timeline[9]!.at).toBe("2026-01-01T10:49:00.000Z");
  });
});
