# ============================================================================
# MyThFood - Full Backend API Test Suite  
# Tests ALL API endpoints across all 9 services sequentially
# Saves IDs across steps and writes results to docs/full-api-test-report.md
# ============================================================================
$ErrorActionPreference = "Continue"

$ID_URL    = "http://localhost:3001/api/v1"
$CONS_URL  = "http://localhost:3002/api/v1"
$MERCH_URL = "http://localhost:3003/api/v1"
$ORDER_URL = "http://localhost:3004/api/v1"
$INV_URL   = "http://localhost:3005/api/v1"
$PAY_URL   = "http://localhost:3006/api/v1"
$DRIVER_URL= "http://localhost:3007/api/v1"
$DISP_URL  = "http://localhost:3008/api/v1"
$WALLET_URL= "http://localhost:3009/api/v1"

$PASS=0; $FAIL=0; $SKIP=0
$results=@()

function Run($svc,$method,$endpoint,$desc,$body,$token) {
    $url="$svc$endpoint"
    $h=@{"Content-Type"="application/json"}
    if($token){$h["Authorization"]="Bearer $token"}
    $params=@{Uri=$url;Method=$method;Headers=$h;TimeoutSec=15}
    if($body){$params["Body"]=($body|ConvertTo-Json -Depth 5 -Compress)}
    if ($body) { $params["UseBasicParsing"] = $true }
    try{
        $r=Invoke-WebRequest @params -UseBasicParsing -ErrorAction Stop
        $sc=$r.StatusCode
    }catch{
        $sc=$_.Exception.Response.StatusCode.value__
        if(!$sc){$sc=0}
        $r=$null
    }
    if($sc-ge200-and$sc-lt300){
        $global:PASS++
        $msg="[PASS] $desc (HTTP $sc)"
        Write-Host $msg -Fore Green
        $global:results+=$msg
        if($r){try{return ($r.Content|ConvertFrom-Json)}catch{return $r.Content}}
        return $null
    }elseif($sc-gt0){
        $global:FAIL++
        $msg="[FAIL] $desc (HTTP $sc)"
        Write-Host $msg -Fore Red
        $global:results+=$msg
        return $null
    }else{
        $global:FAIL++
        $msg="[FAIL] $desc - Connection error"
        Write-Host $msg -Fore Red
        $global:results+=$msg
        return $null
    }
}

function Login($p,$pw){
    $b=@{phoneNumber=$p;password=$pw}
    $r=Run $ID_URL "POST" "/auth/login" "Login $p" $b $null
    if($r-and$r.data-and$r.data.accessToken){return $r.data.accessToken}
    return $null
}

Write-Host "`n=================================================" -Fore Cyan
Write-Host "  MYTHFOOD - FULL BACKEND API TEST SUITE" -Fore Cyan
Write-Host "=================================================`n" -Fore Cyan

# ═══════════════════════════ STEP 0: AUTH ═══════════════════════════
Write-Host "=== STEP 0: AUTHENTICATION ===" -Fore Cyan
Run $ID_URL "POST" "/auth/register" "0.1 Register test user" @{phoneNumber="+84901115599";password="Test123456";fullName="Test User API"} $null
$consumerT=Login "+84901234567" "MySecurePass123"
$driverT=Login "+84907654321" "Driver123"
$adminT=Login "+84901112233" "Admin123"
if(!$consumerT){$consumerT=Login "+84901119988" "Test123456"}
if(!$consumerT){Write-Host "[ERROR] No consumer token!" -Fore Red; exit 1}
Write-Host "[INFO] Tokens obtained" -Fore Gray

