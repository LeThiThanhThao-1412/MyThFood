// ============================================================================
// MyThFood API Client - Shared Types
// ============================================================================

// --- Generic API Response Wrapper ---
export interface ApiResponse<T> {
  statusCode: number;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

// --- Auth ---
export interface LoginRequest {
  phoneNumber: string;
  password: string;
}

export interface RegisterRequest {
  phoneNumber: string;
  fullName: string;
  password: string;
  email?: string;
  roles: UserRole[];
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: UserProfile;
}

export type UserRole = "CONSUMER" | "MERCHANT_OWNER" | "DRIVER" | "ADMIN";

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface UserProfile {
  id: string;
  phone: string;
  fullName: string;
  email?: string;
  roles: UserRole[];
}

export interface UserDetail {
  id: string;
  fullName: string;
  phoneNumber: string;
  email?: string;
  roles: UserRole[];
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

// --- Consumer ---
export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface ConsumerProfile {
  id: string;
  userId: string;
  fullName: string;
  avatar?: string | null;
  dateOfBirth?: string;
  gender?: Gender;
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  favoriteMerchantIds?: string[];
  favoriteMenuItemIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  id: string;
  type: "HOME" | "WORK" | "OTHER";
  address: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  type: "CREDIT_CARD" | "DEBIT_CARD" | "E_WALLET";
  provider: string;
  lastFourDigits: string;
  expiryDate?: string | null;
  isDefault: boolean;
}

export interface CreateConsumerRequest {
  userId: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: Gender;
}

export interface AddAddressRequest {
  label: string;
  fullAddress: string;
  city: string;
  district?: string;
  ward?: string;
  street?: string;
  gps?: { latitude: number; longitude: number };
  type?: "HOME" | "WORK" | "OTHER";
}

export interface UpdateConsumerProfileRequest {
  fullName?: string;
  avatar?: string;
  dateOfBirth?: string;
  gender?: Gender;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface AddPaymentMethodRequest {
  type: "CREDIT_CARD" | "DEBIT_CARD" | "E_WALLET";
  provider: string;
  token: string;
  lastFourDigits: string;
  expiryDate?: string;
}

// --- Merchant ---
export type MerchantStatus = "PENDING" | "APPROVED" | "REJECTED" | "SUSPENDED";
export type CapacityStatus = "NORMAL" | "BUSY" | "OVERLOADED";

export interface Merchant {
  id: string;
  userId: string;
  name: string;
  description?: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  phone: string;
  email?: string;
  address: string;
  latitude?: number;
  longitude?: number;
  status: MerchantStatus;
  rating: number;
  totalRatings?: number;
  totalOrders: number;
  capacityStatus: CapacityStatus;
  currentOrderCount: number;
  primaryCategory?: string | null;
  secondaryCategories?: string[];
  isOpen?: boolean;
  isOpenNow?: boolean;
  /** Dishes that matched the `search` keyword (only present when searching). */
  matchedMenuItems?: MatchedMenuItem[];
  createdAt: string;
  updatedAt: string;
}

/** Dish that matched a keyword search, attached to a merchant in list results. */
export interface MatchedMenuItem {
  id: string;
  name: string;
  price: number;
  imageUrl: string | null;
}

/** Sort keys supported by the merchant list endpoint (server-side). */
export type MerchantSortKey = "rating" | "popular" | "newest" | "name";

export interface MerchantListQuery {
  status?: string;
  search?: string;
  /** Legacy single-category filter. */
  category?: string;
  /** CSV of category keys, e.g. `"pho,rice"`. */
  categories?: string;
  /** Only merchants with `rating >= minRating` (0-5). */
  minRating?: number;
  /** Only merchants open right now (manual flag + operating hours). */
  openNow?: boolean;
  sortBy?: MerchantSortKey;
  sortOrder?: "ASC" | "DESC";
  skip?: number;
  take?: number;
}

/** Result row of the global dish search endpoint. */
export interface MenuSearchItem {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  category: string;
  isAvailable: boolean;
  merchant: {
    id: string;
    name: string;
    rating: number;
    address: string;
    latitude: number | null;
    longitude: number | null;
    isOpen: boolean;
    isOpenNow: boolean;
  };
}

export interface CreateMerchantRequest {
  userId: string;
  name: string;
  phone: string;
  address: string;
  email?: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  primaryCategory?: string;
  secondaryCategories?: string[];
}

export interface MenuCategory {
  id: string;
  merchantId: string;
  name: string;
  sortOrder: number;
}

export interface CreateMenuCategoryRequest {
  name: string;
  sortOrder?: number;
}

export interface UpdateMenuCategoryRequest {
  name?: string;
  sortOrder?: number;
}

export type OptionGroupType = "CHOICE" | "MULTI_CHOICE" | "TOGGLE" | "QUANTITY";

export interface MenuItemOption {
  id: string;
  name: string;
  priceDelta: number; // số tiền cộng/trừ (có thể âm)
  isDefault?: boolean; // mặc định được chọn (CHOICE/TOGGLE)
  minQuantity?: number; // dành cho QUANTITY
  maxQuantity?: number; // dành cho QUANTITY
}

export interface MenuItemOptionGroup {
  id: string;
  name: string;
  type: OptionGroupType;
  required: boolean;
  minSelections?: number; // MULTI_CHOICE: tối thiểu phải chọn
  maxSelections?: number; // MULTI_CHOICE: tối đa
  options: MenuItemOption[];
}

// Snapshot các option đã chọn (dùng cho cart + order)
export interface SelectedMenuItemOption {
  optionId: string;
  groupId: string;
  groupName: string;
  name: string;
  priceDelta: number;
  quantity?: number; // dành cho QUANTITY
}

export interface SelectedOptionGroup {
  groupId: string;
  groupName: string;
  type: OptionGroupType;
  options: SelectedMenuItemOption[];
}

export interface MenuItem {
  id: string;
  merchantId: string;
  category: string;
  categoryId?: string | null;
  name: string;
  description?: string;
  price: number;
  originalPrice: number;
  imageUrl?: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  preparationTime: number;
  sortOrder: number;
  optionGroups?: MenuItemOptionGroup[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuItemRequest {
  category: string;
  categoryId?: string;
  name: string;
  description?: string;
  price: number;
  isFeatured?: boolean;
  preparationTime?: number;
  optionGroups?: MenuItemOptionGroup[];
}

export interface UpdateMenuItemRequest {
  name?: string;
  description?: string;
  price?: number;
  category?: string;
  categoryId?: string | null;
  isFeatured?: boolean;
  preparationTime?: number;
  optionGroups?: MenuItemOptionGroup[];
}

export interface OperatingHour {
  dayOfWeek: number; // 0=Sunday, 1=Monday, ..., 6=Saturday
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
  isClosed: boolean;
}

export interface SetOperatingHoursRequest {
  hours: OperatingHour[];
}

export interface UpdateCapacityRequest {
  maxConcurrentOrders: number;
  prepTimePerOrder: number;
}

// --- Order ---
export type OrderType = "DELIVERY" | "PICKUP";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "REJECTED";

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions?: string;
  options?: SelectedMenuItemOption[];
}

export interface Order {
  id: string;
  consumerId: string;
  merchantId: string;
  orderType: OrderType;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  serviceFee: number;
  discount: number;
  totalAmount: number;
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  estimatedDeliveryTime?: string | null;
  notes?: string;
  driverId?: string | null;
  cancelReason?: string | null;
  rejectionReason?: string | null;
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderRequest {
  consumerId: string;
  merchantId: string;
  orderType: OrderType;
  items: {
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    specialInstructions?: string;
    options?: SelectedMenuItemOption[];
  }[];
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  deliveryFee?: number;
  serviceFee?: number;
  discount?: number;
  promotionCode?: string;
  notes?: string;
  paymentMethod?: string;
}

export interface CancelOrderRequest {
  reason: string;
}

export interface RejectOrderRequest {
  reason: string;
}

export interface OutForDeliveryRequest {
  driverId: string;
}

export interface UpdateOrderRequest {
  notes?: string;
  estimatedDeliveryTime?: string;
  driverId?: string;
}

// --- Payment ---
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
export type PaymentMethodType =
  | "CREDIT_CARD"
  | "DEBIT_CARD"
  | "CASH"
  | "WALLET";

export interface Payment {
  id: string;
  orderId: string;
  consumerId: string;
  merchantId: string;
  amount: number;
  paymentMethod: PaymentMethodType;
  status: PaymentStatus;
  transactionId?: string | null;
  failureReason?: string | null;
  refundReason?: string | null;
  refundedAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentRequest {
  orderId: string;
  consumerId: string;
  merchantId: string;
  amount: number;
  paymentMethod: PaymentMethodType;
}

export interface CompletePaymentRequest {
  transactionId: string;
}

export interface FailPaymentRequest {
  reason: string;
}

export interface RefundPaymentRequest {
  reason: string;
}

// --- Inventory ---
export interface Inventory {
  id: string;
  menuItemId: string;
  merchantId: string;
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  reservations: InventoryReservation[];
  isLowStock: boolean;
  isOutOfStock: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryReservation {
  orderId: string;
  quantity: number;
  reservedAt: string;
  expiresAt: string;
}

export interface CreateInventoryRequest {
  menuItemId: string;
  merchantId: string;
  totalQuantity: number;
  lowStockThreshold?: number;
}

export interface ReserveStockRequest {
  orderId: string;
  quantity: number;
  timeoutMinutes?: number;
}

export interface ReleaseStockRequest {
  orderId: string;
  reason?: string;
}

export interface ConsumeStockRequest {
  orderId: string;
}

export interface UpdateStockRequest {
  totalQuantity: number;
}

// --- Driver ---
export type DriverStatus = "ONLINE" | "OFFLINE" | "BUSY" | "ON_DELIVERY";
export type VehicleType = "MOTORBIKE" | "CAR" | "BICYCLE";

export interface Driver {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  vehicleType: VehicleType;
  licensePlate: string;
  status: DriverStatus;
  currentLatitude?: number;
  currentLongitude?: number;
  rating: number;
  totalRatings?: number;
  totalDeliveries: number;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Thông tin công khai của tài xế dành cho CONSUMER (không chứa dữ liệu nhạy cảm). */
export interface DriverPublicProfile {
  id: string;
  fullName: string;
  avatar?: string | null;
  vehicleRegistrationNumber: string;
  rating: number;
  totalRatings: number;
}

export interface RegisterDriverRequest {
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  vehicleType: VehicleType;
  licensePlate: string;
}

export interface UpdateLocationRequest {
  latitude: number;
  longitude: number;
}

// --- Dispatch ---
/** Trạng thái dispatch (khớp `DispatchStatus` enum của dispatch-service). */
export type DispatchStatus =
  | "MATCHING"
  | "DRIVER_ASSIGNED"
  | "DRIVER_ACCEPTED"
  | "DRIVER_DECLINED"
  | "DRIVER_ARRIVED"
  | "PICKED_UP"
  | "DELIVERING"
  | "DELIVERED"
  | "EXPIRED"
  | "CANCELLED";

export type DispatchDeclineReason =
  | "TOO_FAR"
  | "BUSY"
  | "FATIGUE"
  | "COD_NOT_ENOUGH"
  | "OTHER";

export interface Dispatch {
  id: string;
  orderId: string;
  merchantId: string;
  /** Toạ độ nhà hàng — dùng để vẽ tuyến “tài xế → quán”. */
  merchantLatitude?: number;
  merchantLongitude?: number;
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  status: DispatchStatus;
  driverId?: string | null;
  matchedDriverIds?: string[];
  retryCount?: number;
  declineReason?: string | null;
  declineReasonType?: DispatchDeclineReason | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  expiresAt?: string | null;
  cancellationReason?: string | null;
  notes?: string | null;
  isActive?: boolean;
  hasRemainingRetries?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateDispatchRequest {
  orderId: string;
  merchantId: string;
  deliveryAddress: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  merchantLatitude?: number;
  merchantLongitude?: number;
}

export interface DeclineDispatchRequest {
  driverId: string;
  reason: DispatchDeclineReason;
  detail?: string;
}

// --- Socket Events ---
export interface OrderStatusUpdate {
  orderId: string;
  status: OrderStatus;
  timestamp: string;
}

export interface DriverLocationUpdate {
  driverId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

// --- Review ---
export interface Review {
  id: string;
  orderId: string;
  consumerId: string;
  merchantId: string;
  driverId?: string | null;
  driverRating?: number | null;
  rating: number;
  comment?: string | null;
  tags?: string[];
  images?: string[] | null;
  merchantReply?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReviewRequest {
  orderId: string;
  consumerId: string;
  merchantId: string;
  driverId?: string;
  driverRating?: number;
  rating: number;
  comment?: string;
  tags?: string[];
  images?: string[];
}

export interface ReplyReviewRequest {
  reply: string;
}

// --- Promotion ---
export type PromotionType = "PERCENT" | "FIXED";

export type PromotionTarget = "FOOD" | "SHIPPING" | "ITEM";
export type PromotionFundedBy = "MERCHANT" | "PLATFORM";

export interface PromotionItem {
  menuItemId: string;
  quantity: number;
  unitPrice: number;
}

export interface Promotion {
  id: string;
  merchantId: string;
  code: string;
  type: PromotionType;
  target: PromotionTarget;
  fundedBy: PromotionFundedBy;
  menuItemId?: string | null;
  menuItemName?: string | null;
  value: number;
  minOrderValue?: number | null;
  maxDiscount?: number | null;
  startAt?: string | null;
  endAt?: string | null;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  usedCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePromotionRequest {
  merchantId: string;
  code: string;
  type: PromotionType;
  target: PromotionTarget;
  menuItemId?: string;
  menuItemName?: string;
  value: number;
  minOrderValue?: number;
  maxDiscount?: number;
  startAt?: string;
  endAt?: string;
  usageLimit?: number;
  usageLimitPerUser?: number;
}

export interface UpdatePromotionRequest {
  menuItemId?: string;
  menuItemName?: string;
  value?: number;
  minOrderValue?: number;
  maxDiscount?: number;
  startAt?: string;
  endAt?: string;
  usageLimit?: number;
  usageLimitPerUser?: number;
}

export interface PromotionUsage {
  id: string;
  promotionId: string;
  orderId: string;
  consumerId: string;
  discountAmount: number;
  createdAt: string;
}

export interface PromotionStats {
  usedCount: number;
  totalDiscount: number;
  totalOrders: number;
}

export interface ValidatePromotionRequest {
  merchantId: string;
  code: string;
  foodTotal: number;
  shippingFee?: number;
  consumerId?: string;
  itemTotal?: number;
  items?: PromotionItem[];
}

export interface ApplyPromotionRequest {
  merchantId: string;
  code: string;
  orderId: string;
  consumerId: string;
  foodTotal: number;
  shippingFee?: number;
  itemTotal?: number;
  items?: PromotionItem[];
}

// --- Notification ---
export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface CreateNotificationRequest {
  userId: string;
  type: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}
