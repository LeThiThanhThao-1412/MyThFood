# Test Cases: Resolution Service (Khiếu nại · Gian lận · Xử phạt)

> **Service:** Resolution Service (Port 3014)
> **Source:** `apps/resolution-service/src/modules/{case,penalty,fraud}/**` + `docs/RESOLUTION_SERVICE_DESIGN.md`
> **Base Path:** `/api/v1`
> **Auth:** JWT Bearer (roles: CONSUMER / DRIVER / MERCHANT_OWNER / ADMIN) hoặc `x-service-key`
> **Case tình huống:** 34 (C1–C17 + H1–H17)

---

## Domain Rules (từ aggregate + thiết kế)

- **Case state machine:** `OPEN → UNDER_REVIEW ⇄ WAITING_EVIDENCE → RESOLVED / REJECTED / WITHDRAWN / ESCALATED → CLOSED`
- **Penalty state machine:** `ISSUED → EXECUTING → EXECUTED`; `APPEALED → UPHELD / OVERTURNED`; `WAIVED`
- **Appeal:** tối đa **1 lần/penalty** (`UNIQUE(penaltyId)`), deadline **48h**, chỉ `respondent`
- **Severity tự gợi ý:** FOOD_SAFETY/COLLUSION→CRITICAL, COD_THEFT/ORDER_FARMING/FAKE_DELIVERY→HIGH, REFUND_ABUSE/CHARGEBACK_FRAUD/MULTI_ACCOUNT/FAKE_REVIEW→MEDIUM, còn lại→LOW; **leo thang** theo số lần tái phạm 30 ngày
- **Settlement Hold:** tạo case có `orderId` → hold (`HELD_BY_DISPUTE`); `INVALID`/`WITHDRAWN` → release
- **Compensation:** debit bên lỗi + credit bên hại; `OVERTURNED` → đảo ngược (credit target + debit reporter)
- **Ma trận phạt:** FINE (min 50.000đ), FAKE_DELIVERY=200%, COD_THEFT=100% (>2tr → cơ quan chức năng), ORDER_FARMING=500.000đ + khóa 14 ngày
- **Fraud engine:** respondent ≥3 case/30 ngày → tự tạo `FRAUD_REPORT` (SYSTEM)
- **SLA:** case tồn đọng >72h → tự `ESCALATED` (cron mỗi giờ)

> ✅ Domain rules đã có 23 unit test (case.aggregate + penalty.aggregate) PASS.
> 🔲 Các case tích hợp API bên dưới chờ chạy e2e (cần endpoint wallet/driver/merchant/notification).

---

## Phần A. Khiếu nại — Khách hàng (Consumer)

### RS-C1 — Khách khiếu nại nhà hàng: thiếu món (MISSING_ITEM)
**Actor:** CONSUMER → MERCHANT · **Preconditions:** đơn `DELIVERED`, khách có ảnh bằng chứng

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — type=COMPLAINT, category=MISSING_ITEM, orderId, respondentId=merchant, respondentType=MERCHANT | 201, `status=OPEN`, severity tự gợi ý **LOW**, `caseNumber=CASE-YYYY-xxxxxx` |
| 2 | Hệ thống (best-effort) | Gọi wallet hold settlement của `orderId` → `HELD_BY_DISPUTE` |
| 3 | `POST /cases/:id/review` (ADMIN) | `status=UNDER_REVIEW` |
| 4 | `POST /cases/:id/resolve` — verdict=VALID | `status=RESOLVED`, verdict=VALID, resolvedBy=admin |
| 5 | `POST /penalties` — type=COMPENSATION, amount=giá món thiếu | penalty `EXECUTED`; debit MERCHANT + credit CONSUMER |

### RS-C2 — Khách báo ngộ độc thực phẩm (FOOD_SAFETY)
**Actor:** CONSUMER → MERCHANT · **Preconditions:** 1 ca đơn lẻ, có hóa đơn y tế

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=FOOD_SAFETY, severity để trống | 201, severity tự gợi ý **CRITICAL** |
| 2 | Ca đơn lẻ | **KHÔNG tự khóa** nhà hàng; case `OPEN`/`UNDER_REVIEW` + chờ admin (SLA 15–30 phút) |
| 3 | Nếu ≥3 đơn khác nhau cùng báo FOOD_SAFETY trong 6h | Tự `SUSPEND` nhà hàng (nghi ngộ độc hàng loạt) |
| 4 | `POST /cases/:id/resolve` — verdict=VALID | `RESOLVED`; `POST /penalties` COMPENSATION (bị HOLD 48h) + SUSPEND 30 ngày |
| 5 | verdict=INVALID | `REJECTED`; khôi phục nhà hàng + notify xin lỗi |

