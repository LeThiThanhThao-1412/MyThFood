# ============================================================================
# MyThFood - Seed dữ liệu nhà hàng đầy đủ
# Tạo: merchant + danh mục + món ăn (kèm nhóm tùy chọn) + mã giảm (đủ loại)
# Chạy từ thư mục gốc:  ./scripts/create-restaurant.ps1
# ============================================================================

$ErrorActionPreference = "Continue"

$identityUrl  = "http://localhost:3001/api/v1"
$merchantUrl  = "http://localhost:3003/api/v1"
$promotionUrl = "http://localhost:3012/api/v1"

# ---- Cấu hình (đổi nếu cần) ----
$merchantPhone = "+84907778899"
$merchantPass  = "Merchant123"
$merchantName  = "Quán Ngon 3 Miền"
$adminPhone    = "+84901112233"
$adminPass     = "Admin123"

# Helper: gọi API và trả về @{ Ok; Status; Data; Message }
function Invoke-Api {
    param(
        [string]$Method,
        [string]$Uri,
        [hashtable]$Headers = @{},
        $Body = $null
    )
    $params = @{
        Uri         = $Uri
        Method      = $Method
        ContentType = "application/json"
        Headers     = $Headers
    }
    if ($null -ne $Body) {
        $params["Body"] = ($Body | ConvertTo-Json -Depth 30)
    }
    try {
        $resp = Invoke-RestMethod @params
        return @{ Ok = $true; Status = 200; Data = $resp }
    } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $msg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
        return @{ Ok = $false; Status = $status; Message = $msg }
    }
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  SEED NHÀ HÀNG ĐẦY ĐỦ (merchant/menu/promo)" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# ============================================================================
# [1] Đăng ký / đăng nhập merchant
# ============================================================================
Write-Host "`n[1] Đăng ký / đăng nhập merchant..." -ForegroundColor Yellow
$regBody = @{
    phoneNumber = $merchantPhone
    fullName    = $merchantName
    password    = $merchantPass
    email       = "quanngon@example.com"
    roles       = @("MERCHANT_OWNER")
}
$null = Invoke-Api "POST" "$identityUrl/auth/register" @{} $regBody

$login = Invoke-Api "POST" "$identityUrl/auth/login" @{} @{ phoneNumber = $merchantPhone; password = $merchantPass }
if (-not $login.Ok) {
    Write-Host "  ✗ Login merchant thất bại: $($login.Message)" -ForegroundColor Red
    exit 1
}
$merchantToken  = $login.Data.data.accessToken
$merchantUserId = $login.Data.data.user.id
$mh = @{ Authorization = "Bearer $merchantToken"; "Content-Type" = "application/json" }
Write-Host "  ✓ Merchant userId = $merchantUserId" -ForegroundColor Green

# ============================================================================
# [2] Tạo merchant profile
# ============================================================================
Write-Host "`n[2] Tạo merchant profile..." -ForegroundColor Yellow
$mBody = @{
    userId               = $merchantUserId
    name                 = $merchantName
    phone                = "02877778899"
    address              = "99 Nguyễn Huệ, Q1, TP.HCM"
    email                = "quanngon@example.com"
    description          = "Quán ăn 3 miền Bắc - Trung - Nam"
    latitude             = 10.776
    longitude            = 106.701
    primaryCategory      = "Vietnamese"
    secondaryCategories  = @("Noodle", "Drink", "Dessert")
}
$mc = Invoke-Api "POST" "$merchantUrl/merchants" $mh $mBody
$merchantId = $null
if ($mc.Ok) {
    $merchantId = $mc.Data.id
    Write-Host "  ✓ Merchant: $($mc.Data.name) ($merchantId)" -ForegroundColor Green
} else {
    Write-Host "  Tạo mới không được, thử tìm merchant có sẵn..." -ForegroundColor Yellow
    $list = Invoke-Api "GET" "$merchantUrl/merchants?take=100" $mh
    if ($list.Ok) {
        $existing = $list.Data.items | Where-Object { $_.userId -eq $merchantUserId } | Select-Object -First 1
        if ($existing) {
            $merchantId = $existing.id
            Write-Host "  ✓ Dùng merchant có sẵn: $($existing.name) ($merchantId)" -ForegroundColor Yellow
        }
    }
}
if (-not $merchantId) {
    Write-Host "  ✗ Không tạo được merchant" -ForegroundColor Red
    exit 1
}