# ═══════════════════════════ STEP 1: IDENTITY ═══════════════════════
Write-Host "`n=== STEP 1: IDENTITY SERVICE (3001) ===" -Fore Cyan
Run $ID_URL "POST" "/auth/register" "1.1 Register (duplicate)" @{phoneNumber="+84901115599";password="Test123456";fullName="Test User API"} $null
Run $ID_URL "POST" "/auth/login" "1.1 Login consumer 200" @{phoneNumber="+84901234567";password="MySecurePass123"} $null
Run $ID_URL "POST" "/auth/login" "1.1 Login wrong password 401" @{phoneNumber="+84901234567";password="WrongPass"} $null
Run $ID_URL "GET" "/auth/me" "1.2 Get my profile" $null $consumerT
Run $ID_URL "POST" "/auth/refresh" "1.3 Refresh token" @{refreshToken="invalid-token"} $null
Run $ID_URL "GET" "/auth/users?take=5" "1.4 List users (admin)" $null $adminT
Run $ID_URL "GET" "/auth/users?role=CONSUMER&take=5" "1.4 Filter users by role" $null $adminT
Run $ID_URL "GET" "/auth/users?search=nguyen&take=5" "1.4 Search users" $null $adminT
Run $ID_URL "POST" "/auth/change-password" "1.5 Change password (bad)" @{currentPassword="wrong";newPassword="New123456"} $consumerT

# ═══════════════════════════ STEP 2: CONSUMER ═══════════════════════
Write-Host "`n=== STEP 2: CONSUMER SERVICE (3002) ===" -Fore Cyan
$meR=Run $ID_URL "GET" "/auth/me" "2.0 Get user info" $null $consumerT
$uid="";$cid=""
if($meR-and$meR.data){$uid=$meR.data.id}

# 2.1 Create consumer profile
$cp=@{userId=$uid;fullName="Nguyen Van A";dateOfBirth="1990-01-01";gender="MALE"}
$cr=Run $CONS_URL "POST" "/consumers" "2.1 Create consumer profile" $cp $consumerT
if($cr-and$cr.data){$cid=$cr.data.id}
if(!$cid-and$uid){
    $gr=Run $CONS_URL "GET" "/consumers/user/$uid" "2.1 Get existing consumer" $null $consumerT
    if($gr-and$gr.data){$cid=$gr.data.id}
}

# 2.2 CRUD
Run $CONS_URL "GET" "/consumers/$cid" "2.2 Get consumer by id" $null $consumerT
Run $CONS_URL "PUT" "/consumers/$cid" "2.2 Update consumer profile" @{fullName="Nguyen Van A Updated";avatar="https://img.example.com/ava.jpg"} $consumerT

# 2.3 Address management
if($cid){
    $ab=@{label="Home";fullAddress="123 Le Loi, D1, HCMC";city="HCMC";district="District 1";ward="Ben Nghe";street="Le Loi";gps=@{latitude=10.775;longitude=106.7};type="HOME"}
    $ar=Run $CONS_URL "POST" "/consumers/$cid/addresses" "2.3 Add address" $ab $consumerT
    $aid=""
    if($ar-and$ar.data){$aid=$ar.data.addresses[-1].id}
    if($aid){
        Run $CONS_URL "PATCH" "/consumers/$cid/addresses/$aid/default" "2.3 Set default address" $null $consumerT
        Run $CONS_URL "PUT" "/consumers/$cid/addresses/$aid" "2.3 Update address" @{label="Office";fullAddress="456 Pasteur";type="WORK"} $consumerT
        Run $CONS_URL "DELETE" "/consumers/$cid/addresses/$aid" "2.3 Remove address" $null $consumerT
    }
}

# 2.4 Payment method management  
if($cid){
    $pb=@{type="CREDIT_CARD";provider="Visa";token="tok_test_123";lastFourDigits="4242";expiryDate="2027-12-31"}
    $pr=Run $CONS_URL "POST" "/consumers/$cid/payment-methods" "2.4 Add payment method" $pb $consumerT
    $pmid=""
    if($pr-and$pr.data){$pmid=$pr.data.paymentMethods[-1].id}
    if($pmid){
        Run $CONS_URL "PATCH" "/consumers/$cid/payment-methods/$pmid/default" "2.4 Set default PM" $null $consumerT
        Run $CONS_URL "PUT" "/consumers/$cid/payment-methods/$pmid" "2.4 Update PM" @{type="DEBIT_CARD";provider="Mastercard";token="tok_456";lastFourDigits="5555";expiryDate="2028-06-30"} $consumerT
        Run $CONS_URL "DELETE" "/consumers/$cid/payment-methods/$pmid" "2.4 Remove PM" $null $consumerT
    }
}

