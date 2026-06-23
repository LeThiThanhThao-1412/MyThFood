$ErrorActionPreference = "Stop"

# Base URLs
$identityUrl = "http://localhost:3001/api/v1"
$consumerUrl = "http://localhost:3002/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$orderUrl = "http://localhost:3004/api/v1"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MyThFood API Integration Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Step 1: Register user
Write-Host "`n[1] Registering user..." -ForegroundColor Yellow
$phoneNumber = "+84901234567"
try {
    $registerBody = @{
        phoneNumber = $phoneNumber
        fullName = "Nguyen Van A"
        password = "MySecurePass123"
        email = "nguyenvana@example.com"
        roles = @("CONSUMER", "MERCHANT_OWNER")
    } | ConvertTo-Json
    $registerResp = Invoke-RestMethod -Uri "$identityUrl/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
    Write-Host "  Registered: $($registerResp.data.user.fullName) (ID: $($registerResp.data.user.id))" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  User already exists, proceeding..." -ForegroundColor Yellow
    } else {
        Write-Host "  Register error: $($_.Exception.Message)" -ForegroundColor Red
        $_.Exception.Response | Out-String | Write-Host -ForegroundColor Red
    }
}

# Step 2: Login
Write-Host "`n[2] Logging in..." -ForegroundColor Yellow
$loginBody = @{
    phoneNumber = $phoneNumber
    password = "MySecurePass123"
} | ConvertTo-Json
$loginResp = Invoke-RestMethod -Uri "$identityUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
$token = $loginResp.data.accessToken
$userId = $loginResp.data.user.id
Write-Host "  Token received (first 30 chars): $($token.Substring(0,30))..." -ForegroundColor Green
Write-Host "  User ID: $userId" -ForegroundColor Green

$authHeader = @{ Authorization = "Bearer $token" }

# Step 3: Test Identity - GET /me
Write-Host "`n[3] Getting user profile (Identity Service)..." -ForegroundColor Yellow
$meResp = Invoke-RestMethod -Uri "$identityUrl/auth/me" -Method Get -Headers $authHeader
Write-Host "  Profile: $($meResp.data.fullName) | Roles: $($meResp.data.roles -join ', ')" -ForegroundColor Green