### RS-C3 — Khách khiếu nại tài xế giao trễ + thái độ (DELIVERY_LATE + DRIVER_BEHAVIOR)
**Actor:** CONSUMER → DRIVER · **Preconditions:** giao trễ 45 phút, có bằng chứng

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — respondentType=DRIVER | 201, severity LOW (lần đầu) |
| 2 | `POST /cases/:id/resolve` — verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=REPUTATION_DEDUCTION, amount=10 | `EXECUTED`; driver-service `DEDUCT_REPUTATION` −10 |
| 4 | Tái phạm lần 2 trong 30 ngày | severity HIGH; `FINE` + tạm chặn nhận đơn 24h |

---

## Phần B. Khiếu nại — Nhà hàng (Merchant)

### RS-C4 — Nhà hàng khiếu nại tài xế hủy đơn sau khi đã nhận (UNAUTHORIZED_CANCEL)
**Actor:** MERCHANT → DRIVER · **Preconditions:** tài xế nhận đơn rồi hủy, nhà hàng đã chế biến

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — respondentType=DRIVER, category=UNAUTHORIZED_CANCEL | 201, severity theo số lần hủy (leo thang) |
| 2 | `POST /cases/:id/resolve` — verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=REPUTATION_DEDUCTION + FINE | `EXECUTED`; trừ điểm + phạt theo ma trận hủy đơn (5.7) |
| 4 | Tái phạm lần 4+ | `BAN` vĩnh viễn |

### RS-C5 — Nhà hàng khiếu nại khách "bom hàng" (không nhận đơn)
**Actor:** MERCHANT → CONSUMER · **Preconditions:** đơn `CANCELLED` sau khi `PREPARING`

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — respondentType=CONSUMER | 201 |
| 2 | `POST /cases/:id/resolve` — verdict=VALID | `RESOLVED` |
| 3 | Lần 1 | `WARNING` (cảnh cáo) |
| 4 | Tái phạm | `RESTRICT_ACTIVITY` — khóa đặt hàng 7 ngày |

---

## Phần C. Khiếu nại — Tài xế (Driver)

### RS-C6 — Tài xế khiếu nại nhà hàng chế biến chậm (MERCHANT_BEHAVIOR)
**Actor:** DRIVER → MERCHANT · **Preconditions:** chờ >20 phút vượt `prepTimePerOrder`

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — respondentType=MERCHANT | 201 |
| 2 | `POST /cases/:id/resolve` — verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=COMPENSATION, amount=20% phí ship | `EXECUTED`; bồi thường phí chờ cho tài xế, trừ doanh thu nhà hàng |
| 4 | Không vượt ngưỡng 20 phút | verdict=INVALID → `REJECTED` |

### RS-C7 — Tài xế khiếu nại nhà hàng giao sai hàng / đóng gói lỗi (DAMAGED_ITEM)
**Actor:** DRIVER → MERCHANT

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=DAMAGED_ITEM | 201 |
| 2 | verdict=VALID | `COMPENSATION` cho tài xế (nếu phải giao lại) + `WARNING` chất lượng nhà hàng |

---

## Phần D. Gian lận — Tài xế (Driver)

### RS-C8 — Tài xế giả giao hàng (FAKE_DELIVERY)
**Actor:** SYSTEM/ADMIN → DRIVER · **Preconditions:** tài xế bấm `DELIVERED` nhưng khách báo không nhận, GPS lệch xa

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — type=FRAUD_REPORT, category=FAKE_DELIVERY | 201, severity **HIGH** |
| 2 | `POST /cases/:id/resolve` — verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=FINE, amount=200% giá trị đơn | `EXECUTED`; debit ví tài xế (thiếu → `penalty_clawbacks`) |
| 4 | `POST /penalties` — type=SUSPEND, durationDays=7 | `EXECUTED`; driver-service khóa 7 ngày |
| 5 | Tái phạm lần 2 | `BAN` vĩnh viễn |

