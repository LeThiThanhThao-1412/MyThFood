// ============================================================================
// Luồng giao hàng của tài xế (dispatch state machine + thông báo cho khách)
//
//   [Nhận đơn]             → DRIVER_ACCEPTED → "Đang đến nhà hàng" + GPS tại quán
//   [Đã đến nhà hàng]      → DRIVER_ARRIVED  → map hiện điểm đến khách
//   [Đã nhận món]          → PICKED_UP → DELIVERING + order OUT_FOR_DELIVERY
//   [Đã giao món thành công] → DELIVERED + order DELIVERED + quyết toán ví
//
// Mỗi bước đều gửi notification tới khách hàng (notification-service).
// ============================================================================

import {
  dispatchApi,
  driverApi,
  merchantApi,
  notificationApi,
  orderApi,
} from "@mythfood/api-client";

export type DeliveryStage =
  /** Chưa nhận đơn (dispatch MATCHING / DRIVER_ASSIGNED). */
  | "WAITING"
  /** Đã bấm “Nhận đơn” — đang trên đường đến quán. */
  | "GOING_TO_RESTAURANT"
  /** Đã bấm “Đã đến quán” — đang chờ nhận món. */
  | "AT_RESTAURANT"
  /** Đã bấm “Đã nhận món” — đang giao tới khách. */
  | "DELIVERING"
  /** Đã giao thành công. */
  | "DELIVERED";

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface StageMeta {
  stage: DeliveryStage;
  icon: string;
  label: string;
  /** Mô tả hiển thị cho tài xế. */
  hint: string;
  /** Nhãn nút chuyển sang bước kế tiếp (null = đã xong). */
  actionLabel: string | null;
  /** Điểm đang được dẫn đường tới. */
  target: "RESTAURANT" | "CUSTOMER" | null;
}

export const STAGE_META: Record<DeliveryStage, StageMeta> = {
  WAITING: {
    stage: "WAITING",
    icon: "📩",
    label: "Chờ nhận đơn",
    hint: "Bấm “Nhận đơn” để bắt đầu chuyến giao hàng.",
    actionLabel: "📥 Nhận đơn",
    target: "RESTAURANT",
  },
  GOING_TO_RESTAURANT: {
    stage: "GOING_TO_RESTAURANT",
    icon: "🛵",
    label: "Đang đến nhà hàng",
    hint: "Đang trên đường tới nhà hàng. Tới nơi thì bấm “Đã đến nhà hàng”.",
    actionLabel: "📍 Đã đến nhà hàng",
    target: "RESTAURANT",
  },
  AT_RESTAURANT: {
    stage: "AT_RESTAURANT",
    icon: "🏪",
    label: "Đã đến nhà hàng",
    hint: "Nhận món xong thì bấm “Đã nhận món” để giao cho khách.",
    actionLabel: "📦 Đã nhận món",
    target: "CUSTOMER",
  },
  DELIVERING: {
    stage: "DELIVERING",
    icon: "🚚",
    label: "Đang giao cho khách",
    hint: "Giao tới địa chỉ khách, hoàn tất thì bấm “Đã giao món thành công”.",
    actionLabel: "✅ Đã giao món thành công",
    target: "CUSTOMER",
  },
  DELIVERED: {
    stage: "DELIVERED",
    icon: "🎉",
    label: "Đã giao thành công",
    hint: "Đơn hàng đã hoàn tất, thu nhập được cộng vào ví.",
    actionLabel: null,
    target: null,
  },
};

/** Thứ tự các bước để vẽ timeline tiến trình. */
export const STAGE_ORDER: DeliveryStage[] = [
  "WAITING",
  "GOING_TO_RESTAURANT",
  "AT_RESTAURANT",
  "DELIVERING",
  "DELIVERED",
];

// ---------------------------------------------------------------------------
// Nội dung thông báo gửi khách hàng ở từng bước
// ---------------------------------------------------------------------------
const CONSUMER_NOTIFICATIONS: Record<
  Exclude<DeliveryStage, "WAITING">,
  { type: string; title: string; body: (shortId: string) => string }
