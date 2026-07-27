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

export type UserRole = 'CONSUMER' | 'MERCHANT_OWNER' | 'DRIVER' | 'ADMIN';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

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
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface ConsumerProfile {
  id: string;
  userId: string;
  fullName: string;
  avatar?: string | null;
  dateOfBirth?: string;
  gender?: Gender;
  addresses: Address[];
  paymentMethods: PaymentMethod[];
  createdAt: string;
  updatedAt: string;
}

export interface Address {
  id: string;
  type: 'HOME' | 'WORK' | 'OTHER';
  address: string;
  latitude?: number;
  longitude?: number;
  isDefault: boolean;
}

export interface PaymentMethod {
  id: string;
  type: 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH' | 'WALLET';
  provider: string;
  lastFourDigits: string;
  isDefault: boolean;
}

export interface CreateConsumerRequest {
  userId: string;
  fullName: string;
  dateOfBirth?: string;
  gender?: Gender;
}

export interface AddAddressRequest {
  type: 'HOME' | 'WORK' | 'OTHER';
  address: string;
  latitude?: number;
  longitude?: number;
  isDefault?: boolean;
}

export interface AddPaymentMethodRequest {
  type: 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH' | 'WALLET';
  provider: string;
  lastFourDigits: string;
  isDefault?: boolean;
}

// --- Merchant ---
export type MerchantStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type CapacityStatus = 'NORMAL' | 'BUSY' | 'OVERLOADED';

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
  createdAt: string;
  updatedAt: string;
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
}

export type MenuCategory = 'FOOD' | 'DRINK' | 'DESSERT' | 'SNACK' | 'OTHER';

export interface MenuItem {
  id: string;
  merchantId: string;
  category: MenuCategory;
  name: string;
  description?: string;
  price: number;
  originalPrice: number;
  imageUrl?: string | null;
  isAvailable: boolean;
  isFeatured: boolean;
  preparationTime: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuItemRequest {
  category: MenuCategory;
  name: string;
  description?: string;
  price: number;
  isFeatured?: boolean;
  preparationTime?: number;
}

export interface UpdateMenuItemRequest {
  name?: string;
  description?: string;
  price?: number;
  category?: MenuCategory;
  isFeatured?: boolean;
  preparationTime?: number;
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
export type OrderType = 'DELIVERY' | 'PICKUP';
export type OrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'READY_FOR_PICKUP'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REJECTED';

export interface OrderItem {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  specialInstructions?: string;
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
  }[];
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  deliveryFee?: number;
  serviceFee?: number;
  discount?: number;
  notes?: string;
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
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
export type PaymentMethodType = 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH' | 'WALLET';

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
export type DriverStatus = 'ONLINE' | 'OFFLINE' | 'BUSY' | 'ON_DELIVERY';
export type VehicleType = 'MOTORBIKE' | 'CAR' | 'BICYCLE';

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
export type DispatchStatus = 'SEARCHING' | 'ASSIGNED' | 'ACCEPTED' | 'DECLINED' | 'PICKED_UP' | 'COMPLETED' | 'CANCELLED';

export interface Dispatch {
  id: string;
  orderId: string;
  driverId?: string | null;
  status: DispatchStatus;
  searchRadius: number;
  maxSearchTime: number;
  declinedDriverIds: string[];
  estimatedPickupTime?: string | null;
  estimatedDeliveryTime?: string | null;
  actualPickupTime?: string | null;
  actualDeliveryTime?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDispatchRequest {
  orderId: string;
  searchRadius?: number;
  maxSearchTime?: number;
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