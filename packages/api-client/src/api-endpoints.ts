// ============================================================================
// MyThFood API Endpoints - Typed API functions for all services
// ============================================================================

import { httpClient } from "./http-client";
import type {
  ApiResponse,
  PaginatedResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  UserDetail,
  CreateConsumerRequest,
  ConsumerProfile,
  AddAddressRequest,
  AddPaymentMethodRequest,
  UpdateConsumerProfileRequest,
  ChangePasswordRequest,
  CreateMerchantRequest,
  Merchant,
  CreateMenuItemRequest,
  MenuItem,
  UpdateMenuItemRequest,
  MenuCategory,
  CreateMenuCategoryRequest,
  UpdateMenuCategoryRequest,
  SetOperatingHoursRequest,
  OperatingHour,
  UpdateCapacityRequest,
  PlaceOrderRequest,
  Order,
  CancelOrderRequest,
  RejectOrderRequest,
  OutForDeliveryRequest,
  UpdateOrderRequest,
  CreatePaymentRequest,
  Payment,
  CompletePaymentRequest,
  FailPaymentRequest,
  RefundPaymentRequest,
  CreateInventoryRequest,
  Inventory,
  ReserveStockRequest,
  ReleaseStockRequest,
  ConsumeStockRequest,
  UpdateStockRequest,
  RegisterDriverRequest,
  Driver,
  UpdateLocationRequest,
  CreateReviewRequest,
  Review,
  ReplyReviewRequest,
  CreatePromotionRequest,
  UpdatePromotionRequest,
  Promotion,
  PromotionStats,
  ValidatePromotionRequest,
  ApplyPromotionRequest,
  CreateNotificationRequest,
  Notification,
} from "./types";

// Service port constants
export const PORTS = {
  IDENTITY: 3001,
  CONSUMER: 3002,
  MERCHANT: 3003,
  ORDER: 3004,
  INVENTORY: 3005,
  PAYMENT: 3006,
  DRIVER: 3007,
  DISPATCH: 3008,
  WALLET: 3009,
  UPLOAD: 3010,
  REVIEW: 3011,
  PROMOTION: 3012,
  NOTIFICATION: 3013,
} as const;

// ============================================================================
// Auth (Identity Service - Port 3001)
// ============================================================================
export const authApi = {
  login: (body: LoginRequest) =>
    httpClient.post<ApiResponse<LoginResponse>>(
      PORTS.IDENTITY,
      "/auth/login",
      body,
    ),

  register: (body: RegisterRequest) =>
    httpClient.post<ApiResponse<{ user: UserDetail }>>(
      PORTS.IDENTITY,
      "/auth/register",
      body,
    ),

  me: () => httpClient.get<ApiResponse<UserDetail>>(PORTS.IDENTITY, "/auth/me"),

  changePassword: (body: ChangePasswordRequest) =>
    httpClient.post<ApiResponse<{ message: string }>>(
      PORTS.IDENTITY,
      "/auth/change-password",
      body,
    ),
};

// ============================================================================
// Consumer (Port 3002)
// ============================================================================
export const consumerApi = {
  create: (body: CreateConsumerRequest) =>
    httpClient.post<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      "/consumers",
      body,
    ),

  getByUserId: (userId: string) =>
    httpClient.get<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      `/consumers/user/${userId}`,
    ),

  getById: (id: string) =>
    httpClient.get<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      `/consumers/${id}`,
    ),

  addAddress: (consumerId: string, body: AddAddressRequest) =>
    httpClient.post<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      `/consumers/${consumerId}/addresses`,
      body,
    ),

  update: (consumerId: string, body: UpdateConsumerProfileRequest) =>
    httpClient.put<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      `/consumers/${consumerId}`,
      body,
    ),

  removeAddress: (consumerId: string, addressId: string) =>
    httpClient.delete<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      `/consumers/${consumerId}/addresses/${addressId}`,
    ),

  addPaymentMethod: (consumerId: string, body: AddPaymentMethodRequest) =>
    httpClient.post<ApiResponse<ConsumerProfile>>(
      PORTS.CONSUMER,
      `/consumers/${consumerId}/payment-methods`,
      body,
    ),
};

