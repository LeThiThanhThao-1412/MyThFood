import { deriveGpsSignals } from "../../modules/assistant/application/gps-signals";

const DELIVERY = { latitude: 10.7769, longitude: 106.7009 };

describe("deriveGpsSignals", () => {
  it("tính khoảng cách tới điểm giao và phát hiện nhảy vị trí", () => {
    const signals = deriveGpsSignals(
      [
        {
          latitude: 10.78,
          longitude: 106.695,
          recordedAt: "2026-01-01T10:00:00.000Z",
        },
        {
          latitude: 10.7785,
          longitude: 106.6985,
          recordedAt: "2026-01-01T10:05:00.000Z",
        },
        {
          latitude: 10.777,
          longitude: 106.7005,
          recordedAt: "2026-01-01T10:10:00.000Z",
        },
        {
          latitude: 10.9,
          longitude: 106.9,
          recordedAt: "2026-01-01T10:11:00.000Z",
        },
      ],
      DELIVERY,
    );

    expect(signals).not.toBeNull();
    expect(signals!.points).toBe(4);
    expect(signals!.minDistanceToDeliveryMeters).toBeLessThan(60);
    expect(signals!.closestAt).toBe("2026-01-01T10:10:00.000Z");
    expect(signals!.jumpCount).toBe(1);
    expect(signals!.maxSpeedKmh).not.toBeNull();
  });

  it("không có toạ độ thô trong kết quả", () => {
    const signals = deriveGpsSignals(
      [
        {
          latitude: 10.78,
          longitude: 106.695,
          recordedAt: "2026-01-01T10:00:00.000Z",
        },
      ],
      DELIVERY,
    );
    expect(JSON.stringify(signals)).not.toContain("10.78");
    expect(JSON.stringify(signals)).not.toContain("106.695");
  });

  it("lọc theo cửa sổ thời gian của đơn", () => {
    const points = [
      {
        latitude: 10.78,
        longitude: 106.695,
        recordedAt: "2026-01-01T09:00:00.000Z",
      },
      {
        latitude: 10.777,
        longitude: 106.7005,
        recordedAt: "2026-01-01T10:10:00.000Z",
      },
    ];
    const signals = deriveGpsSignals(points, DELIVERY, {
      from: "2026-01-01T10:00:00.000Z",
    });
    expect(signals!.points).toBe(1);
    expect(signals!.firstPointAt).toBe("2026-01-01T10:10:00.000Z");
  });

  it("không có điểm nào ⇒ null", () => {
    expect(deriveGpsSignals([], DELIVERY)).toBeNull();
    expect(deriveGpsSignals(null, DELIVERY)).toBeNull();
    expect(
      deriveGpsSignals(
        [{ latitude: 999, longitude: 999, recordedAt: "invalid" }],
        DELIVERY,
      ),
    ).toBeNull();
  });
});