# Step 4: Create Consumer profile
Write-Host "`n[4] Creating consumer profile..." -ForegroundColor Yellow
$consumerBody = @{
    userId = $userId
    fullName = "Nguyen Van A"
    dateOfBirth = "1990-01-15"
    gender = "MALE"
} | ConvertTo-Json
try {
    $consumerResp = Invoke-RestMethod -Uri "$consumerUrl/consumers" -Method Post -Body $consumerBody -Headers $authHeader -ContentType "application/json"
    $consumerId = $consumerResp.data.id
    Write-Host "  Consumer created: ID=$consumerId" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "  Consumer already exists, fetching..." -ForegroundColor Yellow
        $consumersResp = Invoke-RestMethod -Uri "$consumerUrl/consumers/user/$userId" -Method Get -Headers $authHeader
        $consumerId = $consumersResp.data.id
        Write-Host "  Consumer ID: $consumerId" -ForegroundColor Green
    } else {
        Write-Host "  Consumer error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Step 5: Register Merchant
Write-Host "`n[5] Registering merchant..." -ForegroundColor Yellow
$merchantBody = @{
    userId = $userId
    name = "Pho 24"
    phone = "02838231234"
    address = "123 Le Loi, District 1, HCMC"
    email = "pho24@example.com"
    description = "Authentic Vietnamese Pho"
    latitude = 10.775
    longitude = 106.700
} | ConvertTo-Json
try {
    $merchantResp = Invoke-RestMethod -Uri "$merchantUrl/merchants" -Method Post -Body $merchantBody -Headers $authHeader -ContentType "application/json"
    $merchantId = $merchantResp.id
    Write-Host "  Merchant created: $($merchantResp.name) (ID: $merchantId, Status: $($merchantResp.status))" -ForegroundColor Green
} catch {
    Write-Host "  Merchant error: $($_.Exception.Message)" -ForegroundColor Red
    $_.Exception.Response | Out-String | Write-Host -ForegroundColor Red
}

# Step 6: Approve Merchant
Write-Host "`n[6] Approving merchant..." -ForegroundColor Yellow
try {
    $approveResp = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/approve" -Method Put -Headers $authHeader
    Write-Host "  Merchant approved: Status=$($approveResp.status)" -ForegroundColor Green
} catch {
    Write-Host "  Approve error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 7: Add Menu Item
Write-Host "`n[7] Adding menu item..." -ForegroundColor Yellow
$menuBody = @{
    category = "FOOD"
    name = "Pho Bo Tai"
    description = "Rare beef pho"
    price = 50000
    isFeatured = $true
    preparationTime = 15
} | ConvertTo-Json
try {
    $menuResp = Invoke-RestMethod -Uri "$merchantUrl/merchants/$merchantId/menu/items" -Method Post -Body $menuBody -Headers $authHeader -ContentType "application/json"
    $menuItemId = $menuResp.id
    Write-Host "  Menu item added: $($menuResp.name) (ID: $menuItemId, Price: $($menuResp.price))" -ForegroundColor Green
} catch {
    Write-Host "  Menu error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 8: Place Order (Order Service)
Write-Host "`n[8] PLACING ORDER (Order Service)..." -ForegroundColor Yellow
$orderBody = @{
    consumerId = $consumerId
    merchantId = $merchantId
    orderType = "DELIVERY"
    items = @(
        @{
            menuItemId = $menuItemId
            name = "Pho Bo Tai"
            quantity = 2
            unitPrice = 50000
            specialInstructions = "Khong hanh"
        }
    )
    deliveryAddress = "456 Nguyen Hue, District 1, HCMC"
    deliveryLatitude = 10.777
    deliveryLongitude = 106.702
    deliveryFee = 15000
    serviceFee = 5000
    discount = 0
    notes = "Giao gio hanh chinh"
} | ConvertTo-Json -Depth 10
try {
    $orderResp = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $authHeader -ContentType "application/json"
    $orderId = $orderResp.id
    Write-Host "  ORDER PLACED!" -ForegroundColor Green
    Write-Host "  Order ID: $orderId" -ForegroundColor Green
    Write-Host "  Status: $($orderResp.status)" -ForegroundColor Green
    Write-Host "  Total: $($orderResp.totalAmount) VND" -ForegroundColor Green
    Write-Host "  Items: $($orderResp.items.Count)" -ForegroundColor Green
} catch {
    Write-Host "  Order error: $($_.Exception.Message)" -ForegroundColor Red
    $_.Exception.Response | Out-String | Write-Host -ForegroundColor Red
}

# Step 9: Confirm Order
Write-Host "`n[9] CONFIRMING order (PENDING -> CONFIRMED)..." -ForegroundColor Yellow
try {
    $confirmResp = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/confirm" -Method Patch -Headers $authHeader
    Write-Host "  Status: $($confirmResp.status)" -ForegroundColor Green
} catch {
    Write-Host "  Confirm error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 10: Start Preparing
Write-Host "`n[10] PREPARING order (CONFIRMED -> PREPARING)..." -ForegroundColor Yellow
try {
    $preparingResp = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/preparing" -Method Patch -Headers $authHeader
    Write-Host "  Status: $($preparingResp.status)" -ForegroundColor Green
} catch {
    Write-Host "  Preparing error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 11: Ready for Pickup
Write-Host "`n[11] READY FOR PICKUP (PREPARING -> READY_FOR_PICKUP)..." -ForegroundColor Yellow
try {
    $readyResp = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/ready" -Method Patch -Headers $authHeader
    Write-Host "  Status: $($readyResp.status)" -ForegroundColor Green
} catch {
    Write-Host "  Ready error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 12: Out for Delivery
Write-Host "`n[12] OUT FOR DELIVERY (READY_FOR_PICKUP -> OUT_FOR_DELIVERY)..." -ForegroundColor Yellow
$driverId = "550e8400-e29b-41d4-a716-446655440099"
$deliveryBody = @{ driverId = $driverId } | ConvertTo-Json
try {
    $outResp = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/out-for-delivery" -Method Patch -Body $deliveryBody -Headers $authHeader -ContentType "application/json"
    Write-Host "  Status: $($outResp.status)" -ForegroundColor Green
    Write-Host "  Driver: $($outResp.driverId)" -ForegroundColor Green
} catch {
    Write-Host "  Delivery error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 13: Delivered
Write-Host "`n[13] DELIVERED (OUT_FOR_DELIVERY -> DELIVERED)..." -ForegroundColor Yellow
try {
    $deliveredResp = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/delivered" -Method Patch -Headers $authHeader
    Write-Host "  Status: $($deliveredResp.status)" -ForegroundColor Green
} catch {
    Write-Host "  Delivered error: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 14: Get final order details
Write-Host "`n[14] GETTING final order details..." -ForegroundColor Yellow
try {
    $finalResp = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId" -Method Get -Headers $authHeader
    Write-Host "  Order ID: $($finalResp.id)" -ForegroundColor Green
    Write-Host "  Consumer: $($finalResp.consumerId)" -ForegroundColor Green
    Write-Host "  Merchant: $($finalResp.merchantId)" -ForegroundColor Green
    Write-Host "  Status: $($finalResp.status)" -ForegroundColor Green
    Write-Host "  Items: $($finalResp.items.Count)" -ForegroundColor Green
    Write-Host "  Total: $($finalResp.totalAmount) VND ($($finalResp.subtotal) + $($finalResp.deliveryFee) + $($finalResp.serviceFee) - $($finalResp.discount))" -ForegroundColor Green
    Write-Host "  Created: $($finalResp.createdAt)" -ForegroundColor Green
    Write-Host "  Updated: $($finalResp.updatedAt)" -ForegroundColor Green
} catch {
    Write-Host "  Get error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  API TESTING COMPLETE!" -ForegroundColor Green
Write-Host "  Order flow: PENDING -> CONFIRMED -> PREPARING -> READY_FOR_PICKUP -> OUT_FOR_DELIVERY -> DELIVERED" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan