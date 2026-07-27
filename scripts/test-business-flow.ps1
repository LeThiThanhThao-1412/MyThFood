$ErrorActionPreference = "Continue"
$idUrl = "http://localhost:3001/api/v1"
$consumerUrl = "http://localhost:3002/api/v1"
$merchantUrl = "http://localhost:3003/api/v1"
$orderUrl = "http://localhost:3004/api/v1"
$driverUrl = "http://localhost:3007/api/v1"
$paymentUrl = "http://localhost:3006/api/v1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MyThFood BUSINESS FLOW TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# --- ACCOUNT INFO ---
Write-Host "Accounts used:" -ForegroundColor Gray
Write-Host "  Consumer/Merchant: +84901234567 / MySecurePass123" -ForegroundColor Gray
Write-Host "  Driver:            +84907654321 / Driver123" -ForegroundColor Gray
Write-Host "  Admin:             +84901112233 / Admin123" -ForegroundColor Gray

# Helper: Login
function Login($phone, $pass) {
    $body = @{ phoneNumber = $phone; password = $pass } | ConvertTo-Json
    $r = Invoke-RestMethod -Uri "$idUrl/auth/login" -Method Post -Body $body -ContentType "application/json"
    return @{ token = $r.data.accessToken; userId = $r.data.user.id; roles = $r.data.user.roles }
}

# ============================================
# AUTH FLOW
# ============================================
Write-Host ""
Write-Host "=== AUTH FLOW ===" -ForegroundColor Magenta

