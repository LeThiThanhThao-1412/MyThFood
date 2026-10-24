import { ShippingService } from "../../modules/shipping/shipping.service";

describe("ShippingService delivery option quote", () => {
  const service = new ShippingService();
  const standard = {
    distanceKm: 4,
    baseFee: 10000,
    distanceFee: 12000,
    rushHourSurcharge: 0,
    weatherSurcharge: 0,
    totalFee: 22000,
    breakdown: {
      baseFee: 10000,
      distanceFee: 12000,
      rushHourMultiplier: 1,
      weatherMultiplier: 1,
      total: 22000,
    },
  };

  beforeEach(() => {
    process.env.SAVER_FEE_FACTOR = "0.8";
    process.env.PRIORITY_FEE_FACTOR = "1.3";
    process.env.PRIORITY_SURCHARGE = "10000";
    process.env.PRIORITY_MAX_FEE = "120000";
    jest
      .spyOn(service, "calculateStandardFee")
      .mockResolvedValue(standard as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("trả đủ 3 phương thức với phí tương ứng", async () => {
    const quote = await service.quoteAll({
      originLat: 10.77,
      originLng: 106.7,
      destLat: 10.78,
      destLng: 106.71,
    });

    expect(quote.standardFee).toBe(22000);
    expect(quote.options.map((o) => o.option)).toEqual([
      "SAVER",
      "FAST",
      "PRIORITY",
    ]);

    const byOption = Object.fromEntries(
      quote.options.map((o) => [o.option, o]),
    );
    expect(byOption.SAVER!.fee).toBe(17600);
    expect(byOption.SAVER!.optionFee).toBe(-4400);
    expect(byOption.FAST!.fee).toBe(22000);
    expect(byOption.PRIORITY!.fee).toBe(38600);
    expect(byOption.PRIORITY!.distanceKm).toBe(4);
  });

  it("calculateOptionFee trả đúng phí của một phương thức", async () => {
    const quote = await service.calculateOptionFee(
      { originLat: 10.77, originLng: 106.7, destLat: 10.78, destLng: 106.71 },
      "SAVER",
    );

    expect(quote.option).toBe("SAVER");
    expect(quote.fee).toBe(17600);
    expect(quote.baseFee).toBe(22000);
    expect(quote.distanceKm).toBe(4);
    expect(quote.optionFee).toBe(-4400);
  });
});