### RS-C9 — Tài xế chiếm dụng tiền COD (COD_THEFT)
**Actor:** ADMIN → DRIVER · **Preconditions:** đơn COD đã giao, tài xế chưa nộp tiền về ví

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=COD_THEFT | 201, severity **HIGH** |
| 2 | verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=FINE, amount=100% số COD | `EXECUTED`; debit đúng số tiền COD + khóa 30 ngày thu hồi nợ |
| 4 | Số COD > 2.000.000đ | Chuyển hồ sơ cơ quan chức năng (ghi chú vụ việc) |

### RS-C10 — Tài xế giả mạo GPS (GPS_SPOOFING)
**Actor:** ADMIN → DRIVER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=GPS_SPOOFING | 201 |
| 2 | Lần đầu | `WARNING` |
| 3 | Tái phạm | `SUSPEND` + `FINE` |

---

## Phần E. Gian lận — Nhà hàng (Merchant)

### RS-C11 — Nhà hàng tạo đơn ảo (ORDER_FARMING)
**Actor:** ADMIN → MERCHANT · **Preconditions:** chuỗi đơn cùng device/IP

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=ORDER_FARMING | 201, severity **HIGH** |
| 2 | verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=FINE, amount=500.000đ | `EXECUTED`; đóng băng settlement + tịch thu doanh thu đơn ảo |
| 4 | `POST /penalties` — type=SUSPEND, durationDays=14 | `EXECUTED`; merchant-service đóng cửa 14 ngày |

### RS-C12 — Nhà hàng thao túng đánh giá (FAKE_REVIEW)
**Actor:** ADMIN → MERCHANT

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=FAKE_REVIEW | 201, severity **MEDIUM** |
| 2 | verdict=VALID | `RESOLVED`; xóa đánh giá giả (review-service) |
| 3 | `POST /penalties` — type=SUSPEND | `EXECUTED` + giảm rating |

---

## Phần F. Gian lận — Khách hàng (Consumer)

### RS-C13 — Khách lạm dụng hoàn tiền (REFUND_ABUSE)
**Actor:** ADMIN → CONSUMER · **Preconditions:** tỷ lệ refund/đơn vượt ngưỡng (≥N lần/tháng)

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=REFUND_ABUSE | 201, severity **MEDIUM** |
| 2 | verdict=VALID | `RESOLVED`; hủy hoàn tiền đang treo |
| 3 | `POST /penalties` — type=RESTRICT_ACTIVITY | `EXECUTED`; khóa đặt hàng + `FINE` |
| 4 | Tái phạm | `BAN` |

### RS-C14 — Khách lạm dụng khuyến mãi (PROMO_ABUSE + MULTI_ACCOUNT)
**Actor:** ADMIN → CONSUMER · **Preconditions:** nhiều tài khoản dùng chung mã KM

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=PROMO_ABUSE | 201, severity **MEDIUM** |
| 2 | verdict=VALID | `RESOLVED`; cấm khuyến mãi + thu hồi ưu đãi đã dùng |
| 3 | `POST /penalties` — type=FINE | `EXECUTED` |

---

## Phần G. Thông đồng & leo thang

### RS-C15 — Thông đồng nhà hàng + tài xế (COLLUSION)
**Actor:** ADMIN → MERCHANT + DRIVER · **Preconditions:** chuỗi đơn giả rút hoa hồng 70/20/10

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — category=COLLUSION | 201, severity **CRITICAL** |
| 2 | verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=BAN (2 penalty: merchant + driver) | `EXECUTED` cả hai bên + thu hồi hoa hồng |