# ============================================================================
# [3] Phê duyệt merchant (bằng admin)
# ============================================================================
Write-Host "`n[3] Phê duyệt merchant (admin)..." -ForegroundColor Yellow
$adminLogin = Invoke-Api "POST" "$identityUrl/auth/login" @{} @{ phoneNumber = $adminPhone; password = $adminPass }
if ($adminLogin.Ok) {
    $adminToken = $adminLogin.Data.data.accessToken
    $ah = @{ Authorization = "Bearer $adminToken"; "Content-Type" = "application/json" }
    $appr = Invoke-Api "PUT" "$merchantUrl/merchants/$merchantId/approve" $ah
    if ($appr.Ok) {
        Write-Host "  ✓ Status: $($appr.Data.status)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ (có thể đã approved) $($appr.Message)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ⚠ Admin login thất bại — bỏ qua bước approve" -ForegroundColor Yellow
}

# ============================================================================
# [4] Tạo danh mục (menu categories)
# ============================================================================
Write-Host "`n[4] Tạo danh mục..." -ForegroundColor Yellow
$categories = @(
    @{ name = "Món chính";   sortOrder = 1 },
    @{ name = "Đồ uống";     sortOrder = 2 },
    @{ name = "Tráng miệng"; sortOrder = 3 }
)
$catMap = @{}
foreach ($c in $categories) {
    $r = Invoke-Api "POST" "$merchantUrl/merchants/$merchantId/menu-categories" $mh @{ name = $c.name; sortOrder = $c.sortOrder }
    if ($r.Ok) {
        $catMap[$c.name] = $r.Data
        Write-Host "  ✓ Danh mục: $($r.Data.name) ($($r.Data.id))" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($c.name): $($r.Message)" -ForegroundColor Red
    }
}

# ============================================================================
# [5] Tạo món ăn (kèm nhóm tùy chọn / danh mục thêm của món)
# ============================================================================
Write-Host "`n[5] Tạo món ăn (kèm nhóm tùy chọn)..." -ForegroundColor Yellow

# Kiểu nhóm tùy chọn: CHOICE | MULTI_CHOICE | TOGGLE | QUANTITY
$menuItems = @(
    @{
        category = "Món chính"
        name     = "Phở Bò Tái"
        price    = 50000
        description = "Phở bò tái tươi ngon, nước dùng hầm 12 giờ"
        preparationTime = 15
        optionGroups = @(
            @{
                name = "Kích cỡ"
                type = "CHOICE"
                required = $true
                options = @(
                    @{ name = "Nhỏ";  priceDelta = 0;     isDefault = $true },
                    @{ name = "Vừa";  priceDelta = 10000 },
                    @{ name = "Lớn";  priceDelta = 20000 }
                )
            },
            @{
                name = "Topping"
                type = "MULTI_CHOICE"
                required = $false
                minSelections = 0
                maxSelections = 3
                options = @(
                    @{ name = "Bò viên";   priceDelta = 15000 },
                    @{ name = "Trứng gà";  priceDelta = 5000 },
                    @{ name = "Hành tây";  priceDelta = 2000 }
                )
            }
        )
    },
    @{
        category = "Món chính"
        name     = "Bún Bò Huế"
        price    = 55000
        description = "Bún bò Huế cay đậm đà"
        preparationTime = 20
        optionGroups = @(
            @{
                name = "Thêm chả"
                type = "QUANTITY"
                required = $false
                options = @(
                    @{ name = "Chả lụa"; priceDelta = 10000; minQuantity = 0; maxQuantity = 3 }
                )
            },
            @{
                name = "Gia vị"
                type = "TOGGLE"
                required = $false
                options = @(
                    @{ name = "Không ớt"; priceDelta = 0 },
                    @{ name = "Ít hành";  priceDelta = 0 }
                )
            }
        )
    },
    @{
        category = "Đồ uống"
        name     = "Trà Đá"
        price    = 5000
        description = "Trà đá mát lạnh"
        preparationTime = 1
    },
    @{
        category = "Đồ uống"
        name     = "Cà Phê Sữa Đá"
        price    = 25000
        description = "Cà phê sữa đá truyền thống"
        preparationTime = 5
        optionGroups = @(
            @{
                name = "Kích cỡ"
                type = "CHOICE"
                required = $true
                options = @(
                    @{ name = "Nhỏ"; priceDelta = 0;    isDefault = $true },
                    @{ name = "Lớn"; priceDelta = 8000 }
                )
            },
            @{
                name = "Thêm"
                type = "MULTI_CHOICE"
                required = $false
                minSelections = 0
                maxSelections = 2
                options = @(
                    @{ name = "Sữa đặc"; priceDelta = 3000 },
                    @{ name = "Đá viên"; priceDelta = 0 }
                )
            }
        )
    },
    @{
        category = "Tráng miệng"
        name     = "Chè Ba Màu"
        price    = 15000
        description = "Chè ba màu ngọt mát"
        preparationTime = 5
        optionGroups = @(
            @{
                name = "Topping"
                type = "TOGGLE"
                required = $false
                options = @(
                    @{ name = "Thêm thạch";    priceDelta = 3000 },
                    @{ name = "Thêm trân châu"; priceDelta = 5000 }
                )
            },
            @{
                name = "Thêm đá"
                type = "QUANTITY"
                required = $false
                options = @(
                    @{ name = "Đá bào"; priceDelta = 0; minQuantity = 0; maxQuantity = 2 }
                )
            }
        )
    }
)

$itemMap = @{}
foreach ($mi in $menuItems) {
    $body = @{
        category        = $mi.category
        name            = $mi.name
        price           = $mi.price
        description     = $mi.description
        preparationTime = $mi.preparationTime
    }
    if ($catMap.ContainsKey($mi.category)) {
        $body.categoryId = $catMap[$mi.category].id
    }
    if ($mi.ContainsKey("optionGroups")) {
        $body.optionGroups = $mi.optionGroups
    }
    $r = Invoke-Api "POST" "$merchantUrl/merchants/$merchantId/menu/items" $mh $body
    if ($r.Ok) {
        $itemMap[$mi.name] = $r.Data
        Write-Host "  ✓ $($r.Data.name) ($($r.Data.id)) - $($r.Data.price) VND" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($mi.name): $($r.Message)" -ForegroundColor Red
    }
}

# ============================================================================
# [6] Tạo mã giảm (đủ loại target x type)
#   target: FOOD | SHIPPING | ITEM
#   type  : PERCENT | FIXED
# ============================================================================
Write-Host "`n[6] Tạo mã giảm (đủ loại)..." -ForegroundColor Yellow

$startIso = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$endIso   = (Get-Date).ToUniversalTime().AddDays(30).ToString("yyyy-MM-ddTHH:mm:ssZ")

# itemName dùng để tham chiếu tới món cụ thể (target = ITEM)
$promos = @(
    @{ code = "GIAM10";   type = "PERCENT"; target = "FOOD";     value = 10;    minOrderValue = 100000; maxDiscount = 30000; usageLimit = 200; usageLimitPerUser = 2 },
    @{ code = "GIAM20K";  type = "FIXED";   target = "FOOD";     value = 20000; minOrderValue = 150000; usageLimit = 100; startAt = $startIso; endAt = $endIso },
    @{ code = "FREESHIP"; type = "PERCENT"; target = "SHIPPING"; value = 100;   maxDiscount = 20000 },
    @{ code = "SHIP10K";  type = "FIXED";   target = "SHIPPING"; value = 10000 },
    @{ code = "PHO10";    type = "PERCENT"; target = "ITEM";     value = 10;    itemName = "Phở Bò Tái"; maxDiscount = 10000 },
    @{ code = "PHO15K";   type = "FIXED";   target = "ITEM";     value = 15000; itemName = "Phở Bò Tái" }
)

$promoCreated = 0
foreach ($p in $promos) {
    $body = @{
        merchantId = $merchantId
        code       = $p.code
        type       = $p.type
        target     = $p.target
        value      = $p.value
    }
    if ($p.target -eq "ITEM") {
        if ($itemMap.ContainsKey($p.itemName)) {
            $body.menuItemId   = $itemMap[$p.itemName].id
            $body.menuItemName = $p.itemName
        } else {
            Write-Host "  ⚠ Bỏ qua $($p.code): chưa có món '$($p.itemName)'" -ForegroundColor Yellow
            continue
        }
    }
    if ($p.ContainsKey("minOrderValue"))     { $body.minOrderValue     = $p.minOrderValue }
    if ($p.ContainsKey("maxDiscount"))       { $body.maxDiscount       = $p.maxDiscount }
    if ($p.ContainsKey("usageLimit"))        { $body.usageLimit        = $p.usageLimit }
    if ($p.ContainsKey("usageLimitPerUser")) { $body.usageLimitPerUser = $p.usageLimitPerUser }
    if ($p.ContainsKey("startAt"))           { $body.startAt           = $p.startAt }
    if ($p.ContainsKey("endAt"))             { $body.endAt             = $p.endAt }

    $r = Invoke-Api "POST" "$promotionUrl/promotions" $mh $body
    if ($r.Ok) {
        $promoCreated++
        $pd = $r.Data.data
        Write-Host "  ✓ $($pd.code)  [$($pd.target)/$($pd.type)]  value=$($pd.value)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $($p.code): $($r.Message)" -ForegroundColor Red
    }
}

# ============================================================================
# Tóm tắt
# ============================================================================
Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "  HOÀN TẤT" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Merchant phone : $merchantPhone"
Write-Host "  Merchant pass  : $merchantPass"
Write-Host "  Merchant ID    : $merchantId"
Write-Host "  User ID        : $merchantUserId"
Write-Host "  Danh mục       : $($catMap.Count)"
Write-Host "  Món ăn         : $($itemMap.Count)"
Write-Host "  Mã giảm        : $promoCreated/$($promos.Count)"
Write-Host ""
Write-Host "  Merchant app : http://localhost:4003/login" -ForegroundColor Gray
Write-Host "  Consumer app : http://localhost:4001" -ForegroundColor Gray
Write-Host ""