# ═══════════════════════════ STEP 3: MERCHANT ═══════════════════════
Write-Host "`n=== STEP 3: MERCHANT SERVICE (3003) ===" -Fore Cyan
$mb=@{name="Test Restaurant API";phone="+84909998888";address="456 Nguyen Hue, HCMC";email="test@api.com";description="API test restaurant";latitude=10.775;longitude=106.7}
$mr=Run $MERCH_URL "POST" "/merchants" "3.1 Register merchant" $mb $consumerT
$mid="";$miid="";$mprice=50000
if($mr){$mid=$mr.id}

Run $MERCH_URL "GET" "/merchants?take=10" "3.2 List merchants" $null $consumerT
Run $MERCH_URL "GET" "/merchants?status=APPROVED&take=5" "3.2 List approved" $null $consumerT
Run $MERCH_URL "GET" "/merchants?search=test" "3.2 Search merchants" $null $consumerT

if($mid){
    Run $MERCH_URL "GET" "/merchants/$mid" "3.3 Get by id" $null $consumerT
    Run $MERCH_URL "PUT" "/merchants/$mid" "3.3 Update merchant" @{name="Updated Restaurant";description="Updated desc"} $consumerT
    Run $MERCH_URL "PUT" "/merchants/$mid/approve" "3.4 Approve (admin)" $null $adminT
    Run $MERCH_URL "PUT" "/merchants/$mid/reject" "3.4 Reject (admin)" $null $adminT
    Run $MERCH_URL "PUT" "/merchants/$mid/approve" "3.4 Re-approve (admin)" $null $adminT

    # Menu
    $mib=@{name="Pho Bo Dac Biet";price=65000;category="MAIN_COURSE";description="Pho bo test";preparationTime=15}
    $mir=Run $MERCH_URL "POST" "/merchants/$mid/menu/items" "3.5 Add menu item" $mib $consumerT
    if($mir){$miid=$mir.id;$mprice=$mir.price}
    Run $MERCH_URL "GET" "/merchants/$mid/menu" "3.5 List menu" $null $consumerT
    if($miid){
        Run $MERCH_URL "GET" "/merchants/$mid/menu/$miid" "3.5 Get menu item" $null $consumerT
        Run $MERCH_URL "PUT" "/merchants/$mid/menu/$miid" "3.5 Update menu item" @{name="Pho Bo Updated";price=70000} $consumerT
        Run $MERCH_URL "PATCH" "/merchants/$mid/menu/$miid/available" "3.5 Toggle available" $null $consumerT
        Run $MERCH_URL "DELETE" "/merchants/$mid/menu/$miid" "3.5 Delete menu item" $null $consumerT
    }

    # Operating hours
    $ohb=@{hours=@(@{dayOfWeek=1;openTime="07:00";closeTime="22:00";isClosed=$false},@{dayOfWeek=2;openTime="07:00";closeTime="22:00";isClosed=$false})}
    Run $MERCH_URL "PUT" "/merchants/$mid/operating-hours" "3.6 Set operating hours" $ohb $consumerT
    Run $MERCH_URL "GET" "/merchants/$mid/operating-hours" "3.6 Get operating hours" $null $consumerT
    Run $MERCH_URL "GET" "/merchants/$mid/is-open" "3.6 Check is-open" $null $consumerT

    # Capacity
    Run $MERCH_URL "PUT" "/merchants/$mid/capacity" "3.7 Update capacity" @{maxConcurrentOrders=10} $consumerT
    Run $MERCH_URL "GET" "/merchants/$mid/capacity" "3.7 Get capacity" $null $consumerT
    Run $MERCH_URL "GET" "/merchants/$mid/capacity/status" "3.7 Capacity status" $null $consumerT

    # Stats & Reviews
    Run $MERCH_URL "GET" "/merchants/$mid/stats?period=today" "3.8 Get stats" $null $consumerT
    Run $MERCH_URL "GET" "/merchants/$mid/reviews?take=5" "3.8 Get reviews" $null $consumerT
}