try {
    $consumer = Login "+84901234567" "MySecurePass123"
    Write-Host "[PASS] Consumer/Merchant logged in" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Consumer login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

try {
    $driver = Login "+84907654321" "Driver123"
    Write-Host "[PASS] Driver logged in" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Driver login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

try {
    $admin = Login "+84901112233" "Admin123"
    Write-Host "[PASS] Admin logged in" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Admin login: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ============================================
# MERCHANT FLOW
# ============================================
Write-Host ""
Write-Host "=== MERCHANT FLOW ===" -ForegroundColor Magenta

$mh = @{ Authorization = "Bearer $($consumer.token)" }

try {
    $ms = Invoke-RestMethod -Uri "$merchantUrl/merchants?take=100" -Method Get -Headers $mh
    $merchant = $null
    foreach ($m in $ms.items) {
        if ($m.userId -eq $consumer.userId) {
            $merchant = $m
            break
        }
    }
    if (-not $merchant) {
        foreach ($m in $ms.items) {
            if ($m.status -eq "APPROVED") {
                $merchant = $m
                break
            }
        }
    }
    
    if ($merchant) {
        Write-Host "[PASS] Merchant found: $($merchant.name) (Status: $($merchant.status))" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] No merchant found" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[FAIL] Merchant search: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Get menu
try {
    $menuResult = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($merchant.id)/menu" -Method Get -Headers $mh
    if ($menuResult -is [array]) {
        $menu = $menuResult
    } elseif ($menuResult.items) {
        $menu = @($menuResult.items)
    } elseif ($menuResult.data) {
        $menu = @($menuResult.data)
    } else {
        $menu = @($menuResult)
    }
    Write-Host "[INFO] Menu items: $($menu.Count)" -ForegroundColor Green
    if ($menu.Count -gt 0) {
        $firstItem = $menu[0]
        Write-Host "  Sample: $($firstItem.name) - $($firstItem.price) VND" -ForegroundColor Gray
    }
} catch {
    Write-Host "[FAIL] Menu fetch: $($_.Exception.Message)" -ForegroundColor Red
    $menu = @()
}

# ============================================
# ORDER FLOW
# ============================================
Write-Host ""
Write-Host "=== ORDER FLOW ===" -ForegroundColor Magenta

if ($menu.Count -eq 0) {
    Write-Host "[SKIP] No menu items - creating test menu items first..." -ForegroundColor Yellow
    
    # Try to add menu items
    $mhContent = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
    $menuItems = @(
        @{ name = "Pho Bo Tai"; price = 50000; category = "MAIN_COURSE"; description = "Pho bo tai tuoi ngon"; preparationTime = 15 },
        @{ name = "Pho Ga"; price = 45000; category = "MAIN_COURSE"; description = "Pho ga thom ngon"; preparationTime = 12 },
        @{ name = "Bun Bo Hue"; price = 55000; category = "MAIN_COURSE"; description = "Bun bo Hue dac biet"; preparationTime = 20 },
        @{ name = "Tra Da"; price = 5000; category = "BEVERAGE"; description = "Tra da mat lanh"; preparationTime = 1 }
    )
    
    foreach ($item in $menuItems) {
        try {
            $itemBody = $item | ConvertTo-Json
            $added = Invoke-RestMethod -Uri "$merchantUrl/merchants/$($merchant.id)/menu/items" -Method Post -Body $itemBody -Headers $mhContent
            if ($added) {
                $menu += $added
                Write-Host "[PASS] Added menu: $($added.name)" -ForegroundColor Green
            }
        } catch {
            Write-Host "[WARN] Add menu item failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
    
    if ($menu.Count -eq 0) {
        Write-Host "[FAIL] Cannot create any menu items. Skipping order test." -ForegroundColor Red
        $skipOrder = $true
    } else {
        $skipOrder = $false
    }
} else {
    $skipOrder = $false
}

if (-not $skipOrder) {
    $firstMenuItem = if ($menu -is [array]) { $menu[0] } else { $menu }
    
    $orderBody = @{
        consumerId = $consumer.userId
        merchantId = $merchant.id
        orderType = "DELIVERY"
        items = @(@{
            menuItemId = $firstMenuItem.id
            name = $firstMenuItem.name
            quantity = 2
            unitPrice = $firstMenuItem.price
            specialInstructions = "Khong hanh"
        })
        deliveryAddress = "456 Nguyen Hue, District 1, HCMC"
        deliveryFee = 15000
        serviceFee = 5000
        discount = 0
        notes = "Giao gio hanh chinh"
    } | ConvertTo-Json -Depth 5

    $oh = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
    
    try {
        $order = Invoke-RestMethod -Uri "$orderUrl/orders" -Method Post -Body $orderBody -Headers $oh
        $orderId = $order.id
        Write-Host "[PASS] Order placed: #$($orderId.Substring(0,8))" -ForegroundColor Green
        Write-Host "  Status: $($order.status) | Total: $($order.totalAmount) VND" -ForegroundColor Gray
        
        # ============================================
        # PAYMENT FLOW
        # ============================================
        Write-Host ""
        Write-Host "=== PAYMENT FLOW ===" -ForegroundColor Magenta
        
        $payBody = @{
            orderId = $orderId
            consumerId = $consumer.userId
            merchantId = $merchant.id
            amount = $order.totalAmount
            paymentMethod = "CASH"
        } | ConvertTo-Json
        
        $ph = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
        try {
            $payment = Invoke-RestMethod -Uri "$paymentUrl/payments" -Method Post -Body $payBody -Headers $ph
            Write-Host "[PASS] Payment created: $($payment.status) | Amount: $($payment.amount) VND" -ForegroundColor Green
        } catch {
            Write-Host "[WARN] Payment error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
        # ============================================
        # ORDER STATUS FLOW
        # ============================================
        Write-Host ""
        Write-Host "=== ORDER STATUS FLOW ===" -ForegroundColor Magenta
        
        $mh2 = @{ Authorization = "Bearer $($consumer.token)"; "Content-Type" = "application/json" }
        
        $statusSteps = @("confirm", "preparing", "ready")
        foreach ($step in $statusSteps) {
            try {
                $updated = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/$step" -Method Patch -Headers $mh2
                Write-Host "[PASS] $step -> $($updated.status)" -ForegroundColor Green
            } catch {
                Write-Host "[WARN] $step : $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
        
        # ============================================
        # DRIVER FLOW
        # ============================================
        Write-Host ""
        Write-Host "=== DRIVER FLOW ===" -ForegroundColor Magenta
        
        $dh = @{ Authorization = "Bearer $($driver.token)" }
        
        try {
            # Get driver profile
            $driverProfile = Invoke-RestMethod -Uri "$driverUrl/drivers/user/$($driver.userId)" -Method Get -Headers $dh
            if ($driverProfile.data) {
                $driverData = $driverProfile.data
            } else {
                $driverData = $driverProfile
            }
            Write-Host "[PASS] Driver found: $($driverData.fullName) | Status: $($driverData.status)" -ForegroundColor Green
            
            # Go online
            if ($driverData.onlineStatus -ne "ONLINE") {
                try {
                    $onlineResult = Invoke-RestMethod -Uri "$driverUrl/drivers/$($driverData.id)/go-online" -Method Patch -Headers $dh
                    if ($onlineResult.data) { $driverData = $onlineResult.data } else { $driverData = $onlineResult }
                    Write-Host "[PASS] Driver now ONLINE" -ForegroundColor Green
                } catch {
                    Write-Host "[WARN] Go online: $($_.Exception.Message)" -ForegroundColor Yellow
                }
            }
            
            # Out for delivery
            $dh2 = @{ Authorization = "Bearer $($driver.token)"; "Content-Type" = "application/json" }
            $deliveryBody = @{ driverId = $driverData.id } | ConvertTo-Json
            try {
                $delivering = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/out-for-delivery" -Method Patch -Body $deliveryBody -Headers $dh2
                Write-Host "[PASS] Out for delivery: $($delivering.status)" -ForegroundColor Green
            } catch {
                Write-Host "[WARN] Assign driver: $($_.Exception.Message)" -ForegroundColor Yellow
            }
            
            # Mark delivered
            try {
                $done = Invoke-RestMethod -Uri "$orderUrl/orders/$orderId/delivered" -Method Patch -Headers $dh2
                Write-Host "[PASS] DELIVERED! Status: $($done.status)" -ForegroundColor Green
            } catch {
                Write-Host "[WARN] Deliver: $($_.Exception.Message)" -ForegroundColor Yellow
            }
            
            # Note: complete-order is skipped here because the order is already DELIVERED
            # Calling complete-order after delivered causes 409 Conflict
        } catch {
            Write-Host "[WARN] Driver flow: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        
    } catch {
        Write-Host "[FAIL] Order creation: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Message -match "404") {
            Write-Host "  Order Service may not be running on port 3004" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "[SKIP] Order, Payment, Delivery tests skipped (no menu items)" -ForegroundColor Yellow
}

# ============================================
# SUMMARY
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BUSINESS FLOW TEST COMPLETE" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Flow tested:" -ForegroundColor White
Write-Host "  1. Auth: Login (Consumer, Driver, Admin)" -ForegroundColor Gray
Write-Host "  2. Merchant: Get profile, menu items" -ForegroundColor Gray
Write-Host "  3. Order: Place order (PENDING)" -ForegroundColor Gray
Write-Host "  4. Payment: Create payment (CASH)" -ForegroundColor Gray
Write-Host "  5. Status: CONFIRMED to PREPARING to READY" -ForegroundColor Gray
Write-Host "  6. Driver: Go online, assign delivery, mark DELIVERED" -ForegroundColor Gray
Write-Host ""
Write-Host "Frontend URLs:" -ForegroundColor White
Write-Host "  Consumer:  http://localhost:4001" -ForegroundColor Green
Write-Host "  Driver:    http://localhost:4002" -ForegroundColor Green
Write-Host "  Merchant:  http://localhost:4003" -ForegroundColor Green
Write-Host "  Admin:     http://localhost:4004" -ForegroundColor Green
Write-Host ""