// ============================================================================
// Merchant (Port 3003)
// ============================================================================
export const merchantApi = {
  create: (body: CreateMerchantRequest) =>
    httpClient.post<Merchant>(PORTS.MERCHANT, "/merchants", body),

  list: (params?: {
    status?: string;
    search?: string;
    category?: string;
    skip?: number;
    take?: number;
  }) =>
    httpClient.get<PaginatedResponse<Merchant>>(PORTS.MERCHANT, "/merchants", {
      params,
    }),

  getById: (id: string) =>
    httpClient.get<Merchant>(PORTS.MERCHANT, `/merchants/${id}`),

  update: (
    id: string,
    body: {
      name?: string;
      description?: string;
      phone?: string;
      email?: string;
      address?: string;
      logoUrl?: string;
      coverImageUrl?: string;
      primaryCategory?: string;
      secondaryCategories?: string[];
    },
  ) => httpClient.put<Merchant>(PORTS.MERCHANT, `/merchants/${id}`, body),

  approve: (id: string) =>
    httpClient.put<Merchant>(PORTS.MERCHANT, `/merchants/${id}/approve`),

  getMenu: (merchantId: string, includeUnavailable?: boolean) =>
    httpClient.get<MenuItem[]>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu`,
      {
        params: includeUnavailable ? { includeUnavailable: "true" } : undefined,
      },
    ),

  addMenuItem: (merchantId: string, body: CreateMenuItemRequest) =>
    httpClient.post<MenuItem>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu/items`,
      body,
    ),

  updateMenuItem: (
    merchantId: string,
    itemId: string,
    body: UpdateMenuItemRequest,
  ) =>
    httpClient.put<MenuItem>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu/${itemId}`,
      body,
    ),

  toggleMenuItem: (merchantId: string, itemId: string) =>
    httpClient.patch<MenuItem>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu/${itemId}/available`,
    ),

  deleteMenuItem: (merchantId: string, itemId: string) =>
    httpClient.delete<void>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu/${itemId}`,
    ),

  getMenuCategories: (merchantId: string) =>
    httpClient.get<MenuCategory[]>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu-categories`,
    ),

  addMenuCategory: (merchantId: string, body: CreateMenuCategoryRequest) =>
    httpClient.post<MenuCategory>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu-categories`,
      body,
    ),

  updateMenuCategory: (
    merchantId: string,
    categoryId: string,
    body: UpdateMenuCategoryRequest,
  ) =>
    httpClient.put<MenuCategory>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu-categories/${categoryId}`,
      body,
    ),

  deleteMenuCategory: (merchantId: string, categoryId: string) =>
    httpClient.delete<void>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/menu-categories/${categoryId}`,
    ),

  setOperatingHours: (merchantId: string, body: SetOperatingHoursRequest) =>
    httpClient.put<Merchant>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/operating-hours`,
      body,
    ),

  getOperatingHours: (merchantId: string) =>
    httpClient.get<OperatingHour[]>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/operating-hours`,
    ),

  checkIsOpen: (merchantId: string) =>
    httpClient.get<{ isOpen: boolean }>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/is-open`,
    ),

  toggleOpen: (merchantId: string) =>
    httpClient.patch<Merchant>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/toggle-open`,
    ),

  getCapacity: (merchantId: string) =>
    httpClient.get<{
      maxConcurrentOrders: number;
      averagePreparationMinutes: number;
    }>(PORTS.MERCHANT, `/merchants/${merchantId}/capacity`),

  updateCapacity: (merchantId: string, body: UpdateCapacityRequest) =>
    httpClient.put<Merchant>(
      PORTS.MERCHANT,
      `/merchants/${merchantId}/capacity`,
      body,
    ),
};

// ============================================================================
// Order (Port 3004)
// ============================================================================
export const orderApi = {
  place: (body: PlaceOrderRequest) =>
    httpClient.post<Order>(PORTS.ORDER, "/orders", body),

  getById: (id: string) => httpClient.get<Order>(PORTS.ORDER, `/orders/${id}`),

  list: (params?: {
    status?: string;
    merchantId?: string;
    consumerId?: string;
    skip?: number;
    take?: number;
  }) =>
    httpClient.get<PaginatedResponse<Order>>(PORTS.ORDER, "/orders", {
      params,
    }),

  listByConsumer: (consumerId: string) =>
    httpClient.get<Order[]>(PORTS.ORDER, `/orders/consumer/${consumerId}`),

  listByMerchant: (merchantId: string) =>
    httpClient.get<Order[]>(PORTS.ORDER, `/orders/merchant/${merchantId}`),

  listByDriver: (driverId: string) =>
    httpClient.get<Order[]>(PORTS.ORDER, `/orders/driver/${driverId}`),

  confirm: (id: string) =>
    httpClient.patch<Order>(PORTS.ORDER, `/orders/${id}/confirm`),

  preparing: (id: string) =>
    httpClient.patch<Order>(PORTS.ORDER, `/orders/${id}/preparing`),

  ready: (id: string) =>
    httpClient.patch<Order>(PORTS.ORDER, `/orders/${id}/ready`),

  outForDelivery: (id: string, body: OutForDeliveryRequest) =>
    httpClient.patch<Order>(
      PORTS.ORDER,
      `/orders/${id}/out-for-delivery`,
      body,
    ),

  delivered: (id: string) =>
    httpClient.patch<Order>(PORTS.ORDER, `/orders/${id}/delivered`),

  cancel: (id: string, body: CancelOrderRequest) =>
    httpClient.patch<Order>(PORTS.ORDER, `/orders/${id}/cancel`, body),

  reject: (id: string, body: RejectOrderRequest) =>
    httpClient.patch<Order>(PORTS.ORDER, `/orders/${id}/reject`, body),

  update: (id: string, body: UpdateOrderRequest) =>
    httpClient.put<Order>(PORTS.ORDER, `/orders/${id}`, body),

  delete: (id: string) => httpClient.delete<void>(PORTS.ORDER, `/orders/${id}`),
};

// ============================================================================
// Payment (Port 3006)
// ============================================================================
export const paymentApi = {
  create: (body: CreatePaymentRequest) =>
    httpClient.post<Payment>(PORTS.PAYMENT, "/payments", body),

  createStripePayment: (body: CreatePaymentRequest & { currency?: string }) =>
    httpClient.post<Payment & { clientSecret: string }>(
      PORTS.PAYMENT,
      "/payments/stripe",
      body,
    ),

  getById: (id: string) =>
    httpClient.get<Payment>(PORTS.PAYMENT, `/payments/${id}`),

  list: (params?: {
    orderId?: string;
    consumerId?: string;
    merchantId?: string;
    status?: string;
  }) => httpClient.get<Payment[]>(PORTS.PAYMENT, "/payments", { params }),

  getByOrder: (orderId: string) =>
    httpClient.get<Payment>(PORTS.PAYMENT, `/payments/order/${orderId}`),

  listByConsumer: (consumerId: string) =>
    httpClient.get<Payment[]>(
      PORTS.PAYMENT,
      `/payments/consumer/${consumerId}`,
    ),

  listByMerchant: (merchantId: string) =>
    httpClient.get<Payment[]>(
      PORTS.PAYMENT,
      `/payments/merchant/${merchantId}`,
    ),

  complete: (id: string, body: CompletePaymentRequest) =>
    httpClient.patch<Payment>(PORTS.PAYMENT, `/payments/${id}/complete`, body),

  fail: (id: string, body: FailPaymentRequest) =>
    httpClient.patch<Payment>(PORTS.PAYMENT, `/payments/${id}/fail`, body),

  refund: (id: string, body: RefundPaymentRequest) =>
    httpClient.patch<Payment>(PORTS.PAYMENT, `/payments/${id}/refund`, body),

  delete: (id: string) =>
    httpClient.delete<void>(PORTS.PAYMENT, `/payments/${id}`),
};

// ============================================================================
// Inventory (Port 3005)
// ============================================================================
export const inventoryApi = {
  create: (body: CreateInventoryRequest) =>
    httpClient.post<Inventory>(PORTS.INVENTORY, "/inventory", body),

  list: () => httpClient.get<Inventory[]>(PORTS.INVENTORY, "/inventory"),

  getById: (id: string) =>
    httpClient.get<Inventory>(PORTS.INVENTORY, `/inventory/${id}`),

  getByMerchant: (merchantId: string) =>
    httpClient.get<Inventory[]>(
      PORTS.INVENTORY,
      `/inventory/merchant/${merchantId}`,
    ),

  getByMenuItem: (menuItemId: string) =>
    httpClient.get<Inventory>(
      PORTS.INVENTORY,
      `/inventory/menuitem/${menuItemId}`,
    ),

  reserve: (id: string, body: ReserveStockRequest) =>
    httpClient.post<Inventory>(
      PORTS.INVENTORY,
      `/inventory/${id}/reserve`,
      body,
    ),

  release: (id: string, body: ReleaseStockRequest) =>
    httpClient.post<Inventory>(
      PORTS.INVENTORY,
      `/inventory/${id}/release`,
      body,
    ),

  consume: (id: string, body: ConsumeStockRequest) =>
    httpClient.post<Inventory>(
      PORTS.INVENTORY,
      `/inventory/${id}/consume`,
      body,
    ),

  updateTotal: (id: string, body: UpdateStockRequest) =>
    httpClient.put<Inventory>(PORTS.INVENTORY, `/inventory/${id}/total`, body),
};

// ============================================================================
// Driver (Port 3007)
// ============================================================================
export const driverApi = {
  register: (body: RegisterDriverRequest) =>
    httpClient.post<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      "/drivers",
      body,
    ),

  getById: (id: string) =>
    httpClient.get<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}`,
    ),

  getByUserId: (userId: string) =>
    httpClient.get<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/user/${userId}`,
    ),

  list: (params?: {
    status?: string;
    onlineStatus?: string;
    fatigueLevel?: string;
  }) =>
    httpClient.get<{ statusCode: number; data: Driver[] }>(
      PORTS.DRIVER,
      "/drivers",
      { params },
    ),

  getAvailable: () =>
    httpClient.get<{ statusCode: number; data: Driver[] }>(
      PORTS.DRIVER,
      "/drivers/available/list",
    ),

  updateProfile: (id: string, body: Partial<RegisterDriverRequest>) =>
    httpClient.put<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}`,
      body,
    ),

  goOnline: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/go-online`,
    ),

  goOffline: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/go-offline`,
    ),

  goHome: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/go-home`,
    ),

  updateLocation: (id: string, body: UpdateLocationRequest) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/location`,
      body,
    ),

  assignOrder: (id: string, orderId: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/assign-order`,
      { orderId },
    ),

  completeOrder: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/complete-order`,
    ),

  startShift: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/start-shift`,
    ),

  endShift: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/end-shift`,
    ),

  takeBreak: (id: string) =>
    httpClient.patch<{ statusCode: number; data: Driver }>(
      PORTS.DRIVER,
      `/drivers/${id}/take-break`,
    ),

  delete: (id: string) =>
    httpClient.delete<void>(PORTS.DRIVER, `/drivers/${id}`),
};