### RS-C16 — Kháng nghị thành công (APPEALED → OVERTURNED)
**Actor:** DRIVER → ADMIN · **Preconditions:** tài xế bị phạt DELIVERY_LATE nhưng có bằng chứng kẹt xe

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /penalties` — type=FINE (tài xế bị phạt) | `EXECUTED` |
| 2 | `POST /penalties/:id/appeal` (trong 48h) | penalty `APPEALED`; tạo `appeals` (UNIQUE penaltyId) |
| 3 | `POST /penalties/:id/appeal` lần 2 | 400 "already been appealed" |
| 4 | `POST /penalties/:id/appeal/decide` — upheld=false | `OVERTURNED`; hoàn FINE (credit lại ví) |
| 5 | Nếu penalty là COMPENSATION | Đảo ngược: credit target + debit reporter |

### RS-C17 — Leo thang (ESCALATED)
**Actor:** ADMIN → SYSTEM · **Preconditions:** case `INCONCLUSIVE` quá 72h hoặc CRITICAL

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Case tồn đọng >72h | Cron tự `ESCALATED` + alert |
| 2 | `POST /cases/:id/escalate` (ADMIN thủ công) | `ESCALATED` |
| 3 | `POST /cases/:id/close` (nếu đã RESOLVED/REJECTED/WITHDRAWN) | `CLOSED` |

---

## Phần H. Hủy đơn, Bom hàng & các case mở rộng

### RS-H1 — Tài xế tự ý hủy đơn nhiều lần (Driver Cancel Abuse)
**Actor:** SYSTEM → DRIVER · **Preconditions:** lần hủy thứ 3 trong 30 ngày (system logs)

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Fraud engine nhận event hủy đơn → đếm bộ đếm 30 ngày = 2 | Tự tạo case vi phạm vận hành → tự `RESOLVED` |
| 2 | `POST /penalties` — type=FINE, amount=100.000đ | `EXECUTED` (ví 0đ → `penalty_clawbacks`) |
| 3 | `POST /penalties` — type=SUSPEND, durationDays=7 | `EXECUTED`; driver-service khóa 7 ngày |

### RS-H2 — Nhà hàng tự ý từ chối/hủy đơn liên tục (Merchant Reject Abuse)
**Actor:** SYSTEM → MERCHANT · **Preconditions:** tỷ lệ hủy >15% tổng đơn/ngày

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Fraud engine kích hoạt khi tỷ lệ hủy >15% | Tự tạo case; tách doanh thu đơn liên quan |
| 2 | verdict=VALID | `RESOLVED` |
| 3 | `POST /penalties` — type=FINE, amount=150.000đ | `EXECUTED` |
| 4 | `POST /penalties` — type=SUSPEND, durationDays=7 | `EXECUTED`; merchant-service đóng cửa 7 ngày |

### RS-H3 — Khách bom hàng đặt COD (Consumer Bom hàng)
**Actor:** DRIVER → CONSUMER · **Preconditions:** lần 2 bom hàng, có ảnh/GPS khớp điểm giao

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases` — respondentType=CONSUMER (tài xế tạo, kèm ảnh/GPS) | 201; xác thực tài xế đúng quy trình |
| 2 | verdict=VALID | `RESOLVED` |
| 3 | Dòng tiền | Nhà hàng vẫn được quyết toán; tài xế nhận đủ phí ship |
| 4 | `POST /penalties` — type=RESTRICT_ACTIVITY (khóa COD 14 ngày) | `EXECUTED`; identity/payment khóa COD |

### RS-H4 — Khách hủy đơn trễ (sau khi tài xế nhận)
**Actor:** MERCHANT/DRIVER → CONSUMER · **Preconditions:** hủy khi đã `PREPARING` + tài xế nhận

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | verdict=VALID | `RESOLVED` |
| 2 | Lần 1 | `WARNING`; khách chịu phí hủy |
| 3 | Tái phạm | Theo ma trận bom hàng (5.7) |

### RS-H5 — Tài xế giao quá trễ khiến đồ hỏng (DELIVERY_LATE nghiêm trọng)
**Actor:** CONSUMER → DRIVER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Xác định mốc trễ thuộc ai (timeline order) | Quy đúng trách nhiệm |
| 2 | verdict=VALID | `COMPENSATION` 100% giá trị đơn cho khách |
| 3 | Tài xế lỗi | Trừ điểm + `FINE` theo tái phạm |

### RS-H6 — Nhà hàng giao nhầm đơn (2 đơn tráo nhau)
**Actor:** CONSUMER → MERCHANT

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | 2 khách cùng khiếu nại | 2 case cùng lúc |
| 2 | verdict=VALID | `COMPENSATION` 100% cho cả 2, trừ doanh thu nhà hàng |

### RS-H7 — Tài xế giao nhầm địa chỉ
**Actor:** CONSUMER → DRIVER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | verdict=VALID | `COMPENSATION` 100% + giao lại miễn phí |
| 2 | Tái phạm | `FINE` + trừ điểm |

### RS-H8 — Khiếu nại gian dối (false accusation)
**Actor:** ADMIN → CONSUMER (phản tố) · **Preconditions:** khách giả mạo bằng chứng

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Case gốc | verdict=INVALID → `REJECTED` (nhà hàng minh oan) |
| 2 | Mở case ngược phạt khách gian dối | `WARNING` → `FINE`; tái phạm → khóa COD/đặt hàng |

