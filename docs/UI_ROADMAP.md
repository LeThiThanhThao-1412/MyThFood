# MyThFood - UI Development Roadmap

> **Ngày lập:** 2026-07-26
> **Nguyên tắc:** Responsive toàn thiết bị (Mobile / Tablet / Desktop), dữ liệu thật từ Backend API, tham khảo phong cách GrabFood

---

## Mục lục

1. [Nguyên tắc chung](#1-nguyên-tắc-chung)
2. [Design System & Shared Components](#2-design-system--shared-components)
3. [App 1: Consumer App](#3-app-1-consumer-app)
4. [App 2: Merchant App](#4-app-2-merchant-app)
5. [App 3: Driver App](#5-app-3-driver-app)
6. [App 4: Admin Portal](#5-app-4-admin-portal)
7. [API Gaps - Endpoints cần bổ sung](#7-api-gaps---endpoints-cần-bổ-sung)

---

## 1. Nguyên tắc chung

### 1.1 Responsive Strategy

| Breakpoint          | Thiết bị | Layout                                      |
| ------------------- | -------- | ------------------------------------------- |
| < 640px (sm)        | Mobile   | Single column, bottom nav, full-width cards |
| 640px - 1024px (md) | Tablet   | 2-column grid, side drawer menu             |
| > 1024px (lg)       | Desktop  | Multi-column, sidebar, data tables          |

**Consumer & Driver App:** Mobile-first (nhưng không giới hạn max-width, mở rộng tự nhiên lên desktop)
**Merchant & Admin:** Desktop-first (sidebar layout), thu nhỏ responsive xuống mobile

### 1.2 Data Flow

```
Backend DB → Service API → api-client (typed) → React Hook (TanStack Query) → UI Component
```

- **KHÔNG dùng dữ liệu ảo (hard-coded mock data)**. Mọi dữ liệu hiển thị phải lấy từ API thật.
- Mỗi page phải xử lý đủ 4 states: **Loading** (Skeleton), **Empty** (illustration + CTA), **Error** (message + retry), **Success** (data).
- Form phải có validation đầy đủ và gửi đúng payload API yêu cầu.

### 1.3 Tech Stack

| Layer        | Công nghệ                               |
| ------------ | --------------------------------------- |
| Framework    | Next.js 14 (App Router)                 |
| Styling      | Tailwind CSS + shadcn/ui primitives     |
| Server State | @tanstack/react-query                   |
| Client State | Zustand (cart, UI state)                |
| Form         | react-hook-form + zod                   |
| Map          | MapLibre GL JS (vector tiles, MapTiler) |
| Payment      | @stripe/react-stripe-js                 |

---

## 2. Design System & Shared Components

**Vị trí:** `mythfood/packages/frontend-shared/src/`

### 2.1 Design Tokens (`styles/tokens.css`)

```css
:root {
  /* Primary Brand */
  --color-primary: #ff6b35;
  --color-primary-light: #ff8f65;
  --color-primary-dark: #e55a2b;

  /* Neutral */
  --color-bg: #f0f2f5;
  --color-surface: #ffffff;
  --color-text: #1a1a2e;
  --color-text-secondary: #888888;

  /* Semantic */
  --color-success: #2ecc71;
  --color-warning: #e67e22;
  --color-error: #e74c3c;
  --color-info: #3498db;

  /* Spacing, Radius, Shadows... */
}
```

### 2.2 Shared UI Components

| Component           | Mô tả                                       | Props                                  |
| ------------------- | ------------------------------------------- | -------------------------------------- |
| `Button`            | Primary/Secondary/Outline/Ghost/Danger      | variant, size, loading, disabled       |
| `Card`              | Container với shadow, radius                | padding, hover, onClick                |
| `Badge`             | Status badge (pending, success, error...)   | variant, size                          |
| `StatCard`          | Card thống kê (icon, label, value, change%) | icon, label, value, change, trend      |
| `DataTable`         | Bảng dữ liệu sortable, paginated            | columns, data, loading, onRowClick     |
| `SearchBar`         | Input search với icon, debounce             | placeholder, onSearch, value           |
| `BottomNav`         | Thanh điều hướng dưới (mobile)              | items, activeItem, onChange            |
| `Sidebar`           | Sidebar điều hướng (desktop)                | items, activeItem, logo, footerContent |
| `TopBar`            | Thanh top với greeting, actions             | title, subtitle, actions               |
| `Skeleton`          | Loading placeholder                         | variant (card/table/text), count       |
| `EmptyState`        | Trạng thái rỗng                             | icon, title, description, action       |
| `ErrorState`        | Trạng thái lỗi                              | message, onRetry                       |
| `OrderTimeline`     | Step indicator cho trạng thái đơn hàng      | steps, currentStep                     |
| `MapView`           | Bản đồ với marker, route (đã có)            | markers, route, center, zoom           |
| `FloatingActionBar` | Thanh hành động nổi dưới cùng               | content, visible                       |

### 2.3 API Hooks (`hooks/`)

Mỗi hook bọc TanStack Query quanh `api-client`:

| Hook                            | API function              | Return                                   |
| ------------------------------- | ------------------------- | ---------------------------------------- |
| `useAuth()`                     | authApi.login/register/me | user, login, register, logout, isLoading |
| `useMerchants(params)`          | merchantApi.list          | merchants, isLoading, error              |
| `useMerchant(id)`               | merchantApi.getById       | merchant, isLoading                      |
| `useMenu(merchantId)`           | merchantApi.getMenu       | items, isLoading                         |
| `useOrders(params)`             | orderApi.list             | orders, isLoading, pagination            |
| `useOrder(id)`                  | orderApi.getById          | order, isLoading                         |
| `usePlaceOrder()`               | orderApi.place            | mutate, isPending                        |
| `useConsumerProfile(userId)`    | consumerApi.getByUserId   | profile, isLoading                       |
| `useDriver(id)`                 | driverApi.getById         | driver, isLoading                        |
| `useDispatch(orderId)`          | dispatchApi.getByOrder    | dispatch, isLoading                      |
| `useWallet(ownerId, ownerType)` | walletApi.getWallet       | wallet, transactions, isLoading          |
| `useShippingFee(params)`        | shippingApi.getFee        | fee, isLoading                           |
| `usePayments(params)`           | paymentApi.list           | payments, isLoading                      |

---

## 3. App 1: Consumer App

**Thư mục:** `mythfood/apps/consumer-app/src/app/`
**Tham khảo design:** `UI/consumer.html`
**Phong cách:** GrabFood (cam `#ff6b35`, mobile-first responsive)

---

### 3.1 Trang Đăng nhập (`/login`)

**Responsive:** Form centered card (mobile: full-width, desktop: max-w-md centered)

#### UI Components

| Khu vực | Mô tả                                    | Component                                                                                       |
| ------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Logo    | MyThFood lớn, centered                   | `<Logo />`                                                                                      |
| Form    | Số điện thoại + Mật khẩu + Nút Đăng nhập | `<Input type="tel" />` + `<Input type="password" />` + `<Button variant="primary" fullWidth />` |
| Link    | "Chưa có tài khoản? Đăng ký"             | `<Link href="/register" />`                                                                     |

#### API & Payload

| Action      | API               | Request Payload                             | Response                           | State handling                 |
| ----------- | ----------------- | ------------------------------------------- | ---------------------------------- | ------------------------------ |
| Đăng nhập   | `authApi.login()` | `{ phoneNumber: string, password: string }` | `{ accessToken, expiresIn, user }` | Store token → redirect `/`     |
| Lấy profile | `authApi.me()`    | Header: `Authorization: Bearer <token>`     | `UserDetail`                       | Nếu đã có token → redirect `/` |

#### States

- **Loading:** Button hiển thị spinner "Đang đăng nhập..."
- **Error:** Toast message đỏ (sai số điện thoại/mật khẩu, tài khoản bị khóa)
- **Validation:** Số điện thoại (định dạng VN: 10 số, bắt đầu 0), mật khẩu min 6 ký tự

---

### 3.2 Trang Đăng ký (`/register`)

**Responsive:** Form centered card (mobile: full-width, desktop: max-w-md centered)

#### API & Payload

| Action      | API                    | Request Payload                                                    | Response          |
| ----------- | ---------------------- | ------------------------------------------------------------------ | ----------------- |
| Đăng ký     | `authApi.register()`   | `{ phoneNumber, fullName, password, email?, roles: ['CONSUMER'] }` | `{ user }`        |
| Tạo profile | `consumerApi.create()` | `{ userId, name, phone, defaultAddress? }`                         | `ConsumerProfile` |

#### Form Fields

- Số điện thoại (required, định dạng VN: 10 số)
- Họ tên (required)
- Email (optional)
- Mật khẩu (required, min 6 ký tự)
- Xác nhận mật khẩu (must match)

---

### 3.3 Trang chủ (`/`)

**Responsive:**

- Mobile: single column, bottom nav cố định
- Tablet: 2-column grid cards, top nav thay bottom nav
- Desktop: sidebar category filter + 3-column grid + map preview bên phải

#### UI Layout

| Khu vực              | Mô tả                                             | Responsive                                               | API                                      |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| **StatusBar**        | Giờ, pin (mobile only)                            | Hidden on desktop                                        | -                                        |
| **Header**           | Logo + 🔔 thông báo + 💬 chat                     | Mobile: compact; Desktop: expanded với search integrated | -                                        |
| **Address Bar**      | "📍 Giao đến: [địa chỉ] ▾"                        | Tap mở modal chọn địa chỉ                                | `consumerApi.getByUserId()`              |
| **Search Bar**       | "🔍 Tìm món, nhà hàng..."                         | Link → `/search`                                         | -                                        |
| **Banner**           | Flash sale / Khuyến mãi (carousel)                | Full width                                               | (tạm thời static, sau này promotion API) |
| **Categories**       | Scroll ngang: Món chính, Đồ uống...               | Horizontal scroll                                        | Static list                              |
| **Nearby Merchants** | Section "⭐ Nhà hàng gợi ý" + "Xem tất cả →"      | Grid cards                                               | `merchantApi.list({ status: 'active' })` |
| **Merchant Cards**   | Ảnh, tên, rating, phí ship, thời gian, trạng thái | 1 col mobile, 2 col tablet, 3 col desktop                | Dữ liệu từ `merchantApi.list()`          |
| **Floating Cart**    | Hiện khi cart.length > 0                          | Cố định bottom                                           | Zustand cart state                       |
| **Bottom/Top Nav**   | Mobile: bottom; Desktop: top/sidebar              | Adaptive                                                 | -                                        |

#### API Calls (1 page load)

| #   | API                                                | Endpoint                               | Dữ liệu hiển thị                                 |
| --- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------ |
| 1   | `authApi.me()`                                     | `GET /auth/me`                         | Tên user hiển thị trong header                   |
| 2   | `consumerApi.getByUserId(userId)`                  | `GET /consumers/user/:userId`          | Địa chỉ giao hàng mặc định                       |
| 3   | `merchantApi.list({ status: 'active', take: 20 })` | `GET /merchants?status=active&take=20` | Danh sách nhà hàng (tên, ảnh?, rating, phí ship) |

#### States

- **Loading:** 6-8 skeleton merchant cards với pulse animation
- **Empty:** "🏪 Chưa có nhà hàng nào trong khu vực của bạn"
- **Error:** "Không thể tải nhà hàng" + nút "Thử lại"
- **No address:** Prompt "Thêm địa chỉ giao hàng"

---

### 3.4 Trang Tìm kiếm (`/search`)

**Responsive:** Search bar full-width top, results grid bên dưới

#### API & Payload

| #   | API                                                | Request                         | Response                      |
| --- | -------------------------------------------------- | ------------------------------- | ----------------------------- |
| 1   | `merchantApi.list({ search, status, skip, take })` | Query string từ input + filters | PaginatedResponse\<Merchant\> |

#### Features

- Debounced search (300ms)
- Filter chips: "🔻 Gần tôi", "⭐ Đánh giá cao", "🚀 Giao nhanh"
- Infinite scroll
- Lịch sử tìm kiếm (localStorage)

---

### 3.5 Trang Chi tiết nhà hàng (`/restaurants/[id]`)

**Responsive:**

- Mobile: single column, sticky bottom bar
- Desktop: ảnh bìa trái + info phải, menu grid 3 cột

#### UI Layout

| Khu vực         | API                           | Response fields dùng                                                                |
| --------------- | ----------------------------- | ----------------------------------------------------------------------------------- |
| **Cover Image** | `merchantApi.getById(id)`     | `coverImage`, `name`                                                                |
| **Info Bar**    | `merchantApi.getById(id)`     | `name`, `rating`, `totalRatings`, `address`, `estimatedDeliveryTime`, `deliveryFee` |
| **Open Status** | `merchantApi.checkIsOpen(id)` | `isOpen: boolean`                                                                   |
| **Menu tabs**   | `merchantApi.getMenu(id)`     | Group by `category` field                                                           |
| **Menu Items**  | `merchantApi.getMenu(id)`     | `id, name, description, price, imageUrl, isAvailable`                               |

#### API Calls

| #   | API                           | Purpose                    |
| --- | ----------------------------- | -------------------------- |
| 1   | `merchantApi.getById(id)`     | Thông tin nhà hàng         |
| 2   | `merchantApi.checkIsOpen(id)` | Trạng thái mở/đóng cửa     |
| 3   | `merchantApi.getMenu(id)`     | Danh sách món (full)       |
| 4   | `merchantApi.getCapacity(id)` | Sức chứa hiện tại (nếu có) |

#### Interactions

- Tap "+" trên menu item → thêm vào giỏ hàng (Zustand)
- Đã thêm → hiện số lượng + nút "+"/"-"
- Sticky bottom bar: tên nhà hàng + nút "Xem giỏ hàng (n món - xxxđ)"

#### States

- **Loading:** Skeleton: ảnh bìa (h-48), info bar, 8 menu item skeletons
- **Error:** "Không tìm thấy nhà hàng" nếu 404
- **Closed:** Banner "🔴 Nhà hàng hiện đang đóng cửa", menu vẫn hiển thị nhưng disabled
- **Empty menu:** "Nhà hàng chưa có món nào"

---

### 3.6 Trang Giỏ hàng (`/cart`)

**Responsive:**

- Mobile: single column list
- Desktop: list items trái + order summary phải (sticky)

#### Data Source

- Zustand store `useCartStore`: `{ items: CartItem[], restaurantId, restaurantName }`
- `CartItem`: `{ menuItemId, name, price, quantity, imageUrl? }`

#### UI

| Khu vực   | Mô tả                                                                          |
| --------- | ------------------------------------------------------------------------------ |
| Header    | ← Back + "Giỏ hàng (n món)"                                                    |
| Item list | Mỗi item: ảnh, tên, giá đơn, nút "-" + số lượng + nút "+", thành tiền, nút xóa |
| Ghi chú   | Textarea "Ghi chú cho nhà hàng..." (lưu vào Zustand)                           |
| Summary   | Tạm tính + Tổng cộng                                                           |
| Nút CTA   | "Đặt hàng - xxxđ" → `/checkout`                                                |

#### States

- **Empty:** "🛒 Giỏ hàng trống" + nút "Khám phá nhà hàng"
- **Different restaurant:** Cảnh báo "Bạn có muốn xóa giỏ hàng hiện tại?"

---

### 3.7 Trang Checkout (`/checkout`)

**Responsive:**

- Mobile: single column form
- Desktop: form trái + order summary phải

#### API Calls

| #   | API                                    | Request Payload                              | Response                                      | Khi nào gọi                    |
| --- | -------------------------------------- | -------------------------------------------- | --------------------------------------------- | ------------------------------ |
| 1   | `consumerApi.getByUserId(userId)`      | -                                            | `ConsumerProfile` (addresses, paymentMethods) | Page load                      |
| 2   | `shippingApi.getFee(params)`           | `{ originLat, originLng, destLat, destLng }` | `ShippingFeeResponse`                         | Page load (sau khi có địa chỉ) |
| 3   | `orderApi.place(body)`                 | `PlaceOrderRequest` (xem dưới)               | `Order`                                       | Khi nhấn "Đặt hàng"            |
| 4   | `paymentApi.createStripePayment(body)` | `CreatePaymentRequest & { currency }`        | `Payment & { clientSecret }`                  | Nếu chọn Stripe                |
| 5   | `paymentApi.create(body)`              | `CreatePaymentRequest`                       | `Payment`                                     | Nếu chọn COD                   |

#### PlaceOrderRequest Payload

```typescript
{
  consumerId: string;          // Từ authApi.me()
  merchantId: string;          // Từ cartStore
  items: {
    menuItemId: string;
    name: string;
    quantity: number;
    priceAtOrder: number;      // Giá tại thời điểm đặt
  }[];
  deliveryAddress: {
    street: string;
    ward: string;
    district: string;
    city: string;
    coordinates?: { lat: number; lng: number };
  };
  paymentMethod: 'COD' | 'STRIPE';
  note?: string;
  shippingFee: number;         // Từ shippingApi.getFee()
  totalAmount: number;         // Tạm tính + shippingFee
}
```

#### UI Layout

| Section            | Nội dung                                                 |
| ------------------ | -------------------------------------------------------- |
| **Địa chỉ giao**   | Dropdown chọn từ saved addresses hoặc "Thêm địa chỉ mới" |
| **Map**            | Hiển thị pin vị trí giao trên bản đồ nhỏ                 |
| **Món đã chọn**    | Summary collapsible: n món - xxxđ                        |
| **Phí ship**       | Bảng breakdown: Khoảng cách, Phí cơ bản, Phụ phí, Tổng   |
| **Phương thức TT** | Radio: 💵 COD (default) / 💳 Thẻ (Stripe)                |
| **Stripe Form**    | `StripeCardForm` component (chỉ hiện nếu chọn Stripe)    |
| **Tổng tiền**      | Tạm tính + Phí ship = Tổng cộng                          |
| **Nút Đặt hàng**   | Full width, loading state khi đang xử lý                 |

#### Flow khi nhấn "Đặt hàng"

```
1. Validate form
2. Nếu Stripe: gọi paymentApi.createStripePayment() → lấy clientSecret
3. Gọi orderApi.place() → tạo đơn hàng
4. Nếu COD: gọi paymentApi.create() → tạo payment
5. Clear cart
6. Redirect → /payment-success?orderId=xxx
```

#### States

- **Loading:** Nút "Đang xử lý..." với spinner
- **Error:** Toast lỗi từ API (vd: "Nhà hàng đã đóng cửa", "Món đã hết hàng", "Thanh toán thất bại")
- **No address:** Prompt thêm địa chỉ
- **Shipping calc error:** "Không thể tính phí ship cho địa chỉ này"

---

### 3.8 Trang Danh sách đơn hàng (`/orders`)

**Responsive:**

- Mobile: vertical card list + tabs
- Desktop: table view + side filter

#### API

| #   | API                                   | Params                         |
| --- | ------------------------------------- | ------------------------------ |
| 1   | `orderApi.listByConsumer(consumerId)` | Lấy từ `authApi.me()` → userId |

#### UI

| Khu vực     | Mô tả                                                                              |
| ----------- | ---------------------------------------------------------------------------------- |
| Tabs        | Tất cả \| Đang xử lý \| Hoàn thành \| Đã hủy                                       |
| Order Cards | Mỗi card: Mã đơn, Nhà hàng, Thời gian, Trạng thái (StatusBadge), Tổng tiền, Số món |

#### States

- **Loading:** 5 skeleton order cards
- **Empty:** "📦 Chưa có đơn hàng nào" + nút "Đặt món ngay"
- **Error:** "Không thể tải đơn hàng" + retry

---

### 3.9 Trang Tracking đơn hàng (`/orders/[id]`)

**Responsive:**

- Mobile: stacked vertically
- Desktop: map trái 60% + info phải 40%

#### API Calls

| #   | API                          | Purpose                                     |
| --- | ---------------------------- | ------------------------------------------- |
| 1   | `orderApi.getById(id)`       | Thông tin đơn hàng + trạng thái             |
| 2   | `dispatchApi.getByOrder(id)` | Thông tin tài xế + vị trí (nếu đã dispatch) |
| 3   | `paymentApi.getByOrder(id)`  | Thông tin thanh toán                        |

#### UI Layout

| Khu vực              | Nội dung                                                                        |
| -------------------- | ------------------------------------------------------------------------------- |
| **Map**              | Vị trí tài xế (real-time) + route đến khách hàng                                |
| **Timeline**         | OrderTimeline: Đã đặt → Đã xác nhận → Đang nấu → Sẵn sàng → Đang giao → Đã giao |
| **Thông tin đơn**    | Nhà hàng, danh sách món (collapsible), tổng tiền, phương thức TT                |
| **Thông tin tài xế** | Ảnh, tên, SĐT (nút 📞 Gọi), biển số, đánh giá ⭐                                |
| **Nút hành động**    | Hủy đơn (nếu PENDING/CONFIRMED) → `orderApi.cancel(id, { reason })`             |
| **Đánh giá**         | Star rating + text (khi DELIVERED)                                              |

#### States

- **No driver yet:** "⏳ Đang tìm tài xế..."
- **Polling:** Auto-refresh mỗi 10s khi order đang active
- **Error:** "Không tìm thấy đơn hàng"

---

### 3.10 Trang Thanh toán thành công (`/payment-success`)

#### UI

| Khu vực | Nội dung                                              |
| ------- | ----------------------------------------------------- |
| Icon    | ✅ Animation checkmark                                |
| Message | "Đặt hàng thành công!"                                |
| Mã đơn  | #ORD-XXX (từ query param orderId)                     |
| Actions | "Xem đơn hàng" → `/orders/[id]`, "Về trang chủ" → `/` |

#### API

- Không cần API mới, dùng `orderId` từ URL query để redirect

---

### 3.11 Trang Tài khoản (`/profile`)

#### API

| #   | API                               | Purpose                                     |
| --- | --------------------------------- | ------------------------------------------- |
| 1   | `authApi.me()`                    | Thông tin user                              |
| 2   | `consumerApi.getByUserId(userId)` | Profile consumer (địa chỉ, payment methods) |

#### UI

| Menu Item     | Route                | Mô tả                  |
| ------------- | -------------------- | ---------------------- |
| Avatar + Tên  | -                    | Hiển thị từ auth       |
| 📍 Địa chỉ    | `/profile/addresses` | CRUD addresses         |
| 💳 Thanh toán | `/profile/payments`  | Quản lý thẻ/card       |
| 💰 Ví         | `/wallet`            | Số dư + lịch sử GD     |
| 🚪 Đăng xuất  | -                    | Clear token → `/login` |

---

### 3.12 Trang Ví (`/wallet`)

#### API

| #   | API                                              | Purpose             |
| --- | ------------------------------------------------ | ------------------- |
| 1   | `walletApi.getBalance(ownerId, 'CONSUMER')`      | Số dư               |
| 2   | `walletApi.getTransactions(ownerId, 'CONSUMER')` | Lịch sử GD          |
| 3   | `walletApi.topupStripe(ownerId, amount)`         | Nạp tiền qua Stripe |

#### UI

| Khu vực      | Mô tả                                |
| ------------ | ------------------------------------ |
| Balance Card | Số dư hiện tại (lớn, nổi bật)        |
| Nạp tiền     | Form số tiền → Stripe Payment Sheet  |
| Lịch sử GD   | List: Ngày, Loại, Số tiền (±), Mô tả |

---

## 4. App 2: Merchant App

**Thư mục:** `mythfood/apps/merchant-app/src/app/`
**Tham khảo design:** `UI/merchant.html`
**Phong cách:** Dashboard chuyên nghiệp, sidebar navigation, bảng dữ liệu

---

### 4.1 Trang Đăng nhập (`/login`)

Tương tự Consumer App, role = `MERCHANT`.

---

### 4.2 Trang Đăng ký (`/register`)

#### API & Payload

| Action       | API                    | Request                                                                  |
| ------------ | ---------------------- | ------------------------------------------------------------------------ |
| Đăng ký user | `authApi.register()`   | `{ phoneNumber, fullName, password, email?, roles: ['MERCHANT_OWNER'] }` |
| Tạo merchant | `merchantApi.create()` | `CreateMerchantRequest`                                                  |

#### CreateMerchantRequest

```typescript
{
  name: string;
  description: string;
  address: {
    street: string;
    ward: string;
    district: string;
    city: string;
    coordinates?: { lat: number; lng: number };
  };
  phone: string;
  cuisineTypes: string[];
  coverImage?: string;
}
```

---

### 4.3 Trang Dashboard (`/`)

**Responsive:** Sidebar trái cố định + Main content phải

- Mobile: Sidebar ẩn, hamburger menu mở drawer

#### API Calls

| #   | API                                     | Purpose                         | Polling |
| --- | --------------------------------------- | ------------------------------- | ------- |
| 1   | `orderApi.listByMerchant(merchantId)`   | Đếm đơn hôm nay, đơn đang xử lý | 30s     |
| 2   | `paymentApi.listByMerchant(merchantId)` | Tính doanh thu hôm nay          | -       |
| 3   | `merchantApi.getMenu(merchantId)`       | Menu preview                    | -       |
| 4   | `merchantApi.getById(merchantId)`       | Thông tin nhà hàng              | -       |

#### UI Layout

| Khu vực            | Nội dung                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| **Sidebar**        | Logo, 📊 Tổng quan, 📦 Đơn hàng, 📋 Menu, 📈 Thống kê, ⚙️ Cài đặt, 💰 Ví. Footer: tên + trạng thái |
| **Top Bar**        | "👋 Xin chào, [Tên nhà hàng]!", hôm nay có n đơn mới, 🔔, [+ Thêm món]                             |
| **Stat Cards (4)** | Đơn hôm nay, Doanh thu, Đánh giá TB, Đơn đang xử lý (cảnh báo nếu quá hạn)                         |
| **Bảng đơn hàng**  | Tabs + Table: Mã đơn, KH, Tổng tiền, Trạng thái, Thao tác                                          |
| **Menu Grid**      | Preview 4 món gần nhất                                                                             |

#### States

- **Loading:** Skeleton stat cards + table rows
- **No orders:** "📦 Chưa có đơn hàng nào hôm nay"
- **Error:** Card-level error với retry

---

### 4.4 Trang Quản lý đơn hàng (`/orders`)

#### API

| #   | API                                   | Purpose       |
| --- | ------------------------------------- | ------------- |
| 1   | `orderApi.listByMerchant(merchantId)` | Tất cả đơn    |
| 2   | `orderApi.confirm(id)`                | Xác nhận đơn  |
| 3   | `orderApi.reject(id, { reason })`     | Từ chối đơn   |
| 4   | `orderApi.preparing(id)`              | Bắt đầu nấu   |
| 5   | `orderApi.ready(id)`                  | Sẵn sàng giao |

#### UI

| Khu vực      | Mô tả                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Tabs         | Tất cả \| Chờ xác nhận (count) \| Đang chuẩn bị \| Sẵn sàng \| Đang giao \| Hoàn thành \| Đã hủy |
| Table        | Mã đơn, KH, Danh sách món (hover), Tổng tiền, Trạng thái badge, Thời gian, Tài xế, Thao tác      |
| Actions      | Contextual buttons theo trạng thái đơn                                                           |
| Detail Modal | Click row → modal/popup chi tiết + timeline                                                      |

---

### 4.5 Trang Quản lý Menu (`/menu`)

#### API

| #   | API                                                    | Purpose       |
| --- | ------------------------------------------------------ | ------------- |
| 1   | `merchantApi.getMenu(merchantId)`                      | Danh sách món |
| 2   | `merchantApi.addMenuItem(merchantId, body)`            | Thêm món mới  |
| 3   | `merchantApi.updateMenuItem(merchantId, itemId, body)` | Sửa món       |
| 4   | `merchantApi.toggleMenuItem(merchantId, itemId)`       | Bật/tắt món   |
| 5   | `merchantApi.deleteMenuItem(merchantId, itemId)`       | Xóa món       |

#### CreateMenuItemRequest

```typescript
{
  name: string;
  description?: string;
  price: number;
  category: string;
  imageUrl?: string;
  isAvailable: boolean;
}
```

#### UI

| Khu vực    | Mô tả                                                       |
| ---------- | ----------------------------------------------------------- |
| Header     | [+ Thêm món mới] button                                     |
| Search     | Filter theo tên                                             |
| Grid       | Card: ảnh, tên, giá, trạng thái 🟢/🔴                       |
| Modal Form | Thêm/Sửa: Tên, Mô tả, Giá, Danh mục, Ảnh, Trạng thái toggle |
| Delete     | Confirm dialog                                              |

#### States

- **Empty:** "Chưa có món nào" + nút thêm
- **Loading:** Grid skeletons

---

### 4.6 Trang Thống kê (`/analytics`)

#### API

| #   | API                                     | Purpose      |
| --- | --------------------------------------- | ------------ |
| 1   | `paymentApi.listByMerchant(merchantId)` | Doanh thu    |
| 2   | `orderApi.listByMerchant(merchantId)`   | Số lượng đơn |

_(Xử lý aggregate ở frontend: nhóm theo ngày, tính tổng)_

#### UI

| Khu vực       | Mô tả                                  |
| ------------- | -------------------------------------- |
| Date range    | Hôm nay / 7 ngày / 30 ngày / Tùy chỉnh |
| Revenue chart | Biểu đồ cột doanh thu theo ngày        |
| Orders chart  | Biểu đồ đường số đơn theo ngày         |
| Top items     | Bảng xếp hạng món bán chạy             |

---

### 4.7 Trang Cài đặt (`/settings`)

#### API

| #   | API                                               | Request                    |
| --- | ------------------------------------------------- | -------------------------- |
| 1   | `merchantApi.setOperatingHours(merchantId, body)` | `SetOperatingHoursRequest` |
| 2   | `merchantApi.getOperatingHours(merchantId)`       | Lấy giờ hiện tại           |
| 3   | `merchantApi.updateCapacity(merchantId, body)`    | `UpdateCapacityRequest`    |
| 4   | `merchantApi.getCapacity(merchantId)`             | Lấy capacity hiện tại      |

#### SetOperatingHoursRequest

```typescript
{
  hours: {
    monday:    { open: string; close: string } | null;
    tuesday:   { open: string; close: string } | null;
    wednesday: { open: string; close: string } | null;
    thursday:  { open: string; close: string } | null;
    friday:    { open: string; close: string } | null;
    saturday:  { open: string; close: string } | null;
    sunday:    { open: string; close: string } | null;
  };
}
```

#### UpdateCapacityRequest

```typescript
{
  maxConcurrentOrders: number;
  averagePreparationMinutes: number;
}
```

---

### 4.8 Trang Ví (`/wallet`)

Tương tự Consumer wallet page.

#### API

| #   | API                                                  | Purpose    |
| --- | ---------------------------------------------------- | ---------- |
| 1   | `walletApi.getBalance(merchantId, 'MERCHANT')`       | Số dư      |
| 2   | `walletApi.getTransactions(merchantId, 'MERCHANT')`  | Lịch sử GD |
| 3   | `walletApi.withdraw(merchantId, 'MERCHANT', amount)` | Rút tiền   |

---

## 5. App 3: Driver App

**Thư mục:** `mythfood/apps/driver-app/src/app/`
**Tham khảo design:** `UI/driver.html`
**Phong cách:** Mobile-first, dark header, map-centered

---

### 5.1 Trang Đăng nhập / Đăng ký (`/login`, `/register`)

Tương tự Consumer App, role = `DRIVER`.

Đăng ký driver:

```typescript
// authApi.register() → lấy userId
// driverApi.register({ userId, name, phone, vehicleType, licensePlate, ... })
```

---

### 5.2 Trang Dashboard (`/`)

#### API Calls

| #   | API                                             | Purpose               | Polling |
| --- | ----------------------------------------------- | --------------------- | ------- |
| 1   | `driverApi.getByUserId(userId)`                 | Thông tin driver      | -       |
| 2   | `walletApi.getBalance(driverId, 'DRIVER')`      | Số dư                 | -       |
| 3   | `walletApi.getTransactions(driverId, 'DRIVER')` | Thu nhập hôm nay/tuần | -       |
| 4   | `dispatchApi.getByDriver(driverId)`             | Đơn đang giao         | 15s     |
| 5   | `dispatchApi.listActive()` hoặc matching        | Đơn khả dụng gần đây  | 15s     |

#### UI Layout

| Khu vực           | Nội dung                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------------- |
| **Header (đen)**  | Logo, 💬 chat, 🔔 thông báo                                                                  |
| **Status Bar**    | Avatar, tên, trạng thái Online/Offline, Toggle button                                        |
| **Earnings Card** | 3 ô: 💰 Hôm nay, 📅 Tuần này, ✅ Đơn hoàn thành                                              |
| **Map**           | Vị trí hiện tại + route đơn đang giao (nếu có)                                               |
| **Đơn gần bạn**   | Order cards: mã đơn, nhà hàng, KH, địa chỉ lấy/giao, 💰, 📏 khoảng cách, [Từ chối] [✅ Nhận] |
| **Đơn đang giao** | Card border cam: thông tin đơn đang active, action buttons                                   |
| **Bottom Nav**    | 🏠 Trang chủ, 📦 Đơn hàng, 🗺️ Bản đồ, 💰 Thu nhập, 👤 Tài khoản                              |

#### Dispatch Flow

```
1. Nhận đơn: dispatchApi.updateStatus(dispatchId, { status: 'DRIVER_ACCEPTED' })
   hoặc driverApi.assignOrder(driverId, orderId)
2. Đã đến: dispatchApi.updateStatus(dispatchId, { status: 'DRIVER_ARRIVED' })
3. Đã lấy hàng: dispatchApi.updateStatus(dispatchId, { status: 'PICKED_UP' })
4. Đang giao: dispatchApi.updateStatus(dispatchId, { status: 'DELIVERING' })
5. Đã giao: dispatchApi.updateStatus(dispatchId, { status: 'DELIVERED' })
```

#### States

- **Loading:** Skeleton cards
- **No orders:** "🎉 Hiện không có đơn hàng nào gần bạn"
- **Offline:** Không hiện đơn khả dụng
- **GPS Error:** "⚠️ Không thể lấy vị trí. Vui lòng bật GPS"

---

### 5.3 Trang Bản đồ (`/map`)

#### API

| #   | API                                                | Purpose                  | Interval |
| --- | -------------------------------------------------- | ------------------------ | -------- |
| 1   | `driverApi.updateLocation(driverId, { lat, lng })` | Gửi vị trí               | 5-10s    |
| 2   | `dispatchApi.listActive()`                         | Đơn khả dụng trên bản đồ | 10s      |
| 3   | `dispatchApi.getByDriver(driverId)`                | Đơn đang giao            | 10s      |

#### UI

| Khu vực         | Mô tả                                                     |
| --------------- | --------------------------------------------------------- |
| Full-screen map | Vị trí tài xế (pin xanh), nhà hàng (pin cam), KH (pin đỏ) |
| Bottom sheet    | Kéo lên: danh sách đơn khả dụng                           |
| Order popup     | Tap pin → info + nút "Nhận đơn"                           |

---

### 5.4 Trang Chi tiết đơn giao (`/delivery/[id]`)

#### API

| #   | API                                                | Purpose             |
| --- | -------------------------------------------------- | ------------------- |
| 1   | `orderApi.getById(id)`                             | Chi tiết đơn        |
| 2   | `dispatchApi.getByOrder(id)`                       | Thông tin dispatch  |
| 3   | `dispatchApi.updateStatus(dispatchId, { status })` | Cập nhật tiến trình |

#### UI

| Khu vực      | Nội dung                                     |
| ------------ | -------------------------------------------- |
| Map          | Route: vị trí tôi → nhà hàng → khách         |
| Timeline     | 1️⃣ Đến nhà hàng → 2️⃣ Lấy hàng → 3️⃣ Giao hàng |
| Nhà hàng     | Tên, địa chỉ, 📞 Gọi, 🗺️ Chỉ đường           |
| Khách hàng   | Tên, địa chỉ, SĐT, 📞 Gọi, 💬 Nhắn tin       |
| Chi tiết đơn | Món, tổng tiền, COD/Stripe, ghi chú          |
| Action       | [Đã đến] → [📦 Đã lấy hàng] → [✅ Đã giao]   |
| Vấn đề       | "⚠️ Báo cáo vấn đề"                          |

---

### 5.5 Trang Thu nhập (`/earnings`)

#### API

| #   | API                                             | Purpose               |
| --- | ----------------------------------------------- | --------------------- |
| 1   | `walletApi.getTransactions(driverId, 'DRIVER')` | Lịch sử giao dịch     |
| 2   | `orderApi.listByDriver(driverId)`               | Danh sách đơn đã giao |

_(Frontend aggregate: nhóm theo ngày/tuần/tháng, tính tổng)_

#### UI

| Khu vực | Mô tả                                       |
| ------- | ------------------------------------------- |
| Header  | Tổng thu nhập (chọn kỳ: Hôm nay/Tuần/Tháng) |
| Chart   | Biểu đồ cột thu nhập theo ngày              |
| Summary | Tổng đơn, TB/đơn, Tip, Thưởng               |
| List    | Lịch sử đơn đã giao                         |

---

### 5.6 Trang Ví (`/wallet`)

#### API

| #   | API                                              | Purpose            |
| --- | ------------------------------------------------ | ------------------ |
| 1   | `walletApi.getBalance(driverId, 'DRIVER')`       | Số dư              |
| 2   | `walletApi.checkCodEligibility(driverId)`        | Điều kiện nhận COD |
| 3   | `walletApi.topupStripe(driverId, amount)`        | Nạp tiền           |
| 4   | `walletApi.withdraw(driverId, 'DRIVER', amount)` | Rút tiền           |
| 5   | `walletApi.getTransactions(driverId, 'DRIVER')`  | Lịch sử GD         |

#### UI

| Khu vực    | Mô tả                                               |
| ---------- | --------------------------------------------------- |
| Balance    | Số dư lớn                                           |
| COD Status | "✅ Đủ điều kiện nhận COD" hoặc "⚠️ Cần 2,000,000đ" |
| Nạp tiền   | Form → Stripe                                       |
| Rút tiền   | Form → xác nhận                                     |
| Lịch sử    | List GD                                             |

---

### 5.7 Trang Tài khoản (`/profile`)

#### API

| #   | API                                       | Purpose          |
| --- | ----------------------------------------- | ---------------- |
| 1   | `driverApi.getByUserId(userId)`           | Thông tin driver |
| 2   | `driverApi.updateProfile(driverId, body)` | Cập nhật         |

---

## 6. App 4: Admin Portal

**Thư mục:** `mythfood/apps/admin-portal/src/app/`
**Tham khảo design:** `UI/admin.html`
**Phong cách:** Full-width dashboard, bảng dữ liệu lớn, biểu đồ

---

### 6.1 Trang Dashboard (`/`)

#### API Calls

| #   | API                  | Purpose                    |
| --- | -------------------- | -------------------------- |
| 1   | `merchantApi.list()` | Đếm tổng nhà hàng          |
| 2   | `orderApi.list()`    | Đếm đơn hôm nay, doanh thu |
| 3   | `driverApi.list()`   | Đếm tổng tài xế            |

_(Cần thêm admin analytics endpoints - xem API Gaps)_

#### UI

| Khu vực        | Nội dung                                                      |
| -------------- | ------------------------------------------------------------- |
| Top Bar        | Logo "MyThFood Admin", 📅 Ngày, 👋 Admin + avatar             |
| Stat Cards (4) | 👥 Users, 🏪 Merchants, 📦 Orders hôm nay, 💰 Revenue hôm nay |
| Revenue Chart  | Biểu đồ cột doanh thu 7 ngày                                  |
| Top Merchants  | Bảng xếp hạng top 5                                           |
| Activity Feed  | Hoạt động gần đây                                             |

---

### 6.2 Các trang quản lý

| Trang             | API                                                                                 | UI                                               |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `/users`          | _(Cần admin users endpoint)_                                                        | Table: ID, Tên, Email, Role, Trạng thái, Actions |
| `/merchants`      | `merchantApi.list()`                                                                | Table + filter + approve/reject                  |
| `/merchants/[id]` | `merchantApi.getById(id)` + `getMenu(id)`                                           | Detail + menu + orders                           |
| `/orders`         | `orderApi.list()`                                                                   | Advanced filter + table                          |
| `/orders/[id]`    | `orderApi.getById(id)` + `paymentApi.getByOrder(id)` + `dispatchApi.getByOrder(id)` | Full detail                                      |
| `/drivers`        | `driverApi.list()`                                                                  | Table + filter                                   |
| `/transactions`   | _(Cần admin transactions endpoint)_                                                 | Table filter                                     |

---

## 7. API Gaps - Endpoints cần bổ sung

Sau khi đối chiếu UI requirements với API hiện có, các endpoint sau cần được bổ sung:

### 7.1 Identity Service (Port 3001)

| #   | Endpoint                 | Method | Purpose                                        | Priority  |
| --- | ------------------------ | ------ | ---------------------------------------------- | --------- |
| 1   | `/auth/users`            | GET    | Admin: danh sách users (paginated, filterable) | 🔴 HIGH   |
| 2   | `/auth/users/:id`        | GET    | Admin: user detail                             | 🔴 HIGH   |
| 3   | `/auth/users/:id/status` | PATCH  | Admin: khóa/mở khóa user                       | 🟡 MEDIUM |
| 4   | `/auth/users/:id/role`   | PATCH  | Admin: đổi role user                           | 🟡 MEDIUM |
| 5   | `/auth/refresh`          | POST   | Refresh token (tránh logout thường xuyên)      | 🟡 MEDIUM |
| 6   | `/auth/change-password`  | POST   | Đổi mật khẩu                                   | 🟢 LOW    |

### 7.2 Consumer Service (Port 3002)

| #   | Endpoint                               | Method | Purpose                    | Priority  |
| --- | -------------------------------------- | ------ | -------------------------- | --------- |
| 1   | `/consumers/:id/addresses/:addressId`  | PUT    | Sửa địa chỉ                | 🟡 MEDIUM |
| 2   | `/consumers/:id/payment-methods/:pmId` | PUT    | Sửa phương thức thanh toán | 🟢 LOW    |

### 7.3 Merchant Service (Port 3003)

| #   | Endpoint                            | Method | Purpose                                           | Priority  |
| --- | ----------------------------------- | ------ | ------------------------------------------------- | --------- |
| 1   | `/merchants/:id/image`              | POST   | Upload ảnh bìa/logo nhà hàng                      | 🔴 HIGH   |
| 2   | `/merchants/:id/menu/:itemId/image` | POST   | Upload ảnh món                                    | 🔴 HIGH   |
| 3   | `/merchants/:id/stats`              | GET    | Thống kê chi tiết (doanh thu theo ngày, đơn hàng) | 🟡 MEDIUM |
| 4   | `/merchants/:id/reviews`            | GET    | Danh sách đánh giá                                | 🟡 MEDIUM |
| 5   | `/merchants/reviews/:id/reply`      | POST   | Phản hồi đánh giá                                 | 🟢 LOW    |

### 7.4 Order Service (Port 3004)

| #   | Endpoint               | Method | Purpose                                         | Priority  |
| --- | ---------------------- | ------ | ----------------------------------------------- | --------- |
| 1   | `/orders/stats/daily`  | GET    | Thống kê đơn hàng theo ngày (admin dashboard)   | 🔴 HIGH   |
| 2   | `/orders/:id/review`   | POST   | Đánh giá đơn hàng (sau khi delivered)           | 🟡 MEDIUM |
| 3   | `/orders/:id/timeline` | GET    | Timeline chi tiết trạng thái đơn (có timestamp) | 🟡 MEDIUM |

### 7.5 Driver Service (Port 3007)

| #   | Endpoint                | Method | Purpose                                | Priority  |
| --- | ----------------------- | ------ | -------------------------------------- | --------- |
| 1   | `/drivers/:id/earnings` | GET    | Thống kê thu nhập (hôm nay/tuần/tháng) | 🔴 HIGH   |
| 2   | `/drivers/stats`        | GET    | Admin: thống kê tổng quan drivers      | 🟡 MEDIUM |

### 7.6 Dispatch Service (Port 3008)

| #   | Endpoint                 | Method | Purpose                                 | Priority  |
| --- | ------------------------ | ------ | --------------------------------------- | --------- |
| 1   | `/dispatch/nearby`       | GET    | Đơn hàng gần tài xế (theo vị trí GPS)   | 🔴 HIGH   |
| 2   | `/dispatch/:id/location` | GET    | Vị trí real-time của dispatch (polling) | 🟡 MEDIUM |

### 7.7 Wallet Service (Port 3009)

| #   | Endpoint                      | Method | Purpose                                         | Priority  |
| --- | ----------------------------- | ------ | ----------------------------------------------- | --------- |
| 1   | `/wallets/transactions/admin` | GET    | Admin: tất cả giao dịch (paginated, filterable) | 🔴 HIGH   |
| 2   | `/wallets/stats`              | GET    | Admin: thống kê ví (tổng balance, volume)       | 🟡 MEDIUM |

### 7.8 Payment Service (Port 3006)

| #   | Endpoint                | Method       | Purpose                                                  | Priority  |
| --- | ----------------------- | ------------ | -------------------------------------------------------- | --------- |
| 1   | `/payments/stats/daily` | GET          | Thống kê thanh toán theo ngày                            | 🟡 MEDIUM |
| 2   | `/payments/:id`         | GET (public) | Lấy payment không cần auth (cho Stripe webhook redirect) | 🟢 LOW    |

### 7.9 Admin Service (Port mới - đề xuất: 3010)

| #   | Endpoint           | Method | Purpose                                            | Priority  |
| --- | ------------------ | ------ | -------------------------------------------------- | --------- |
| 1   | `/admin/dashboard` | GET    | Tổng hợp stats (users, merchants, orders, revenue) | 🔴 HIGH   |
| 2   | `/admin/activity`  | GET    | Activity feed gần đây                              | 🟡 MEDIUM |

### 7.10 File Upload Service

| #   | Endpoint        | Method | Purpose                                    | Priority |
| --- | --------------- | ------ | ------------------------------------------ | -------- |
| 1   | `/upload/image` | POST   | Upload ảnh (avatar, ảnh món, ảnh nhà hàng) | 🔴 HIGH  |
| 2   | `/upload/:key`  | GET    | Lấy ảnh đã upload                          | 🔴 HIGH  |

---

## Tổng kết: Thứ tự ưu tiên triển khai

| Giai đoạn   | Ứng dụng               | Số trang     | Thời gian dự kiến | Phụ thuộc API gaps                                  |
| ----------- | ---------------------- | ------------ | ----------------- | --------------------------------------------------- |
| **Phase 1** | Design System + Shared | -            | 3-4 ngày          | Không                                               |
| **Phase 2** | Consumer App           | 12 trang     | 5-6 ngày          | 7.2.1 (sửa địa chỉ) - MEDIUM                        |
| **Phase 3** | Merchant App           | 8 trang      | 4-5 ngày          | 7.3.1, 7.3.2 (upload ảnh) - HIGH                    |
| **Phase 4** | Driver App             | 7 trang      | 4-5 ngày          | 7.5.1 (earnings) - HIGH, 7.6.1 (nearby) - HIGH      |
| **Phase 5** | Admin Portal           | 8 trang      | 3-4 ngày          | 7.1.1 (users list) - HIGH, 7.9.1 (dashboard) - HIGH |
| **Tổng**    | 4 Apps                 | **35 trang** | **19-24 ngày**    |                                                     |

---

> **Ghi chú:**
>
> - Các API gaps đánh dấu 🔴 HIGH cần được backend team phát triển song song hoặc trước khi UI phase tương ứng bắt đầu.
> - Mọi dữ liệu hiển thị trên UI phải đến từ API thật. KHÔNG hard-code mock data trong production code.
> - UI Mockups (`UI/*.html`) chỉ dùng làm tham khảo visual, không dùng làm template code.
> - File này sẽ được cập nhật khi có thay đổi thiết kế hoặc API mới.