// ============================================================================
// Dispatch (Port 3008)
// ============================================================================
export const dispatchApi = {
  getById: (id: string) =>
    httpClient.get<import("./types").Dispatch>(
      PORTS.DISPATCH,
      `/dispatch/${id}`,
    ),

  getByOrder: (orderId: string) =>
    httpClient.get<import("./types").Dispatch>(
      PORTS.DISPATCH,
      `/dispatch/order/${orderId}`,
    ),

  getByDriver: (driverId: string) =>
    httpClient.get<import("./types").Dispatch[]>(
      PORTS.DISPATCH,
      `/dispatch/driver/${driverId}`,
    ),

  create: (body: import("./types").CreateDispatchRequest) =>
    httpClient.post<import("./types").Dispatch>(
      PORTS.DISPATCH,
      "/dispatch",
      body,
    ),

  updateStatus: (id: string, body: { status: string }) =>
    httpClient.patch<import("./types").Dispatch>(
      PORTS.DISPATCH,
      `/dispatch/${id}/status`,
      body,
    ),
};

// ============================================================================
// Shipping Fee (Order Service - Port 3004)
// ============================================================================
export interface ShippingFeeRequest {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
}

export interface ShippingFeeResponse {
  distanceKm: number;
  baseFee: number;
  distanceFee: number;
  rushHourSurcharge: number;
  weatherSurcharge: number;
  totalFee: number;
  breakdown: {
    baseFee: number;
    distanceFee: number;
    rushHourMultiplier: number;
    weatherMultiplier: number;
    total: number;
  };
}