# Re-add deleted menu item for order flow
if($mid){
    $mib=@{name="Pho Bo Order";price=65000;category="MAIN_COURSE";description="For order test";preparationTime=15}
    $mir=Run $MERCH_URL "POST" "/merchants/$mid/menu/items" "3.9 Add menu item for order" $mib $consumerT
    if($mir){$miid=$mir.id;$mprice=$mir.price}
}

# ═══════════════════════════ STEP 4: INVENTORY ═══════════════════════
Write-Host "`n=== STEP 4: INVENTORY SERVICE (3005) ===" -Fore Cyan
$invid=""
if($mid-and$miid){
    $iv=Run $INV_URL "POST" "/inventory" "4.1 Create inventory" @{merchantId=$mid;menuItemId=$miid;totalQuantity=100} $consumerT
    if($iv){$invid=$iv.id}
}
Run $INV_URL "GET" "/inventory" "4.2 List all inventory" $null $consumerT
if($mid){
    Run $INV_URL "GET" "/inventory/merchant/$mid" "4.3 Get by merchant" $null $consumerT
}
if($miid){
    Run $INV_URL "GET" "/inventory/menuitem/$miid" "4.4 Get by menu item" $null $consumerT
}
if($invid){
    Run $INV_URL "GET" "/inventory/$invid" "4.5 Get by id" $null $consumerT
    Run $INV_URL "PUT" "/inventory/$invid/total" "4.6 Update total" @{totalQuantity=150} $consumerT
    Run $INV_URL "POST" "/inventory/$invid/reserve" "4.7 Reserve stock" @{quantity=2;orderId="test-r-1"} $consumerT
    Run $INV_URL "POST" "/inventory/$invid/release" "4.7 Release stock" @{quantity=2;orderId="test-r-1"} $consumerT
    Run $INV_URL "POST" "/inventory/$invid/consume" "4.7 Consume stock" @{quantity=2;orderId="test-c-1"} $consumerT
}

# ═══════════════════════════ STEP 5: ORDER ═══════════════════════════
Write-Host "`n=== STEP 5: ORDER SERVICE (3004) ===" -Fore Cyan
# Fallback: get existing merchant if new one failed
if(!$mid){
    $ml=Run $MERCH_URL "GET" "/merchants?status=APPROVED&take=1" "5.0 Fallback merchant" $null $consumerT
    if($ml-and$ml.items-and$ml.items.Count-gt0){
        $mid=$ml.items[0].id
        $mn=Run $MERCH_URL "GET" "/merchants/$mid/menu" "5.0 Get menu" $null $consumerT
        if($mn-and$mn.Count-gt0){$miid=$mn[0].id;$mprice=$mn[0].price}
    }
}

$oid=""
if($mid-and$miid-and$cid){
    if(!$mprice){$mprice=50000}
    $ob=@{
        consumerId=$cid;merchantId=$mid;orderType="DELIVERY"
        items=@(@{menuItemId=$miid;name="Test Item";quantity=2;unitPrice=$mprice;specialInstructions="No spicy"})
        deliveryAddress="123 Le Loi, District 1, HCMC"
        deliveryFee=15000;serviceFee=5000;discount=0
    }
    $or=Run $ORDER_URL "POST" "/orders" "5.1 Place order" $ob $consumerT
    if($or){$oid=$or.id}
}

Run $ORDER_URL "GET" "/orders?take=10" "5.2 List orders" $null $consumerT
if($cid){Run $ORDER_URL "GET" "/orders/consumer/$cid" "5.3 Consumer orders" $null $consumerT}
if($mid){Run $ORDER_URL "GET" "/orders/merchant/$mid" "5.3 Merchant orders" $null $consumerT}
Run $ORDER_URL "GET" "/shipping/fee?originLat=10.775&originLng=106.7&destLat=10.776&destLng=106.701" "5.4 Shipping fee" $null $consumerT