### RS-H9 — Tranh chấp quy trách nhiệm: tài xế làm rơi đồ, khách tố nhà hàng
**Actor:** CONSUMER → MERCHANT (quy đúng → DRIVER)

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Điều tra bằng chứng camera/giao nhận | Quy trách nhiệm đúng cho tài xế |
| 2 | verdict=VALID | `COMPENSATION` cho khách trừ từ **tài xế**; nhà hàng minh oan |

### RS-H10 — Tài xế bỏ rơi đơn (nhận rồi offline, đơn kẹt)
**Actor:** SYSTEM → DRIVER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Timeout đơn kẹt | Tự `RESOLVED` (VALID) |
| 2 | Phạt tài xế + dispatch tìm tài xế thay | `FINE` + `COMPENSATION` khách nếu trễ quá SLA |

### RS-H11 — Lạm dụng hủy đơn để giữ mã khuyến mãi (promo churn)
**Actor:** ADMIN → CONSUMER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | verdict=VALID | `RESOLVED`; cấm khuyến mãi + thu hồi ưu đãi |
| 2 | `POST /penalties` — type=FINE | `EXECUTED` |

### RS-H12 — Thông đồng tài xế + khách giả hoàn tiền (collusion refund)
**Actor:** ADMIN → DRIVER + CONSUMER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Phát hiện tần suất cao + GPS khớp nhưng vẫn báo mất | Tạo case FRAUD_REPORT |
| 2 | verdict=VALID | `BAN` cả hai + thu hồi khoản refund |

### RS-H13 — Nhà hàng né đơn bằng cách đóng cửa giả (toggle is_open)
**Actor:** ADMIN → MERCHANT

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | verdict=VALID | `WARNING` → `FINE`; tái phạm → tụt hạng hiển thị |

### RS-H14 — Nhà hàng tự đánh giá 5 sao (fake review nhiều tài khoản)
**Actor:** ADMIN → MERCHANT

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | verdict=VALID | `RESOLVED`; xóa đánh giá + `REPUTATION_DEDUCTION` + `SUSPEND` |

### RS-H15 — Tài xế chạy song song nhiều app (multi-apping)
**Actor:** ADMIN → DRIVER

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Phát hiện trễ bất thường + GPS lệch lộ trình | `WARNING` → `FINE` → `SUSPEND` |

### RS-H16 — Settlement Hold: khách rút khiếu nại giữa chừng
**Actor:** CONSUMER (rút)

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | `POST /cases/:id/withdraw` (reporter) | `WITHDRAWN` |
| 2 | Hệ thống | Tự `releaseSettlement` (HELD → PENDING), quyết toán kỳ sau |

### RS-H17 — Settlement Hold quá hạn SLA điều tra
**Actor:** SYSTEM

| Bước | Hành động / Input | Kết quả mong đợi |
|---|---|---|
| 1 | Đơn `HELD_BY_DISPUTE` >72h | Auto-`ESCALATED` + alert |
| 2 | >15 ngày chưa phán quyết | GC Force-Release (trả tiền nhà hàng/tài xế, rủi ro → nợ nội bộ) |

---

## Tổng kết

| Nhóm | Case tình huống | Test case (bước) |
|---|---|---|
| A. Khiếu nại — Khách hàng | RS-C1 → RS-C3 | 3 |
| B. Khiếu nại — Nhà hàng | RS-C4 → RS-C5 | 2 |
| C. Khiếu nại — Tài xế | RS-C6 → RS-C7 | 2 |
| D. Gian lận — Tài xế | RS-C8 → RS-C10 | 3 |
| E. Gian lận — Nhà hàng | RS-C11 → RS-C12 | 2 |
| F. Gian lận — Khách hàng | RS-C13 → RS-C14 | 2 |
| G. Thông đồng & leo thang | RS-C15 → RS-C17 | 3 |
| H. Hủy đơn, Bom hàng & mở rộng | RS-H1 → RS-H17 | 17 |
| **Tổng** | **34** | **34** |

| Trạng thái | Count |
|---|---|
| ✅ Đã unit-test (domain rules) | 23 tests PASS |
| 🔲 Chờ e2e/API test (cần endpoint wallet/driver/merchant/notification) | 34 case |





