import { useLocationStore, type UserLocation } from "./location.store";

const HCM: UserLocation = {
  latitude: 10.775,
  longitude: 106.7,
  address: "TP. Hồ Chí Minh",
  source: "manual",
};

const BEN_THANH: UserLocation = {
  latitude: 10.7721,
  longitude: 106.698,
  address: "Chợ Bến Thành, Quận 1",
  source: "gps",
};

describe("location.store", () => {
  beforeEach(() => {
    useLocationStore.getState().clearLocation();
  });

  it("starts without a location", () => {
    const { location, hasLocation } = useLocationStore.getState();
    expect(location).toBeNull();
    expect(hasLocation).toBe(false);
  });

  it("stores the picked location and flags it as available", () => {
    useLocationStore.getState().setLocation(HCM);
    const { location, hasLocation } = useLocationStore.getState();
    expect(hasLocation).toBe(true);
    expect(location).toEqual(HCM);
  });

  it("overwrites the previous location when the customer updates it", () => {
    const { setLocation } = useLocationStore.getState();
    setLocation(HCM);
    setLocation(BEN_THANH);
    const { location, hasLocation } = useLocationStore.getState();
    expect(hasLocation).toBe(true);
    expect(location).toEqual(BEN_THANH);
    expect(location?.source).toBe("gps");
  });

  it("clears the location", () => {
    const { setLocation, clearLocation } = useLocationStore.getState();
    setLocation(BEN_THANH);
    clearLocation();
    const { location, hasLocation } = useLocationStore.getState();
    expect(location).toBeNull();
    expect(hasLocation).toBe(false);
  });
});