if($oid){
    Run $ORDER_URL "GET" "/orders/$oid" "5.5 Get order by id" $null $consumerT
    Run $ORDER_URL "PATCH" "/orders/$oid/confirm" "5.6 Confirm order" $null $consumerT
    Run $ORDER_URL "PATCH" "/orders/$oid/preparing" "5.6 Start preparing" $null $consumerT
    Run $ORDER_URL "PATCH" "/orders/$oid/ready" "5.6 Mark ready" $null $consumerT
    Run $ORDER_URL "GET" "/orders/$oid/timeline" "5.7 Timeline" $null $consumerT
    Run $ORDER_URL "POST" "/orders/$oid/review" "5.7 Add review" @{rating=5;comment="Great food!";tags=@("fast","delicious")} $consumerT
}
Run $ORDER_URL "GET" "/orders/stats/daily" "5.8 Daily stats" $null $consumerT

# ═══════════════════════════ STEP 6: PAYMENT ═══════════════════════
Write-Host "`n=== STEP 6: PAYMENT SERVICE (3006) ===" -Fore Cyan
$payId=""
if($oid-and$cid-and$mid){
    $amt=$mprice*2+15000+5000
    $pyr=Run $PAY_URL "POST" "/payments" "6.1 Create payment (COD)" @{orderId=$oid;consumerId=$cid;merchantId=$mid;amount=$amt;paymentMethod="CASH"} $consumerT
    if($pyr){$payId=$pyr.id}
}
Run $PAY_URL "GET" "/payments?take=10" "6.2 List payments" $null $consumerT
if($cid){Run $PAY_URL "GET" "/payments/consumer/$cid" "6.2 Consumer payments" $null $consumerT}
if($mid){Run $PAY_URL "GET" "/payments/merchant/$mid" "6.2 Merchant payments" $null $consumerT}
if($oid){Run $PAY_URL "GET" "/payments/order/$oid" "6.2 Payment by order" $null $consumerT}
if($payId){
    Run $PAY_URL "GET" "/payments/$payId" "6.3 Get payment by id" $null $consumerT
    Run $PAY_URL "PATCH" "/payments/$payId/complete" "6.4 Complete payment" @{transactionId="TXN-TEST-001"} $consumerT
    Run $PAY_URL "GET" "/payments/$payId" "6.4 Verify completed" $null $consumerT
}
if($cid){Run $PAY_URL "GET" "/payments/wallet/$cid" "6.5 Get wallet via payment" $null $consumerT}
Run $PAY_URL "GET" "/payments/stats/daily" "6.6 Daily stats" $null $consumerT

# ═══════════════════════════ STEP 7: DRIVER ═══════════════════════
Write-Host "`n=== STEP 7: DRIVER SERVICE (3007) ===" -Fore Cyan
$did=""
$drr=Run $DRIVER_URL "POST" "/drivers" "7.1 Register driver" @{fullName="Test Driver API";phone="+84905559999";email="drive@api.com";vehicleType="MOTO";licensePlate="59-API-9999"} $adminT
if($drr-and$drr.data){$did=$drr.data.id}
if(!$did){
    $al=Run $DRIVER_URL "GET" "/drivers/available/list" "7.1 Get available drivers" $null $driverT
    if($al-and$al.data-and$al.data.Count-gt0){$did=$al.data[0].id}
}
if(!$did){
    $du=Run $DRIVER_URL "GET" "/drivers/user/+84907654321" "7.1 Get driver by userId" $null $driverT
    if($du-and$du.data){$did=$du.data.id}
}