// ============================================================================
// ============================================================================
// Wallet Service (Port 3009) - Quản lý ví độc lập
// ============================================================================
export const walletApi = {
  // Get wallet + transactions
  getWallet: (
    ownerId: string,
    ownerType: "CONSUMER" | "DRIVER" | "MERCHANT" | "PLATFORM" | "TAX",
  ) =>
    httpClient.get<{
      id: string;
      ownerId: string;
      ownerType: string;
      balance: number;
      currency: string;
      transactions: {
        id: string;
        type: string;
        amount: number;
        description: string;
        referenceType: string;
        referenceId: string;
        createdAt: string;
      }[];
    }>(PORTS.WALLET, "/wallets", { params: { ownerId, ownerType } }),

  // Get balance
  getBalance: (ownerId: string, ownerType: string) =>
    httpClient.get<{ ownerId: string; ownerType: string; balance: number }>(
      PORTS.WALLET,
      "/wallets/balance",
      { params: { ownerId, ownerType } },
    ),

  // Top-up via Stripe (returns clientSecret)
  topupStripe: (ownerId: string, amount: number) =>
    httpClient.post<{ clientSecret: string; paymentIntentId: string }>(
      PORTS.WALLET,
      "/wallets/topup/stripe",
      { ownerId, amount },
    ),

  // Direct top-up (internal/testing)
  topup: (ownerId: string, ownerType: string, amount: number) =>
    httpClient.post<{ id: string; balance: number }>(
      PORTS.WALLET,
      "/wallets/topup",
      { ownerId, ownerType, amount },
    ),

  // Withdraw (with min balance check for driver)
  withdraw: (ownerId: string, ownerType: string, amount: number) =>
    httpClient.post<{ id: string; balance: number }>(
      PORTS.WALLET,
      "/wallets/withdraw",
      { ownerId, ownerType, amount },
    ),

  // COD settlement
  settleCOD: (data: {
    merchantId: string;
    driverId: string;
    orderId: string;
    foodTotal: number;
    shippingFee: number;
    discount?: number;
    discountFundedBy?: string;
    serviceFee?: number;
  }) =>
    httpClient.post<{ message: string }>(
      PORTS.WALLET,
      "/wallets/settle/cod",
      data,
    ),

  // Online (card) settlement
  settleOnline: (data: {
    merchantId: string;
    driverId: string;
    orderId: string;
    foodTotal: number;
    shippingFee: number;
    discount?: number;
    discountFundedBy?: string;
    serviceFee?: number;
  }) =>
    httpClient.post<{ message: string }>(
      PORTS.WALLET,
      "/wallets/settle/online",
      data,
    ),

  // Regular settlement
  settleRegular: (data: {
    driverId: string;
    orderId: string;
    shippingFee: number;
  }) =>
    httpClient.post<{ message: string }>(
      PORTS.WALLET,
      "/wallets/settle/regular",
      data,
    ),

  // Check COD eligibility (min 2M VND)
  checkCodEligibility: (driverId: string) =>
    httpClient.get<{
      eligible: boolean;
      balance: number;
      heldBalance: number;
      availableBalance: number;
      hasActiveCOD: boolean;
      required: number;
    }>(PORTS.WALLET, `/wallets/check-cod-eligibility/${driverId}`),

  // Transaction history
  getTransactions: (ownerId: string, ownerType: string) =>
    httpClient.get<any[]>(PORTS.WALLET, `/${ownerId}/transactions`, {
      params: { ownerType },
    }),

  // Create wallet
  createWallet: (ownerId: string, ownerType: string) =>
    httpClient.post<{
      id: string;
      ownerId: string;
      ownerType: string;
      balance: number;
      currency: string;
    }>(PORTS.WALLET, "/wallets", { ownerId, ownerType }),
};

