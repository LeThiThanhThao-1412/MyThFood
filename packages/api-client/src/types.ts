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
  otherCategoryDescription?: string | null;
  isOpen?: boolean;
  isOpenNow?: boolean;
  /** Thời điểm nhà hàng bị từ chối (nếu có). */
  rejectedAt?: string | null;
  /** Lý do từ chối hồ sơ nhà hàng (nếu có). */
  rejectReason?: string | null;
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
  otherCategoryDescription?: string;
}

export interface MenuCategory {
  id: string;
  merchantId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateMenuCategoryRequest {
  name: string;
  sortOrder?: number;
}

export interface UpdateMenuCategoryRequest {
  name?: string;
  sortOrder?: number;
  isActive?: boolean;
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
  availabilityStatus: string;
  outOfStockUntil: string | null;
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
  reason?: string;
  optionGroups?: MenuItemOptionGroup[];
}

export type MenuItemAvailabilityStatus =
  | "AVAILABLE"
  | "OUT_OF_STOCK_TODAY"
  | "OUT_OF_STOCK";

export interface SetMenuItemAvailabilityRequest {
  status: MenuItemAvailabilityStatus;
}

export interface ImportMenuItemRequest {
  category?: string;
  categoryId?: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isFeatured?: boolean;
  preparationTime?: number;
  optionGroups?: MenuItemOptionGroup[];
}

export interface BulkImportMenuRequest {
  categories?: CreateMenuCategoryRequest[];
  items: ImportMenuItemRequest[];
}

export interface MenuImportError {
  index: number;
  name?: string;
  message: string;
}

export interface MenuImportResult {
  createdCategories: number;
  createdItems: number;
  errors: MenuImportError[];
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

/**
 * Phương thức giao hàng:
 * - SAVER: Tiết kiệm (phí rẻ nhất, thời gian lâu hơn)
 * - FAST: Nhanh (tiêu chuẩn, mặc định)
 * - PRIORITY: Ưu tiên (nhà hàng xử lý trước, phí cao nhất)
 */
export type DeliveryOption = "SAVER" | "FAST" | "PRIORITY";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "CANCELLED"
  | "CANCELLED_NO_DRIVER"
  | "REJECTED";

export interface OrderItem {
  menuItemId: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice?: number | null;
  flashSaleFundedBy?: string | null;
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
  discountFundedBy?: string;
  totalAmount: number;
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  estimatedDeliveryTime?: string | null;
  /** Phương thức giao hàng khách đã chọn. */
  deliveryOption?: DeliveryOption;
  deliveryOptionLabel?: string;
  /** Phụ thu/giảm giá của phương thức so với phí FAST (VND). */
  deliveryOptionFee?: number;
  /** Thứ tự ưu tiên hàng đợi nhà hàng (SAVER 0, FAST 1, PRIORITY 2). */
  priorityRank?: number;
  /** Thời điểm cam kết giao hàng. */
  promisedDeliveryAt?: string | null;
  notes?: string;
  driverId?: string | null;
  /** Ảnh tài xế chụp món ăn lúc giao cho khách (bằng chứng chống khiếu nại). */
  deliveryProofPhotoUrl?: string | null;
  cancelReason?: string | null;
  rejectionReason?: string | null;
  paymentMethod?: string;
  /** Số phiên bản danh sách món (tăng sau mỗi lần khách xác nhận chỉnh sửa). */
  itemsVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PlaceOrderRequest {
  consumerId: string;
  userId?: string;
  compensationVoucherId?: string;
  merchantId: string;
  orderType: OrderType;
  items: {
    menuItemId: string;
    name: string;
    imageUrl?: string | null;
    quantity: number;
    unitPrice: number;
    originalPrice?: number;
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
  /** Phương thức giao hàng — bỏ trống = FAST (tương thích ngược). */
  deliveryOption?: DeliveryOption;
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

// --- Order change request (đổi món, khách xác nhận) ---
export type OrderChangeRequestStatus =
  | "PENDING"
  | "AWAITING_PAYMENT"
  | "APPLIED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export type OrderChangeMoneyStatus =
  | "NONE"
  | "AWAITING_PAYMENT"
  | "CHARGED"
  | "REFUNDED"
  | "FAILED"
  | "NOT_REQUIRED";

export interface OrderChangeItemSnapshot {
  menuItemId: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  originalPrice?: number | null;
  flashSaleFundedBy?: string | null;
  subtotal: number;
  specialInstructions?: string | null;
  options?: SelectedMenuItemOption[] | null;
}

export interface OrderChangeTotals {
  subtotal: number;
  discount: number;
  total: number;
}

export interface OrderChangeRequest {
  id: string;
  orderId: string;
  merchantId: string;
  consumerId: string;
  status: OrderChangeRequestStatus;
  reason?: string | null;
  rejectReason?: string | null;
  beforeItems: OrderChangeItemSnapshot[];
  afterItems: OrderChangeItemSnapshot[];
  before: OrderChangeTotals;
  after: OrderChangeTotals;
  deltaAmount: number;
  paymentMethod: string;
  moneyStatus: OrderChangeMoneyStatus;
  adjustmentPaymentId?: string | null;
  beforeItemsVersion: number;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string | null;
}

export interface OrderChangeItemInput {
  /** Vị trí món trong order.items hiện tại; bỏ trống = món mới. */
  sourceIndex?: number;
  menuItemId: string;
  quantity: number;
  options?: {
    optionId: string;
    groupId: string;
    quantity?: number;
  }[];
  specialInstructions?: string;
}

export interface CreateOrderChangeRequest {
  reason: string;
  items: OrderChangeItemInput[];
}

export interface AcceptOrderChangeRequest {
  paymentId?: string;
  transactionId?: string;
}

export interface AcceptOrderChangeResult {
  changeRequest: OrderChangeRequest;
  order?: Order;
  requiresPayment: boolean;
  payment?: { paymentId: string; clientSecret: string; amount: number };
}

export interface OrderAdjustment {
  id: string;
  orderId: string;
  changeRequestId: string;
  before: OrderChangeTotals;
  after: OrderChangeTotals;
  deltaAmount: number;
  paymentMethod: string;
  moneyStatus: string;
  settlementStatus: string;
  createdAt: string;
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
export type DriverStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "SUSPENDED"
  | "REJECTED"
  | "ONLINE"
  | "OFFLINE"
  | "BUSY"
  | "ON_DELIVERY";
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
  /** Thời điểm hồ sơ tài xế bị từ chối (nếu có). */
  rejectedAt?: string | null;
  /** Lý do từ chối hồ sơ tài xế (nếu có). */
  rejectReason?: string | null;
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
  userId?: string;
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
  avatar?: string | null;
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
  | "DELIVERY_FAILED"
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
  /** Phương thức giao hàng của dispatch. */
  deliveryOption?: DeliveryOption;
  priorityRank?: number;
  promisedDeliveryAt?: string | null;
  /** Lô gộp đơn SAVER (Phase 2). */
  batchId?: string | null;
  routeSequence?: number | null;
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

/** Một điểm dừng trong lộ trình gộp đơn SAVER. */
export interface DriverRouteStop {
  orderId: string;
  sequence: number;
  status: string;
  merchantLatitude: number;
  merchantLongitude: number;
  deliveryLatitude: number;
  deliveryLongitude: number;
  pickupDone: boolean;
  deliveryDone: boolean;
}

export interface DriverRoute {
  driverId: string;
  dispatchId?: string;
  batchId: string | null;
  maxStackedOrders: number;
  stops: DriverRouteStop[];
}

export interface CreateDispatchRequest {
  orderId: string;
  merchantId: string;
  deliveryAddress: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  merchantLatitude?: number;
  merchantLongitude?: number;
  deliveryOption?: DeliveryOption;
  promisedDeliveryAt?: string;
}

export interface DeclineDispatchRequest {
  driverId: string;
  reason: DispatchDeclineReason;
  detail?: string;
}

export interface DriverCancelRequest {
  reason: string;
}

export interface DeliveryFailedRequest {
  reason: string;
  photoUrl?: string;
  faultParty?: "DRIVER" | "CUSTOMER";
}

/**
 * Xác nhận giao hàng thành công. Với đơn DELIVERY, `photoUrl` là ảnh món ăn
 * tài xế chụp lúc giao cho khách và **bắt buộc**.
 */
export interface MarkDeliveredRequest {
  photoUrl?: string;
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

/** Một điểm trong lịch sử vị trí GPS của tài xế. */
export interface DriverLocationPoint {
  id: string;
  driverId: string;
  orderId: string | null;
  latitude: number;
  longitude: number;
  recordedAt: string;
}

// --- Review ---
export interface Review {
  id: string;
  orderId: string;
  consumerId: string;
  merchantId: string;
  driverId?: string | null;
  driverRating?: number | null;
  driverComment?: string | null;
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
  driverComment?: string;
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

// --- Compensation voucher (voucher bồi thường) ---
export interface CompensationConfig {
  id: string;
  value: number;
  isActive: boolean;
  updatedAt: string;
}

export interface CompensationVoucher {
  id: string;
  name: string;
  consumerId: string;
  value: number;
  sourceOrderId: string;
  isUsed: boolean;
  usedOrderId: string | null;
  issuedAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface UpdateCompensationConfigRequest {
  value?: number;
  isActive?: boolean;
}

export interface IssueCompensationVoucherRequest {
  consumerId: string;
  sourceOrderId: string;
}

export interface ApplyCompensationVoucherRequest {
  voucherId: string;
  consumerId: string;
  orderId: string;
}

// --- Flash Sale ---
export type FlashSaleStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "PAUSED"
  | "ENDED"
  | "CANCELLED"
  | "SOLD_OUT";

export type FlashSaleDiscountType = "PERCENT" | "FIXED_PRICE";
export type FlashSaleFundedBy = "MERCHANT" | "PLATFORM";

export interface FlashSaleItem {
  id: string;
  flashSaleId: string;
  menuItemId: string;
  menuItemName: string | null;
  imageUrl: string | null;
  originalPrice: number;
  discountType: FlashSaleDiscountType;
  discountPercent: number | null;
  salePrice: number;
  totalQuantity: number;
  soldQuantity: number;
  limitPerUser: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlashSale {
  id: string;
  merchantId: string;
  title: string;
  fundedBy: FlashSaleFundedBy;
  status: FlashSaleStatus;
  startAt: string;
  endAt: string;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: FlashSaleItem[];
}

export interface FlashSaleItemInput {
  menuItemId: string;
  quantity: number;
  unitPrice?: number;
}

export interface CreateFlashSaleItemRequest {
  menuItemId: string;
  menuItemName?: string;
  imageUrl?: string;
  originalPrice: number;
  discountType: FlashSaleDiscountType;
  discountPercent?: number;
  salePrice?: number;
  totalQuantity: number;
  limitPerUser?: number;
}

export interface CreateFlashSaleRequest {
  merchantId: string;
  title?: string;
  items: CreateFlashSaleItemRequest[];
  startAt: string;
  endAt: string;
  fundedBy?: FlashSaleFundedBy;
}

export interface UpdateFlashSaleItemRequest {
  id: string;
  totalQuantity?: number;
  limitPerUser?: number;
}

export interface UpdateFlashSaleRequest {
  title?: string;
  startAt?: string;
  endAt?: string;
  items?: UpdateFlashSaleItemRequest[];
}

export interface FlashSalePricedItem {
  menuItemId: string;
  originalPrice: number;
  salePrice: number;
  /** Tổng số lượng khách đặt cho món này. */
  quantity: number;
  /**
   * Số phần được hưởng giá flash sale (tối đa theo `limitPerUser` và số suất
   * còn lại). Phần chênh lệch (`quantity - saleQuantity`) tính giá thường.
   */
  saleQuantity?: number;
  hasFlashSale?: boolean;
  remainingStock?: number | null;
  limitPerUser?: number | null;
  /** Số suất còn lại của riêng khách (chỉ có khi truyền consumerId). */
  remainingUserQuota?: number;
  fundedBy?: FlashSaleFundedBy | null;
}

export interface ValidateFlashSaleRequest {
  merchantId: string;
  items: FlashSaleItemInput[];
  consumerId?: string;
}

export interface ApplyFlashSaleRequest {
  merchantId: string;
  consumerId: string;
  orderId: string;
  items: FlashSaleItemInput[];
}

export interface RefundFlashSaleRequest {
  orderId: string;
}

export interface FlashSaleStats {
  totalOrders: number;
  totalSoldQuantity: number;
  totalDiscount: number;
  totalRevenue: number;
}

// --- Price Management ---
export type PriceHistoryStatus = "RECORDED" | "AUDITED" | "FLAGGED";
export type PriceHistoryType = "MANUAL" | "FLASH_SALE";

export interface PriceHistory {
  id: string;
  merchantId: string;
  menuItemId: string;
  menuItemName: string | null;
  oldPrice: number;
  newPrice: number;
  changedBy: string | null;
  reason: string | null;
  status: PriceHistoryStatus;
  type: PriceHistoryType;
  createdAt: string;
}

export interface PriceAlert {
  id: string;
  merchantId: string;
  menuItemId: string;
  oldPrice: number;
  newPrice: number;
  changePercent: number;
  message: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PriceFluctuationReport {
  merchantId: string;
  period: { from: string | null; to: string | null };
  totalChanges: number;
  flaggedCount: number;
  avgChangePercent: number;
  maxChangePercent: number;
  totalAlerts: number;
}

export interface RevenueReconciliation {
  merchantId: string;
  period: string;
  totalOrders: number;
  totalRevenue: number;
  pendingOrders: number;
  expectedRevenue: number;
  actualRevenue: number;
  difference: number;
  revenueByDay: { date: string; orders: number; revenue: number }[];
  items: {
    orderId: string;
    menuItemId: string;
    name: string | null;
    quantity: number;
    unitPrice: number;
    listPrice: number | null;
    actualRevenue: number;
    expectedRevenue: number | null;
    difference: number | null;
    createdAt: string;
  }[];
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

// --- Chat ---
export type ChatMessageType = "TEXT" | "IMAGE";
export type ChatSenderRole = "CONSUMER" | "DRIVER";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: ChatSenderRole;
  type: ChatMessageType;
  content: string;
  createdAt: string;
}

export interface ChatConversation {
  id: string;
  orderId: string;
  consumerUserId: string;
  driverUserId: string;
  lastMessageAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  hardDeleteAt: string | null;
  lastMessage?: ChatMessage | null;
}

export interface GetOrCreateConversationRequest {
  orderId: string;
  consumerUserId: string;
  driverUserId: string;
}

export interface SendMessageRequest {
  type: ChatMessageType;
  content: string;
}

// --- Resolution Service: AI Assistant (Gemini) ---

export type AiVerdict = "VALID" | "INVALID" | "INCONCLUSIVE";
export type AiFaultParty =
  | "CUSTOMER"
  | "DRIVER"
  | "MERCHANT"
  | "SYSTEM"
  | "INCONCLUSIVE";
export type AiSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AiActionType =
  | "NO_ACTION"
  | "WARNING"
  | "FINE"
  | "COMPENSATION"
  | "SUSPEND"
  | "BAN"
  | "REPUTATION_DEDUCTION"
  | "RESTRICT_ACTIVITY";
export type AiTargetType = "CONSUMER" | "DRIVER" | "MERCHANT";

/** Ảnh bằng chứng có khớp với mô tả khiếu nại hay không. */
export type AiImageSupport =
  | "SUPPORTS"
  | "CONTRADICTS"
  | "NEUTRAL"
  | "NO_IMAGE";

export interface AiSuggestedAction {
  type: AiActionType;
  targetType: AiTargetType;
  amount: number | null;
  durationDays: number | null;
  reason: string;
}

/**
 * Trọng số bằng chứng (%) của một lần phân tích: ảnh giao hàng hệ thống 35 +
 * ảnh bên khiếu nại 25 + ảnh bên bị khiếu nại 15 + dữ liệu hệ thống 20 + lời
 * khai 5 (tổng tối đa 100).
 */
export interface AiEvidenceWeight {
  images: number;
  system: number;
  testimony: number;
  /** images + system — ≥ 50 nghĩa là đủ căn cứ kết luận. */
  objective: number;
  basis: "IMAGES" | "SYSTEM" | "TESTIMONY";
  /** Ảnh của chính bên khiếu nại mâu thuẫn với lời khai. */
  reporterSelfContradiction: boolean;
}

/** Ảnh bằng chứng của **một bên**, đã phân tích riêng. */
export interface AiSideImageAnalysis {
  attached: number;
  analyzed: number;
  support: AiImageSupport;
  analysis: string;
}

export interface CaseAiSuggestion {
  caseId: string;
  caseNumber: string;
  generatedAt: string;
  model: string;
  summary: string;
  /** Tổng số ảnh bằng chứng đã gửi cho model (0 = không có ảnh). */
  imagesAnalyzed: number;
  /** Phân tích ảnh của bên khiếu nại. */
  reporterImages: AiSideImageAnalysis;
  /** Phân tích ảnh của bên bị khiếu nại. */
  respondentImages: AiSideImageAnalysis;
  /** Ảnh giao hàng (tài xế chụp lúc bấm giao thành công) — bằng chứng hệ thống. */
  deliveryProof: {
    photoUrl: string | null;
    analyzed: boolean;
  };
  /** Trọng số bằng chứng (%) đã dùng để kết luận — ảnh & hệ thống > lời khai. */
  evidenceWeight: AiEvidenceWeight;
  /** ≤ 3 câu so sánh lời khai/ảnh của hai bên trước khi kết luận. */
  sideComparison: string;
  suggestedVerdict: AiVerdict;
  suggestedFaultParty: AiFaultParty;
  suggestedSeverity: AiSeverity;
  confidence: number;
  keyFindings: string[];
  evidenceGaps: string[];
  riskFlags: string[];
  suggestedActions: AiSuggestedAction[];
  suggestedResolutionNote: string;
  followUpQuestions: string[];
  /** Yêu cầu bổ sung gửi bên bị khiếu nại (tối đa 2, rỗng nếu đã kết luận được). */
  respondentQuestions: string[];
  sourcesUsed: string[];
  sourcesMissing: string[];
  warnings: string[];
  usage: {
    promptTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
}

export interface CaseAiContextSource {
  id: string;
  name: string;
  available: boolean;
  detail?: string;
  payload?: unknown;
}

export interface CaseAiContext {
  generatedAt: string;
  case: {
    id: string;
    caseNumber: string;
    type: string;
    category: string;
    severity: string;
    status: string;
    orderId: string | null;
    reporterId: string;
    reporterType: string;
    respondentId: string;
    respondentType: string;
    subject: string;
    description: string;
    evidence: string[];
    respondentResponse: string | null;
    respondentEvidence: string[];
    respondentRespondedAt: string | null;
    createdAt: string | null;
    responseDeadline: string | null;
  };
  sources: CaseAiContextSource[];
  missingSourceIds: string[];
  criticalMissingSourceIds: string[];
  imagesAttached: number;
  imagesSkipped: string[];
  /** Ảnh món ăn tài xế chụp lúc giao cho khách (bằng chứng hệ thống của đơn). */
  deliveryProofPhotoUrl?: string | null;
  /** Ảnh giao hàng của tài xế có được gửi cho AI phân tích hay không. */
  deliveryProofImageAttached?: boolean;
}

export interface AssistantHealth {
  /** `glm` hoặc `gemini` (theo AI_PROVIDER). */
  provider: string;
  enabled: boolean;
  hasApiKey: boolean;
  /** Biến môi trường chứa key của provider đang chọn (vd `GLM_API_KEY`). */
  apiKeyEnv: string;
  apiBase: string;
  model: string;
  /** Model đọc ảnh bằng chứng (GLM tách riêng model vision). */
  visionModel?: string | null;
  maxEvidenceImages: number;
  sourceCount: number;
  /** AI có tự phân tích khi có khiếu nại mới hay không. */
  autoAnalyze: boolean;
}

export type AiAnalysisSource = "AUTO" | "MANUAL";
export type AiReviewDecision = "ACCEPTED" | "REJECTED";

/** Kết quả sau khi admin duyệt gợi ý (áp dụng phán quyết/hình phạt/thông báo). */
export interface AiDecisionOutcome {
  applied: boolean;
  verdict: string | null;
  caseStatus: string | null;
  penalties: number;
  notified: string[];
  evidenceRequestedFrom: string[];
  summary: string;
}

export interface CaseAiReviewResult {
  analysis: CaseAiAnalysisRecord | null;
  outcome: AiDecisionOutcome;
}

/** Vết admin duyệt / bỏ qua gợi ý AI. */
export interface CaseAiAnalysisReview {
  decision: AiReviewDecision;
  by: string;
  at: string;
  note: string | null;
}

/** Bản phân tích AI đã lưu cho một vụ việc. */
export interface CaseAiAnalysisRecord {
  caseId: string;
  caseNumber: string;
  source: AiAnalysisSource;
  createdAt: string;
  suggestion: CaseAiSuggestion;
  review: CaseAiAnalysisReview | null;
  /** Bản phân tích đã cũ (vụ việc có phản hồi mới sau thời điểm phân tích). */
  stale: boolean;
}