Run $DRIVER_URL "GET" "/drivers?status=ACTIVE" "7.2 List active drivers" $null $adminT
Run $DRIVER_URL "GET" "/drivers?onlineStatus=ONLINE" "7.2 List online drivers" $null $adminT
Run $DRIVER_URL "GET" "/drivers/available/list" "7.2 Available drivers" $null $driverT

if($did){
    Run $DRIVER_URL "GET" "/drivers/$did" "7.3 Get driver by id" $null $driverT
    Run $DRIVER_URL "PUT" "/drivers/$did" "7.4 Update profile" @{fullName="Updated Driver";email="up@driver.com"} $adminT
    Run $DRIVER_URL "PATCH" "/drivers/$did/complete-training" "7.5 Complete training" $null $adminT
    Run $DRIVER_URL "PATCH" "/drivers/$did/activate" "7.5 Activate driver" $null $adminT
    Run $DRIVER_URL "PATCH" "/drivers/$did/deactivate" "7.5 Deactivate driver" $null $adminT
    Run $DRIVER_URL "PATCH" "/drivers/$did/activate" "7.5 Re-activate driver" $null $adminT
    Run $DRIVER_URL "PATCH" "/drivers/$did/go-online" "7.6 Go online" $null $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/location" "7.6 Update location" @{latitude=10.776;longitude=106.702} $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/go-offline" "7.6 Go offline" $null $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/go-home" "7.6 Go home" $null $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/start-shift" "7.7 Start shift" $null $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/end-shift" "7.7 End shift" $null $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/take-break" "7.8 Take break" $null $driverT
    Run $DRIVER_URL "PATCH" "/drivers/$did/force-break" "7.8 Force break" $null $adminT
    Run $DRIVER_URL "GET" "/drivers/$did/earnings?period=today" "7.9 Earnings" $null $adminT
}
Run $DRIVER_URL "GET" "/drivers/stats" "7.10 Driver stats (admin)" $null $adminT

# ═══════════════════════════ STEP 8: DISPATCH ═══════════════════════
Write-Host "`n=== STEP 8: DISPATCH SERVICE (3008) ===" -Fore Cyan
$dispatchId=""
if($oid-and$mid){
    $db=@{orderId=$oid;merchantId=$mid;deliveryAddress="123 Le Loi, D1, HCMC";deliveryLatitude=10.775;deliveryLongitude=106.7}
    $dr=Run $DISP_URL "POST" "/dispatches" "8.1 Create dispatch" $db $consumerT
    if($dr-and$dr.data){$dispatchId=$dr.data.id}
}

Run $DISP_URL "GET" "/dispatches?take=10" "8.2 List dispatches" $null $adminT
Run $DISP_URL "GET" "/dispatches/active" "8.2 Active dispatches" $null $adminT
Run $DISP_URL "GET" "/dispatches/matching" "8.2 Matching dispatches" $null $adminT
Run $DISP_URL "GET" "/dispatches/nearby?latitude=10.775&longitude=106.7&radiusKm=5" "8.3 Nearby dispatches" $null $driverT

if($dispatchId){
    Run $DISP_URL "GET" "/dispatches/$dispatchId" "8.4 Get by id" $null $adminT
    Run $DISP_URL "GET" "/dispatches/$dispatchId/location" "8.4 Get location" $null $adminT
    if($did){
        Run $DISP_URL "PATCH" "/dispatches/$dispatchId/assign-driver" "8.5 Assign driver" @{driverId=$did} $adminT
        Run $DISP_URL "PATCH" "/dispatches/$dispatchId/driver-accept" "8.5 Driver accept" $null $driverT
        Run $DISP_URL "PATCH" "/dispatches/$dispatchId/driver-arrived" "8.6 Driver arrived" $null $driverT
        Run $DISP_URL "PATCH" "/dispatches/$dispatchId/picked-up" "8.6 Picked up" $null $driverT
        Run $DISP_URL "PATCH" "/dispatches/$dispatchId/start-delivering" "8.6 Delivering" $null $driverT
        Run $DISP_URL "PATCH" "/dispatches/$dispatchId/delivered" "8.6 Delivered" $null $driverT
    }
    Run $DISP_URL "PATCH" "/dispatches/$dispatchId/expire" "8.7 Expire dispatch" $null $adminT
    if($oid){Run $DISP_URL "GET" "/dispatches/order/$oid" "8.7 Dispatch by order" $null $adminT}
}
if($did){Run $DISP_URL "GET" "/dispatches/driver/$did" "8.8 Dispatches by driver" $null $adminT}
if($mid){Run $DISP_URL "GET" "/dispatches/merchant/$mid" "8.8 Dispatches by merchant" $null $adminT}