export const shippingApi = {
  getFee: (params: ShippingFeeRequest) =>
    httpClient.get<ShippingFeeResponse>(PORTS.ORDER, "/shipping/fee", {
      params,
    }),
};

// ============================================================================
// Upload Service (Port 3010)
// ============================================================================
export const uploadApi = {
  uploadImage: (file: File, folder?: string) => {
    const formData = new FormData();
    formData.append("file", file);
    if (folder) formData.append("folder", folder);
    return httpClient.post<{
      statusCode: number;
      message: string;
      data: { url: string; key: string; size: number; mimeType: string };
    }>(3010, "/upload/image", formData);
  },
};

// ============================================================================
// Review Service (Port 3011)
// ============================================================================
export const reviewApi = {
  create: (body: CreateReviewRequest) =>
    httpClient.post<ApiResponse<Review>>(PORTS.REVIEW, "/reviews", body),

  getByMerchant: (
    merchantId: string,
    params?: { skip?: number; take?: number },
  ) =>
    httpClient.get<{
      statusCode: number;
      data: Review[];
      total: number;
      averageRating: number;
    }>(PORTS.REVIEW, `/reviews/merchant/${merchantId}`, { params }),

  getByOrder: (orderId: string) =>
    httpClient.get<ApiResponse<Review | null>>(
      PORTS.REVIEW,
      `/reviews/order/${orderId}`,
    ),

  reply: (reviewId: string, body: ReplyReviewRequest) =>
    httpClient.post<ApiResponse<Review>>(
      PORTS.REVIEW,
      `/reviews/${reviewId}/reply`,
      body,
    ),
};

