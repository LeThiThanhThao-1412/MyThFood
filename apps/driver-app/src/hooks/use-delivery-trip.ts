"use client";

// ============================================================================
// Hook điều phối chuyến giao hàng của tài xế cho 1 đơn:
// tải order + dispatch + nhà hàng + hồ sơ tài xế, suy ra bước hiện tại,
// tính tuyến dẫn đường và thực thi hành động của bước kế tiếp.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { driverApi, orderApi } from "@mythfood/api-client";
import {
  useAuthStore,
  useLocationStore,
  haversineKm,
} from "@mythfood/frontend-shared";
import {
  DeliveryStage,
  LatLng,
  RouteInfo,
  STAGE_META,
  acceptOrder,
  arriveAtRestaurant,
  completeDelivery,
  customerLocation,
  fetchRoute,
  friendlyError,
  getCustomerInfo,
  getDispatchByOrder,
  getMerchant,
  pickUpFood,
  resolveStage,
  restaurantLocation,
  toNum,
  unwrap,
} from "@/lib/delivery-flow";

export interface TripMapMarker extends LatLng {
  label: string;
  address?: string;
  emoji: string;
}

export function useDeliveryTrip(orderId?: string | null) {
  const { user } = useAuthStore();
  const { location: gps } = useLocationStore();

  const [order, setOrder] = useState<any>(null);
  const [dispatch, setDispatch] = useState<any>(null);
  const [merchant, setMerchant] = useState<any>(null);
  const [customerInfo, setCustomerInfo] = useState<{
    fullName: string | null;
    phone: string | null;
    avatar?: string | null;
  } | null>(null);
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routeToRestaurant, setRouteToRestaurant] = useState<RouteInfo | null>(
    null,
  );
  const lastOrderIdRef = useRef<string | null>(null);

  // ---- Tải dữ liệu chuyến giao ----
  const load = useCallback(
    async (silent = false) => {
      if (!orderId) {
        lastOrderIdRef.current = null;
        setOrder(null);
        setDispatch(null);
        setMerchant(null);
        return;
      }

      const isSameOrder = lastOrderIdRef.current === orderId;
      lastOrderIdRef.current = orderId;

      if (!silent) setLoading(true);
      try {
        const [freshOrder, freshDispatch] = await Promise.all([
          orderApi.getById(orderId).catch(() => null),
          getDispatchByOrder(orderId),
        ]);

        // Nếu vẫn là đơn đang xử lý mà server trả null (race) → giữ trạng thái cũ
        setOrder((prev: any) =>
          isSameOrder && !freshOrder ? prev : freshOrder,
        );
        setDispatch((prev: any) =>
          isSameOrder && !freshDispatch ? prev : freshDispatch,
        );

        const merchantId = (freshOrder as any)?.merchantId;
        if (merchantId) setMerchant(await getMerchant(merchantId));

        // Lấy thông tin liên hệ khách hàng (tên + SĐT) cho tài xế
        if ((freshOrder as any)?.consumerId) {
          getCustomerInfo(freshOrder)
            .then(setCustomerInfo)
            .catch(() => {});
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [orderId],
  );

  const loadDriver = useCallback(async () => {
    if (!user?.id) return null;
    try {
      const d = unwrap<any>(await driverApi.getByUserId(user.id));
      setDriver(d);
      return d;
    } catch {
      return null;
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDriver();
  }, [loadDriver, orderId]);

  // ---- Bước hiện tại + các điểm trên bản đồ ----
  const stage: DeliveryStage = resolveStage(dispatch?.status, order?.status);
  const stageMeta = STAGE_META[stage];

  const restaurant = useMemo(
    () => restaurantLocation(dispatch, merchant),
    [dispatch, merchant],
  );
  const customer = useMemo(
    () => customerLocation(order, dispatch),
    [order, dispatch],
  );

  const driverLocation = useMemo<LatLng | null>(() => {
    if (gps) return { latitude: gps.latitude, longitude: gps.longitude };
    if (driver?.currentLatitude != null && driver?.currentLongitude != null) {
      return {
        latitude: toNum(driver.currentLatitude),
        longitude: toNum(driver.currentLongitude),
      };
    }
    return null;
  }, [gps, driver?.currentLatitude, driver?.currentLongitude]);

  /** Khoảng cách (km) tới nhà hàng: ưu tiên đường đi thực tế (OSRM), fallback đường chim bay. */
  const distanceToRestaurantKm = useMemo<number | null>(() => {
    if (routeToRestaurant?.distanceKm != null)
      return routeToRestaurant.distanceKm;
    if (!driverLocation || !restaurant) return null;
    return haversineKm(
      driverLocation.latitude,
      driverLocation.longitude,
      restaurant.latitude,
      restaurant.longitude,
    );
  }, [routeToRestaurant, driverLocation, restaurant]);

  /** Thời gian di chuyển (phút) tới nhà hàng (chỉ có khi dùng đường thực tế). */
  const distanceToRestaurantMin = useMemo<number | null>(
    () => routeToRestaurant?.durationMin ?? null,
    [routeToRestaurant],
  );

  /** Tuyến đường theo bước: tài xế→nhà hàng, rồi nhà hàng→khách. */
  const { routeFrom, routeTo } = useMemo<{
    routeFrom: LatLng | null;
    routeTo: LatLng | null;
  }>(() => {
    if (stage === "WAITING" || stage === "GOING_TO_RESTAURANT") {
      return { routeFrom: driverLocation, routeTo: restaurant };
    }
    // “Đã đến nhà hàng”: xem trước tuyến nhà hàng → khách
    if (stage === "AT_RESTAURANT") {
      return { routeFrom: restaurant, routeTo: customer };
    }
    // “Đang giao”: vẽ tuyến từ vị trí tài xế hiện tại → khách
    if (stage === "DELIVERING") {
      return { routeFrom: driverLocation ?? restaurant, routeTo: customer };
    }
    return { routeFrom: null, routeTo: null };
  }, [stage, driverLocation, restaurant, customer]);

  useEffect(() => {
    if (!routeFrom || !routeTo) {
      setRoute(null);
      return;
    }
    let cancelled = false;
    fetchRoute(routeFrom, routeTo).then((r) => {
      if (!cancelled) setRoute(r);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeFrom?.latitude,
    routeFrom?.longitude,
    routeTo?.latitude,
    routeTo?.longitude,
  ]);

  // Tuyến đường thực tế tài xế → nhà hàng (để tính khoảng cách + thời gian chính xác)
  useEffect(() => {
    if (!driverLocation || !restaurant) {
      setRouteToRestaurant(null);
      return;
    }
    let cancelled = false;
    fetchRoute(driverLocation, restaurant)
      .then((r) => {
        if (!cancelled) setRouteToRestaurant(r);
      })
      .catch(() => {
        if (!cancelled) setRouteToRestaurant(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    driverLocation?.latitude,
    driverLocation?.longitude,
    restaurant?.latitude,
    restaurant?.longitude,
  ]);

  const mapMarkers = useMemo<TripMapMarker[]>(() => {
    const markers: TripMapMarker[] = [];
    const restaurantMarker = (emoji: string, label: string) => {
      if (restaurant)
        markers.push({
          ...restaurant,
          emoji,
          label,
          address: merchant?.address,
        });
    };
    const customerMarker = (emoji: string, label: string) => {
      if (customer)
        markers.push({
          ...customer,
          emoji,
          label,
          address: order?.deliveryAddress,
        });
    };

    if (stage === "WAITING" || stage === "GOING_TO_RESTAURANT") {
      if (driverLocation)
        markers.push({
          ...driverLocation,
          emoji: "🛵",
          label: "🛵 Vị trí của bạn",
        });
      restaurantMarker("🏪", `🏪 ${merchant?.name || "Nhà hàng"}`);
    } else if (stage === "AT_RESTAURANT") {
      restaurantMarker("🛵", `🛵 Bạn đang ở ${merchant?.name || "nhà hàng"}`);
      customerMarker("🏠", "🏠 Điểm giao hàng");
    } else if (stage === "DELIVERING") {
      const driverPos = driverLocation ?? restaurant;
      if (driverPos)
        markers.push({
          ...driverPos,
          emoji: "🛵",
          label: "🛵 Tài xế",
        });
      customerMarker("🏠", "🏠 Khách hàng");
    } else {
      customerMarker("🛵", "🛵 Đã giao tại đây");
    }
    return markers;
  }, [stage, driverLocation, restaurant, customer, merchant, order]);

  // ---- Thực thi bước kế tiếp ----
  const advance = useCallback(async () => {
    if (!order || busy) return;

    let resolvedDriver = driver;
    if (!resolvedDriver?.id) {
      resolvedDriver = await loadDriver();
    }
    const driverId = resolvedDriver?.id || order.driverId || "";
    if (!driverId) {
      setError("Không tìm thấy hồ sơ tài xế của bạn.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (stage === "WAITING") {
        setDispatch(await acceptOrder(order, driverId, merchant));
        setMessage(
          "✅ Đã nhận đơn — trạng thái: Đang đến quán. Đã thông báo cho khách.",
        );
      } else if (stage === "GOING_TO_RESTAURANT") {
        setDispatch(
          await arriveAtRestaurant(order, dispatch, driverId, restaurant),
        );
        setMessage("📍 Đã đến nhà hàng. Đã thông báo cho khách hàng.");
        loadDriver();
      } else if (stage === "AT_RESTAURANT") {
        const res = await pickUpFood(order, dispatch, driverId);
        setDispatch(res.dispatch);
        if (res.order) setOrder(res.order);
        setMessage("📦 Đã nhận món — đang giao tới khách hàng.");
      } else if (stage === "DELIVERING") {
        const res = await completeDelivery(order, dispatch, driverId, customer);
        setDispatch(res.dispatch);
        if (res.order) setOrder(res.order);
        setMessage("🎉 Giao hàng thành công! Đã thông báo cho khách hàng.");
        loadDriver();
      }

      // Đồng bộ lại từ server để UI chắc chắn hiển thị đúng bước kế tiếp
      await load(true);
    } catch (err: any) {
      setError(friendlyError(err, "Không thực hiện được bước này"));
      // Đồng bộ lại trạng thái thật từ server để UI không lệch
      load(true);
    } finally {
      setBusy(false);
    }
  }, [
    order,
    dispatch,
    merchant,
    driver,
    stage,
    restaurant,
    customer,
    busy,
    load,
    loadDriver,
  ]);

  /** Phí ship tài xế thực nhận (80% — 20% hoa hồng nền tảng). */
  const driverEarning = Math.round(toNum(order?.deliveryFee, 15000) * 0.8);

  return {
    order,
    dispatch,
    merchant,
    driver,
    customerInfo,
    distanceToRestaurantKm,
    distanceToRestaurantMin,
    loading,
    busy,
    error,
    message,
    stage,
    stageMeta,
    restaurant,
    customer,
    driverLocation,
    route,
    mapMarkers,
    driverEarning,
    advance,
    reload: load,
    setError,
    setMessage,
  };
}