# ═══════════════════════════ STEP 9: WALLET ═══════════════════════
Write-Host "`n=== STEP 9: WALLET SERVICE (3009) ===" -Fore Cyan
$wt=$adminT
Run $WALLET_URL "POST" "/wallets" "9.1 Create consumer wallet" @{ownerId=$cid;ownerType="CONSUMER"} $wt
if($did){Run $WALLET_URL "POST" "/wallets" "9.1 Create driver wallet" @{ownerId=$did;ownerType="DRIVER"} $wt}
if($mid){Run $WALLET_URL "POST" "/wallets" "9.1 Create merchant wallet" @{ownerId=$mid;ownerType="MERCHANT"} $wt}
if($did){Run $WALLET_URL "GET" "/wallets?ownerId=$did&ownerType=DRIVER" "9.2 Get driver wallet" $null $wt}
if($did){Run $WALLET_URL "GET" "/wallets/balance?ownerId=$did&ownerType=DRIVER" "9.3 Driver balance" $null $wt}
if($did){Run $WALLET_URL "GET" "/wallets/check-cod-eligibility/$did" "9.4 COD eligibility" $null $wt}
if($did){Run $WALLET_URL "POST" "/wallets/topup" "9.5 Top-up 500k" @{ownerId=$did;ownerType="DRIVER";amount=500000} $wt}
if($did){Run $WALLET_URL "POST" "/wallets/withdraw" "9.6 Withdraw 50k" @{ownerId=$did;ownerType="DRIVER";amount=50000} $wt}
if($did-and$oid){Run $WALLET_URL "POST" "/wallets/settle/regular" "9.7 Regular settlement" @{driverId=$did;orderId=$oid;shippingFee=15000} $wt}
if($mid-and$did-and$oid){Run $WALLET_URL "POST" "/wallets/settle/cod" "9.8 COD settlement" @{merchantId=$mid;driverId=$did;orderId=$oid;foodTotal=100000;shippingFee=15000} $wt}
if($did){Run $WALLET_URL "GET" "/wallets/$did/transactions?ownerType=DRIVER" "9.9 Driver transactions" $null $wt}
Run $WALLET_URL "GET" "/wallets/transactions/admin?take=10" "9.10 Admin transactions" $null $adminT
Run $WALLET_URL "GET" "/wallets/stats" "9.10 Wallet stats" $null $adminT

# ═══════════════════════════ SUMMARY ═══════════════════════
$TOTAL=$PASS+$FAIL+$SKIP
Write-Host "`n=================================================" -Fore Cyan
Write-Host "  TEST SUMMARY" -Fore Cyan
Write-Host "=================================================" -Fore Cyan
Write-Host "PASS: $PASS" -Fore Green
Write-Host "FAIL: $FAIL" -Fore Red
Write-Host "SKIP: $SKIP" -Fore Yellow
Write-Host "TOTAL: $TOTAL" -Fore White
if($TOTAL-gt0){Write-Host "PASS RATE: $([math]::Round($PASS/$TOTAL*100,1))%" -Fore $(if($PASS/$TOTAL-ge0.8){'Green'}else{'Yellow'})}

$ts=Get-Date -Format "yyyy-MM-dd_HHmmss"
$results|Out-File -FilePath "d:\MyThFood\docs\API_FULL_TEST_$ts.txt" -Encoding UTF8
Write-Host "`nLog: docs/API_FULL_TEST_$ts.txt" -Fore Gray