// ============================================================================
// Promotion Service (Port 3012)
// ============================================================================
export const promotionApi = {
  create: (body: CreatePromotionRequest) =>
    httpClient.post<ApiResponse<Promotion>>(
      PORTS.PROMOTION,
      "/promotions",
      body,
    ),

  list: (params?: {
    merchantId?: string;
    isActive?: boolean;
    skip?: number;
    take?: number;
  }) =>
    httpClient.get<{ statusCode: number; items: Promotion[]; total: number }>(
      PORTS.PROMOTION,
      "/promotions",
      { params },
    ),

  getById: (id: string) =>
    httpClient.get<ApiResponse<Promotion>>(
      PORTS.PROMOTION,
      `/promotions/${id}`,
    ),

  getByMerchant: (merchantId: string) =>
    httpClient.get<ApiResponse<Promotion[]>>(
      PORTS.PROMOTION,
      `/promotions/merchant/${merchantId}`,
    ),

  update: (id: string, body: UpdatePromotionRequest) =>
    httpClient.patch<ApiResponse<Promotion>>(
      PORTS.PROMOTION,
      `/promotions/${id}`,
      body,
    ),

  activate: (id: string) =>
    httpClient.patch<ApiResponse<Promotion>>(
      PORTS.PROMOTION,
      `/promotions/${id}/activate`,
    ),

  deactivate: (id: string) =>
    httpClient.patch<ApiResponse<Promotion>>(
      PORTS.PROMOTION,
      `/promotions/${id}/deactivate`,
    ),

  remove: (id: string) =>
    httpClient.delete<void>(PORTS.PROMOTION, `/promotions/${id}`),

  validate: (body: ValidatePromotionRequest) =>
    httpClient.post<
      ApiResponse<{ discount: number; fundedBy: string; target: string }>
    >(PORTS.PROMOTION, "/promotions/validate", body),

  apply: (body: ApplyPromotionRequest) =>
    httpClient.post<
      ApiResponse<{
        discount: number;
        promotionId: string;
        fundedBy: string;
        target: string;
      }>
    >(PORTS.PROMOTION, "/promotions/apply", body),

  getStats: (id: string) =>
    httpClient.get<ApiResponse<PromotionStats>>(
      PORTS.PROMOTION,
      `/promotions/${id}/stats`,
    ),

  getMerchantStats: (merchantId: string) =>
    httpClient.get<
      ApiResponse<{
        totalPromotions: number;
        activePromotions: number;
        totalUsedCount: number;
        totalDiscount: number;
        totalOrders: number;
      }>
    >(PORTS.PROMOTION, `/promotions/merchant/${merchantId}/stats`),
};

// ============================================================================
// Notification Service (Port 3013)
// ============================================================================
export const notificationApi = {
  create: (body: CreateNotificationRequest) =>
    httpClient.post<ApiResponse<Notification>>(
      PORTS.NOTIFICATION,
      "/notifications",
      body,
    ),

  getByUser: (userId: string, params?: { skip?: number; take?: number }) =>
    httpClient.get<{
      statusCode: number;
      data: Notification[];
      total: number;
      unreadCount: number;
    }>(PORTS.NOTIFICATION, `/notifications/user/${userId}`, { params }),

  markRead: (id: string) =>
    httpClient.patch<ApiResponse<Notification>>(
      PORTS.NOTIFICATION,
      `/notifications/${id}/read`,
    ),

  markAllRead: (userId: string) =>
    httpClient.patch<{ statusCode: number }>(
      PORTS.NOTIFICATION,
      "/notifications/read-all",
      {
        userId,
      },
    ),
};