> = {
  GOING_TO_RESTAURANT: {
    type: "DRIVER_GOING_TO_RESTAURANT",
    title: "Tài xế đang đến nhà hàng",
    body: (id) =>
      `Tài xế đã nhận đơn #${id} và đang trên đường đến nhà hàng lấy món.`,
  },
  AT_RESTAURANT: {
    type: "DRIVER_ARRIVED_RESTAURANT",
    title: "Tài xế đã đến nhà hàng",
    body: (id) => `Tài xế đang chờ nhà hàng bàn giao món của đơn #${id}.`,
  },
  DELIVERING: {
    type: "DRIVER_PICKED_UP",
    title: "Tài xế đã nhận món, đang giao",
    body: (id) => `Đơn #${id} đã được lấy và đang trên đường tới bạn.`,
  },
  DELIVERED: {
    type: "ORDER_DELIVERED",
    title: "Đơn hàng đã được giao",
    body: (id) => `Đơn #${id} đã được giao thành công. Chúc bạn ngon miệng!`,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bóc `{ statusCode, data }` của các service NestJS; xử lý đúng cả khi `data` = null. */
export function unwrap<T = any>(res: any): T {
  if (res && typeof res === "object" && "data" in res) {
    return res.data as T;
  }
  return res as T;
}

export function toNum(v: unknown, fallback = 0): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const parsed = parseFloat(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

/** Khoảng cách đường chim bay (km). */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Suy ra bước hiện tại từ trạng thái dispatch (ưu tiên) hoặc trạng thái đơn. */
export function resolveStage(
  dispatchStatus?: string | null,
  orderStatus?: string | null,
): DeliveryStage {
  switch (dispatchStatus) {
    case "DRIVER_ACCEPTED":
      return "GOING_TO_RESTAURANT";
    case "DRIVER_ARRIVED":
      return "AT_RESTAURANT";
    case "PICKED_UP":
    case "DELIVERING":
      return "DELIVERING";
    case "DELIVERED":
      return "DELIVERED";
    case "MATCHING":
    case "DRIVER_ASSIGNED":
    case "DRIVER_DECLINED":
      return "WAITING";
    default:
      break;
  }
  // Fallback khi đơn chưa có dispatch: dựa vào trạng thái đơn hàng
  if (orderStatus === "DELIVERED") return "DELIVERED";
  if (orderStatus === "OUT_FOR_DELIVERY") return "DELIVERING";
  return "WAITING";
}

/** Chuẩn hoá message lỗi từ ApiError sang tiếng Việt thân thiện. */
export function friendlyError(err: any, fallback = "Có lỗi xảy ra"): string {
  const raw: string = err?.message || "";
  if (!raw) return fallback;
  if (raw.includes("already attempted"))
    return "Bạn đã bỏ qua đơn này trước đó, không thể nhận lại.";
  if (raw.includes("Maximum matching attempts"))
    return "Đơn đã hết lượt tìm tài xế, vui lòng chọn đơn khác.";
  if (raw.includes("does not meet COD requirements"))
    return "Ví chưa đủ 2.000.000₫ để nhận đơn COD.";
  if (raw.includes("Dispatch already exists"))
    return "Đơn này đã có tài xế khác nhận.";
  if (raw.toLowerCase().includes("network"))
    return "Không kết nối được server, kiểm tra mạng rồi thử lại.";
  return raw;
}

// ---------------------------------------------------------------------------
// Thông báo cho khách hàng
// ---------------------------------------------------------------------------

/**
 * userId của khách dùng làm khoá notification.
 * Trong dữ liệu test hiện tại, `order.consumerId` thường chính là identity userId;
 * nếu sau này cần map chính xác consumerId → userId thì thêm endpoint backend.
 */
async function resolveConsumerUserId(consumerId: string): Promise<string> {
  return consumerId;
}

/**
 * Gửi thông báo tiến trình giao hàng tới khách.
 * Không bao giờ throw — lỗi chỉ log warning để không chặn luồng tài xế.
 */
export async function notifyConsumer(
  order: any,
  stage: Exclude<DeliveryStage, "WAITING">,
): Promise<boolean> {
  const template = CONSUMER_NOTIFICATIONS[stage];
  if (!template || !order?.consumerId) return false;
  try {
    const userId = await resolveConsumerUserId(order.consumerId);
    if (!userId) return false;
    await notificationApi.create({
      userId,
      type: template.type,
      title: template.title,
      body: template.body(String(order.id).slice(0, 8)),
      data: {
        orderId: order.id,
        stage,
        driverId: order.driverId ?? null,
      },
    });
    return true;
  } catch (err: any) {
    console.warn(
      `[delivery-flow] Không gửi được thông báo "${template.title}": ${err?.message}`,
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Truy vấn dữ liệu chuyến giao
// ---------------------------------------------------------------------------

export async function getDispatchByOrder(orderId: string): Promise<any | null> {
  try {
    const res: any = await dispatchApi.getByOrder(orderId);
    return unwrap<any>(res) ?? null;
  } catch {
    return null;
  }
}

export async function getMerchant(merchantId: string): Promise<any | null> {
  if (!merchantId) return null;
  try {
    return unwrap<any>(await merchantApi.getById(merchantId));
  } catch {
    return null;
  }
}

/** Toạ độ nhà hàng: ưu tiên dispatch (lưu lúc tạo), fallback merchant profile. */
export function restaurantLocation(
  dispatch: any,
  merchant: any,
): LatLng | null {
  const lat = dispatch?.merchantLatitude ?? merchant?.latitude ?? 10.775;
  const lng = dispatch?.merchantLongitude ?? merchant?.longitude ?? 106.7;
  return { latitude: toNum(lat, 10.775), longitude: toNum(lng, 106.7) };
}

/** Toạ độ giao hàng: ưu tiên đơn hàng, fallback dispatch. */
export function customerLocation(order: any, dispatch: any): LatLng | null {
  const lat = order?.deliveryLatitude ?? dispatch?.deliveryLatitude ?? 10.775;
  const lng = order?.deliveryLongitude ?? dispatch?.deliveryLongitude ?? 106.7;
  return { latitude: toNum(lat, 10.775), longitude: toNum(lng, 106.7) };
}

// ---------------------------------------------------------------------------
// 4 hành động của tài xế
// ---------------------------------------------------------------------------

/** Tạo dispatch nếu đơn chưa có (kèm toạ độ nhà hàng để vẽ tuyến & matching). */
async function ensureDispatch(order: any, merchant?: any): Promise<any> {
  const existing = await getDispatchByOrder(order.id);

  // Nếu dispatch cũ bị kẹt ở trạng thái không thể tiếp tục → xoá để tạo lại
  if (
    existing &&
    ["DRIVER_DECLINED", "EXPIRED", "CANCELLED"].includes(existing.status)
  ) {
    try {
      await dispatchApi.delete(existing.id);
    } catch {
      /* ignore */
    }
  } else if (existing) {
    return existing;
  }

  const m = merchant ?? (await getMerchant(order.merchantId));
  const created = await dispatchApi.create({
    orderId: order.id,
    merchantId: order.merchantId,
    deliveryAddress: order.deliveryAddress ?? "",
    deliveryLatitude: toNum(order.deliveryLatitude, 10.775),
    deliveryLongitude: toNum(order.deliveryLongitude, 106.7),
    ...(m?.latitude != null ? { merchantLatitude: toNum(m.latitude) } : {}),
    ...(m?.longitude != null ? { merchantLongitude: toNum(m.longitude) } : {}),
  });
  return unwrap<any>(created);
}

/**
 * Bước 1 — “Nhận đơn”: gán tài xế + driver-accept → DRIVER_ACCEPTED
 * (hệ thống chuyển sang “Đang đến quán”) và thông báo cho khách.
 */
export async function acceptOrder(
  order: any,
  driverId: string,
  merchant?: any,
): Promise<any> {
  if (!order?.id) throw new Error("Không tìm thấy thông tin đơn hàng.");
  let dispatch = await ensureDispatch(order, merchant);

  if (
    dispatch.status === "DRIVER_ASSIGNED" &&
    dispatch.driverId &&
    dispatch.driverId !== driverId
  ) {
    throw new Error("Đơn này đã được gán cho tài xế khác.");
  }

  if (
    ["DRIVER_ACCEPTED", "DRIVER_ARRIVED", "PICKED_UP", "DELIVERING"].includes(
      dispatch.status,
    ) &&
    dispatch.driverId &&
    dispatch.driverId !== driverId
  ) {
    throw new Error("Đơn này đã được tài xế khác nhận.");
  }

  if (dispatch.status === "MATCHING") {
    dispatch = unwrap<any>(
      await dispatchApi.assignDriver(dispatch.id, driverId),
    );
  }
  if (dispatch.status === "DRIVER_ASSIGNED") {
    dispatch = unwrap<any>(await dispatchApi.driverAccept(dispatch.id));
  }

  if (
    !["DRIVER_ACCEPTED", "DRIVER_ARRIVED", "PICKED_UP", "DELIVERING"].includes(
      dispatch.status,
    )
  ) {
    throw new Error(
      `Không thể nhận đơn: dispatch đang ở trạng thái ${dispatch.status}`,
    );
  }

  // Lấy thông tin nhà hàng (nếu chưa có) để đặt GPS tài xế ngay tại nhà hàng
  const m = merchant ?? (await getMerchant(order.merchantId));
  const restaurant = restaurantLocation(dispatch, m);

  // Đánh dấu tài xế đang chạy đơn (bỏ qua nếu đã ON_DELIVERY để tránh 409)
  try {
    const driverProfile = unwrap<any>(await driverApi.getById(driverId));
    const alreadyOnDelivery =
      driverProfile?.status === "ON_DELIVERY" || driverProfile?.currentOrderId;
    if (!alreadyOnDelivery) {
      await driverApi.assignOrder(driverId, order.id);
    }
  } catch {
    /* non-fatal */
  }

  // Mô phỏng GPS: đặt tài xế tại nhà hàng sau khi bấm “Nhận đơn”
  if (restaurant && driverId) {
    try {
      await driverApi.updateLocation(driverId, {
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      });
    } catch {
      /* non-fatal */
    }
  }

  await notifyConsumer(order, "GOING_TO_RESTAURANT");
  return dispatch;
}

/**
 * Bước 2 — “Đã đến nhà hàng”: DRIVER_ARRIVED, thông báo “Tài xế đã đến nhà hàng”
 * và bản đồ chuyển sang hiển thị điểm đến của khách.
 */
export async function arriveAtRestaurant(
  order: any,
  dispatch: any,
  driverId: string,
  restaurant: LatLng | null,
): Promise<any> {
  let current = dispatch;
  if (current?.status === "DRIVER_ASSIGNED") {
    current = unwrap<any>(await dispatchApi.driverAccept(current.id));
  }
  if (current?.status === "DRIVER_ACCEPTED") {
    current = unwrap<any>(await dispatchApi.driverArrived(current.id));
  }

  if (restaurant && driverId) {
    try {
      await driverApi.updateLocation(driverId, {
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      });
    } catch {
      /* non-fatal */
    }
  }

  await notifyConsumer(order, "AT_RESTAURANT");
  return current;
}

/**
 * Bước 3 — “Đã nhận món”: PICKED_UP → DELIVERING, đồng bộ đơn sang
 * OUT_FOR_DELIVERY và thông báo “Tài xế đã nhận món, đang giao”.
 */
export async function pickUpFood(
  order: any,
  dispatch: any,
  driverId: string,
): Promise<{ dispatch: any; order: any }> {
  let current = dispatch;
  if (current?.status === "DRIVER_ARRIVED") {
    current = unwrap<any>(await dispatchApi.markPickedUp(current.id));
  }
  if (current?.status === "PICKED_UP") {
    current = unwrap<any>(await dispatchApi.startDelivering(current.id));
  }

  const updatedOrder = await syncOrderOutForDelivery(order, driverId);
  await notifyConsumer(order, "DELIVERING");
  return { dispatch: current, order: updatedOrder };
}

/**
 * Bước 4 — “Giao hàng thành công”: DELIVERED (dispatch + order → kích hoạt
 * settlement ví), định vị tài xế tại nhà khách, thông báo hoàn tất.
 */
export async function completeDelivery(
  order: any,
  dispatch: any,
  driverId: string,
  customer: LatLng | null,
): Promise<{ dispatch: any; order: any }> {
  let current = dispatch;
  if (current?.status === "DRIVER_ARRIVED") {
    current = unwrap<any>(await dispatchApi.markPickedUp(current.id));
  }
  if (current?.status === "PICKED_UP") {
    current = unwrap<any>(await dispatchApi.startDelivering(current.id));
  }
  if (current?.status === "DELIVERING") {
    current = unwrap<any>(await dispatchApi.markDelivered(current.id));
  }

  // Đơn hàng: OUT_FOR_DELIVERY → DELIVERED (order-service tự chia tiền ví)
  let updatedOrder = order;
  if (order.status !== "DELIVERED") {
    updatedOrder = await syncOrderOutForDelivery(order, driverId);
    if (updatedOrder?.status !== "DELIVERED") {
      updatedOrder = await orderApi.delivered(order.id);
    }
  }

  // Xác nhận vị trí tài xế tại nhà khách
  if (customer && driverId) {
    try {
      await driverApi.updateLocation(driverId, {
        latitude: customer.latitude,
        longitude: customer.longitude,
      });
    } catch {
      /* non-fatal */
    }
  }

  // Giải phóng tài xế (bỏ qua 409 khi đơn đã hoàn tất trước đó)
  try {
    await driverApi.completeOrder(driverId);
  } catch {
    /* non-fatal */
  }

  await notifyConsumer(order, "DELIVERED");
  return { dispatch: current, order: updatedOrder };
}

/** Đưa đơn về OUT_FOR_DELIVERY nếu chưa (bỏ qua khi đã đi giao/đã giao). */
async function syncOrderOutForDelivery(
  order: any,
  driverId: string,
): Promise<any> {
  let fresh = order;
  try {
    fresh = await orderApi.getById(order.id);
  } catch {
    /* dùng dữ liệu đang có */
  }
  if (fresh?.status === "OUT_FOR_DELIVERY" || fresh?.status === "DELIVERED") {
    return fresh;
  }
  return orderApi.outForDelivery(order.id, {
    driverId: driverId || order.driverId || "",
  });
}

// ---------------------------------------------------------------------------
// Dẫn đường (OSRM public API, fallback đường chim bay)
// ---------------------------------------------------------------------------

export interface RouteInfo {
  /** Danh sách điểm `[lat, lng]` để vẽ polyline trên bản đồ. */
  points: [number, number][];
  distanceKm: number;
  durationMin: number;
  source: "osrm" | "straight";
}

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const AVG_SPEED_KMH = 25;

/** Lấy tuyến đường thực tế giữa 2 điểm; lỗi mạng → đường thẳng nối 2 điểm. */
export async function fetchRoute(from: LatLng, to: LatLng): Promise<RouteInfo> {
  const distanceKm = haversineKm(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  const straight: RouteInfo = {
    points: [
      [from.latitude, from.longitude],
      [to.latitude, to.longitude],
    ],
    distanceKm,
    durationMin: Math.max(1, Math.round((distanceKm / AVG_SPEED_KMH) * 60)),
    source: "straight",
  };

  try {
    const url =
      `${OSRM_BASE}/${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
      `?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return straight;
    const data: any = await res.json();
    const route = data?.routes?.[0];
    const coords: [number, number][] = route?.geometry?.coordinates ?? [];
    if (!coords.length) return straight;
    return {
      points: coords.map(([lng, lat]) => [lat, lng] as [number, number]),
      distanceKm: toNum(route.distance) / 1000,
      durationMin: Math.max(1, Math.round(toNum(route.duration) / 60)),
      source: "osrm",
    };
  } catch {
    return straight;
  }
}

/** Link mở Google Maps dẫn đường (nếu tài xế muốn dùng app ngoài). */
export function googleMapsDirections(from: LatLng | null, to: LatLng): string {
  const origin = from ? `${from.latitude},${from.longitude}` : "";
  return (
    `https://www.google.com/maps/dir/?api=1&destination=${to.latitude},${to.longitude}` +
    (origin ? `&origin=${origin}` : "") +
    "&travelmode=driving"
  );
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
