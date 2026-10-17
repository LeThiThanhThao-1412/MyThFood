# 🤖 AI Agent hỗ trợ điều tra Khiếu nại · Gian lận — Báo cáo lý do & luồng vận hành

> **Dự án:** MyThFood — Nền tảng giao đồ ăn (Microservices, NestJS + DDD)
> **Phạm vi:** `resolution-service` → module `assistant` + panel `CaseAiAssistant` (admin-portal)
> **Vai trò của AI:** cố vấn điều tra (investigation copilot) — **đề xuất**, con người **quyết định**
> **Tài liệu liên quan:** `docs/RESOLUTION_SERVICE_DESIGN.md` · `apps/resolution-service/src/modules/assistant/README.md`

---

## Mục lục

1. [Bài toán thực tế (The Pain Point) — Vì sao phải làm?](#1-bài-toán-thực-tế-the-pain-point--vì-sao-phải-làm)
2. [Giải pháp cốt lõi (The Solution) — AI Agent giải quyết gì?](#2-giải-pháp-cốt-lõi-the-solution--ai-agent-giải-quyết-gì)
3. [Luồng hoạt động giữa các bên liên quan khi lên hệ thống](#3-khi-lên-hệ-thống-luồng-hoạt-động-giữa-các-bên-liên-quan)
4. [Kiểm chứng & trạng thái hiện tại](#4-kiểm-chứng--trạng-thái-hiện-tại)
5. [Đề xuất tiếp theo (Roadmap)](#5-đề-xuất-tiếp-theo-roadmap)
6. [Kết luận](#6-kết-luận)
7. [Phụ lục A — Kịch bản demo 5 phút](#phụ-lục-a--kịch-bản-demo-5-phút)
8. [Phụ lục B — Câu hỏi thường gặp khi bảo vệ](#phụ-lục-b--câu-hỏi-thường-gặp-khi-bảo-vệ)

---

## 1. Bài toán thực tế (The Pain Point) — Vì sao phải làm?

### 1.1 Bối cảnh nghiệp vụ

MyThFood là hệ thống giao đồ ăn 3 bên: **Khách hàng – Tài xế – Nhà hàng**, cộng thêm **Admin** làm trọng tài. Mọi xung đột đều đổ về `resolution-service`, chia làm 2 nhóm:

| Nhóm | Số loại vụ việc | Ví dụ |
|---|---|---|
| **Khiếu nại (COMPLAINT)** | 10 danh mục | Thiếu món, sai món, giao trễ, chưa nhận hàng, thái độ tài xế/nhà hàng, vệ sinh an toàn thực phẩm, tự ý huỷ đơn… |
| **Tố cáo gian lận (FRAUD_REPORT)** | 10 danh mục | Giao hàng giả (fake delivery), trộm tiền COD, nuôi đơn ảo (order farming), đánh giá giả, lạm dụng khuyến mãi/hoàn tiền, đa tài khoản, chargeback, giả GPS, thông đồng khách–tài xế |

Mỗi vụ việc đi qua 8 trạng thái (`OPEN → UNDER_REVIEW → WAITING_EVIDENCE → RESOLVED/REJECTED/… → CLOSED`) và có **chế tài** thực tế: cảnh cáo, phạt tiền, bồi thường, tạm khoá, khoá vĩnh viễn, trừ điểm uy tín, hạn chế hoạt động (`WARNING / FINE / COMPENSATION / SUSPEND / BAN / REPUTATION_DEDUCTION / RESTRICT_ACTIVITY`). Sau đó bên bị phạt còn được **kháng nghị 1 lần trong 48h**.

### 1.2 Sáu nỗi đau cụ thể (lý do phải làm)

**P1 — Dữ liệu phân tán, admin phải tự "nối dây" thủ công.**
Một vụ "khách báo chưa nhận hàng" không thể kết luận chỉ bằng lời khai. Muốn đủ căn cứ, admin phải mở và đối chiếu **14 nhóm dữ liệu trải trên 9 microservice**:

| ID | Dữ liệu | Nguồn |
|---|---|---|
| D1 | Chi tiết đơn (items, tiền, trạng thái, thời điểm) | order-service |
| D2 | Timeline trạng thái đơn | order-service |
| D3 | Chuyến điều phối (tài xế, retry, decline, picked-up/delivered) | dispatch-service |
| D4 | Vết GPS tài xế trong ca giao | driver-service |
| D5 | Đánh giá của đơn | review-service |
| D6 | Giao dịch thanh toán của đơn | payment-service |
| D7 | Tin nhắn chat khách ↔ tài xế | chat-service |
| D8 | Lịch sử giao dịch ví của các bên | wallet-service |
| D9 | Lịch sử đơn của khách (tần suất, tỉ lệ huỷ/khiếu nại) | order-service |
| D10 | Lịch sử đơn của tài xế (tỉ lệ giao thất bại, COD) | order-service |
| D11 | Hồ sơ công khai tài xế (rating, uy tín) | driver-service |
| D12 | Hồ sơ nhà hàng (trạng thái, tỉ lệ từ chối) | merchant-service |
| D13 | Hồ sơ khách hàng (tài khoản, lịch sử vi phạm) | consumer-service |
| D14 | Lịch sử khiếu nại trước đó của 2 bên | resolution-service (nội bộ) |

→ Trung bình mỗi vụ = **10–14 thao tác tra cứu** ở nhiều màn hình khác nhau, cho **1** vụ việc.

**P2 — SLA thời gian bóp nghẹt khả năng điều tra.**
Hệ thống đã có đồng hồ chạy: bên bị tố cáo có **72 giờ** để phản hồi; cron mỗi giờ **tự escalate** vụ quá hạn và **tự chốt lỗi khách** nếu khách không phản hồi. Nghĩa là admin không có quyền "điều tra chậm mà kỹ" — càng nhiều vụ, thời gian cho mỗi vụ càng mỏng, quyết định càng dựa vào cảm tính.

**P3 — Bằng chứng phi cấu trúc, khó đọc nhanh.**
Bằng chứng thật không phải bảng biểu mà là: **đoạn chat** rối giữa khách và tài xế (D7), **ảnh chụp** món ăn/bưu phẩm (tải từ upload-service, phải xem bằng mắt), **mô tả tự do** của khách, **lời khai** của bên bị tố. Người đọc dễ bỏ sót chi tiết quyết định (một câu chat thừa nhận, một mốc thời gian lệch).

**P4 — Phán quyết thiếu nhất quán giữa các admin.**
Cùng một loại lỗi, người phạt `WARNING`, người phạt `FINE` 200k, người đánh `severity = HIGH`, người để `MEDIUM`. Không có "điểm neo" nào để so sánh → dễ bị chất vấn, dễ bị kháng nghị, và chính sách trở nên khó giải thích với người dùng.

**P5 — Gian lận chỉ lộ ra khi nhìn xuyên nhiều đơn, không lộ ở một đơn.**
`ORDER_FARMING`, `REFUND_ABUSE`, `MULTI_ACCOUNT`, `COLLUSION`, `GPS_SPOOFING` là các **pattern theo thời gian**, không phải sự kiện đơn lẻ. Admin nhìn 1 đơn thì mọi thứ "sạch"; kẻ gian lận thắng vì không ai ghép dữ liệu lại. Đây là thiệt hại trực tiếp: tiền COD, tiền refund, tiền khuyến mãi.

**P6 — Chi phí tăng tuyến tính theo khối lượng.**
Không có trợ giúp ⇒ muốn xử lý gấp đôi số vụ thì phải gấp đôi người. Không có chỗ để "scale".

**P7 — Ràng buộc về tính giải trình (audit).**
Vụ việc dẫn đến **trừ tiền thật** và **khoá tài khoản thật**. Quyết định bắt buộc phải giải thích được: "dựa trên dữ liệu nào, vì sao kết luận vậy". Một công cụ "hộp đen tự phán" là không thể chấp nhận về mặt nghiệp vụ lẫn pháp lý.

> **Tóm lại pain point trong 1 câu:** *Admin phải tự tay ghép 14 nguồn dữ liệu nằm rải rác 9 microservice, đọc chat/ảnh thủ công, trong khi SLA 72h đang chạy — nên phán quyết vừa chậm, vừa thiếu nhất quán, vừa dễ bỏ sót gian lận, lại vừa khó giải trình.*

---

## 2. Giải pháp cốt lõi (The Solution) — AI Agent giải quyết gì?

### 2.1 Nguyên tắc thiết kế: Human-in-the-loop (điểm quan trọng nhất)

Module `assistant` là **công cụ hỗ trợ quyết định**, không phải "quan toà tự động":

- AI **không** được đổi trạng thái vụ việc, **không** ban hành hình phạt, **không** gọi wallet/driver/merchant để trừ tiền hay khoá tài khoản.
- Toàn bộ endpoint chỉ mở cho role **ADMIN**; các nút hành động thật (`/cases/:id/review`, `/resolve`, `/escalate`, `/request-evidence`) vẫn do admin bấm như cũ.
- AI chỉ trả về **văn bản đề xuất có cấu trúc** để admin đọc, kiểm tra, copy và ra quyết định.

**Thiết kế này chọn có chủ đích:** không phải vì chưa làm được, mà vì đúng nghiệp vụ — quyết định trừ tiền/khoá tài khoản phải có người chịu trách nhiệm (P7).

### 2.2 AI giải quyết đúng từng nỗi đau

| Nỗi đau | AI Agent giải quyết bằng gì |
|---|---|
| **P1 – Dữ liệu phân tán** | `CaseContextService.build()` tự động gom **D1–D14** trên 9 service (best-effort, 2 pha: pha lõi + pha phụ thuộc), đính kèm theo **1 request duy nhất**. Admin không còn phải mở 10 tab. |
| **P2 – Áp lực SLA** | Thay vì 30–60 phút tra cứu, admin bấm **1 nút** và đọc **1 bản tóm tắt** trong vài chục giây. |
| **P3 – Bằng chứng phi cấu trúc** | Đọc hiểu **văn bản + ảnh**: chat D7 và mô tả được nhét vào prompt; ảnh bằng chứng được tải và gửi dạng base64 **cho vision model** (mặc định tối đa 4 ảnh, cấu hình được) — AI "nhìn" bưu phẩm/món ăn và nói rõ nếu ảnh không đọc được. |
| **P4 – Thiếu nhất quán** | Prompt cố định + **JSON Schema bắt buộc** + bảng ánh xạ enum ⇒ mọi vụ việc được soi qua **cùng một bộ tiêu chí**, sinh ra verdict/fault party/severity/mức phạt đề xuất có thể so sánh giữa các admin. |
| **P5 – Gian lận xuyên đơn** | Các nguồn lịch sử **D8/D9/D10/D13/D14** (lịch sử ví, lịch sử đơn khách/tài xế, hồ sơ vi phạm, tiền án tiền sự trong khiếu nại) được đưa vào prompt ⇒ AI có thể phát hiện **pattern** mà mắt người bỏ qua. Ví dụ: GPS "dịch chuyển tức thời", tần suất huỷ bất thường, tài xế luôn giao 1 khu vực mà COD thất thoát. |
| **P6 – Scale** | Chi phí biên thêm 1 vụ chỉ là 1 lần gọi API; khối lượng tăng không cần tăng người tương ứng. |
| **P7 – Tính giải trình** | Output mang theo `keyFindings`, `evidenceGaps`, `riskFlags`, `sourcesUsed`, `sourcesMissing`, `warnings`, `usage` ⇒ admin luôn biết gợi ý **dựa trên dữ liệu gì, thiếu dữ liệu gì**, và sẵn sàng trả lời kháng nghị. |

### 2.3 Sản phẩm AI trả về (có cấu trúc, không phải "chat tự do")

AI **không** trả về một khối văn bản tuỳ hứng. Nó trả về **11 trường bắt buộc** theo JSON Schema:

| Trường | Ý nghĩa với admin |
|---|---|
| `summary` | Tóm tắt 3–6 câu vụ việc theo góc nhìn điều tra viên |
| `suggestedVerdict` | `VALID` / `INVALID` / `INCONCLUSIVE` |
| `suggestedFaultParty` | Lỗi thuộc `CUSTOMER` / `DRIVER` / `MERCHANT` / `SYSTEM` / `INCONCLUSIVE` |
| `suggestedSeverity` | `LOW` / `MEDIUM` / `HIGH` / `CRITICAL` |
| `confidence` | 0–1, mức tự tin — **hiển thị lên UI dạng thanh màu** (≥70% xanh, ≥40% vàng, <40% đỏ) |
| `keyFindings` | Phát hiện chính, mỗi ý nêu rõ nguồn dữ liệu |
| `evidenceGaps` | Dữ liệu/bằng chứng còn thiếu |
| `riskFlags` | Dấu hiệu rủi ro gian lận/lạm dụng |
| `suggestedActions` | Hình phạt đề xuất (type + đối tượng + số tiền/số ngày + lý do) |
| `suggestedResolutionNote` | Ghi chú phán quyết soạn sẵn (có nút **copy**) để admin dán vào ô quyết định |
| `followUpQuestions` | Câu hỏi/yêu cầu bổ sung bằng chứng gửi cho các bên |

### 2.4 Các "van an toàn" kỹ thuật đã hiện thực hoá

| Rủi ro | Biện pháp trong code |
|---|---|
| AI bịa dữ liệu (hallucination) | System instruction bắt: chỉ dùng dữ liệu trong `<VU_VIEC>`/`<NGUON_DU_LIEU>`, **không bịa ID/mã đơn/mốc thời gian/số tiền**; phân biệt rõ **SỰ KIỆN** vs **SUY LUẬN** |
| AI kết luận bừa khi thiếu dữ liệu | Nguồn **bắt buộc theo danh mục** (khai báo trong `CASE_CONTEXT_SOURCES[].criticalFor`). Thiếu nguồn ⇒ prompt chèn **CẢNH BÁO DỮ LIỆU**, buộc AI ghi vào `evidenceGaps`, hạ `confidence ≤ 0.4` và ưu tiên `INCONCLUSIVE`. UI hiển thị nguồn thiếu với nhãn đỏ **`THIẾU⚠`** |
| AI trả JSON sai/thiếu | **Gemini**: `responseMimeType: application/json` + `responseSchema` (ép schema ở phía server). **GLM**: `response_format: json_object` **+ nhét danh sách field của schema vào prompt** (GLM chỉ bảo đảm "JSON hợp lệ", không ép field). Cả hai đều có **salvage JSON lỗi** (tự cắt object đầu tiên) |
| AI trả enum lạ | `AssistantService.normalize()` ánh xạ về giá trị an toàn và ghi lại vào `warnings[]` |
| AI đề xuất phạt vô lý | `amount`/`durationDays` bị ràng buộc số dương; `confidence` kẹp `[0,1]`; **đề xuất nhắm vào bên không tham gia vụ việc bị loại bỏ**; action `NO_ACTION` bị lọc |
| Prompt phình to → tốn token | `compactForPrompt()` cắt độ sâu/số phần tử, giới hạn độ dài chuỗi |
| Ảnh bằng chứng hỏng | `imagesSkipped[]` ghi rõ ảnh tải không được (UI hiển thị) |
| Cấu hình chưa xong mà vẫn gọi mạng | `LlmClient.assertReady()` chạy **trước khi gọi mạng**: thiếu key/chưa bật ⇒ HTTP **503** ngay, không tốn đồng nào |
| Key sai/hết hạn | Lỗi `API_KEY_INVALID` từ Google được **map thành 503** thay vì lộ chi tiết nội bộ; health check hiển thị rõ `hasApiKey` |
| Google quá tải (503 `high demand`) | Client **tự thử lại 3 lần cho mỗi model** (backoff 1.5s → 3s → 6s, tôn trọng `Retry-After`) rồi **tự chuyển sang model dự phòng** (`GEMINI_FALLBACK_MODELS`); cạn cách mới trả 503 kèm gợi ý *"đợi 30–60 giây rồi bấm Phân tích lại"* — admin không phải tự đoán |
| GLM hết quota / model bị gỡ / gửi ảnh cho model chữ | Mã lỗi GLM được map thành câu đọc được: **`1113`** (không có gói/quota) ⇒ nêu rõ **model free đang dùng được**; **`1211`** (model không tồn tại — vd `glm-4v-flash` đã bị gỡ) ⇒ gợi ý kiểm tra `GLM_MODEL`; **`1210`** (model chữ nhận ảnh) ⇒ **tự lùi về phân tích chữ + ghi chú vào `warnings`**; **`1113/1211/1210` không thử lại vô ích**, chỉ chuyển model |
| Admin muốn kiểm tra trước khi tốn token | Endpoint `GET /assistant/cases/:id/context` trả **đúng** ngữ cảnh sẽ gửi cho model, chi phí token = 0 |
| Lộ key / dữ liệu nhạy cảm | Key chỉ nằm trong biến môi trường `.env`, không commit; kết quả AI **chưa ghi vào DB** (không tạo vết dữ liệu tồn dư) |

### 2.5 AI **KHÔNG** làm gì (phòng vấn đáp)

1. Không tự resolve/khoá đơn/khoá tài khoản.
2. Không tự ban hành penalty hay gọi sang wallet/payment để trừ tiền.
3. Không phán quyết khi thiếu nguồn bắt buộc — nó **hạ confidence và nói thẳng là thiếu gì**.
4. Không thay thế admin; không có quyền ghi nào trên vụ việc.

### 2.6 Kiến trúc kỹ thuật (ngắn gọn để trình bày)

```
apps/resolution-service/src/modules/assistant/
├── domain/
│   ├── assistant.types.ts      # kiểu dữ liệu + bảng 14 nguồn (D1..D14) + criticalFor
│   └── assistant.prompt.ts     # system instruction, JSON schema, dựng prompt
├── infrastructure/
│   ├── llm.types.ts            # hợp đồng chung cho mọi LLM (generateJson/assertReady/…)
│   ├── llm.retry.ts            # thử lại + backoff + đọc số từ biến môi trường (dùng chung)
│   ├── llm.provider.ts         # chọn client theo AI_PROVIDER (DI token ASSISTANT_LLM)
│   ├── glm.client.ts           # gọi GLM (Zhipu) — provider ĐANG DÙNG (mặc định)
│   └── gemini.client.ts        # gọi Gemini (Google) — vẫn giữ, đổi bằng AI_PROVIDER
├── application/
│   ├── case-context.service.ts # thu thập D1..D14 + ảnh bằng chứng
│   ├── assistant.service.ts    # điều phối + chuẩn hoá/kiểm tra output
│   └── dtos/assistant.dto.ts
├── presentation/assistant.controller.ts
└── assistant.module.ts
```

Quyết định kỹ thuật đáng nêu: gọi model bằng **REST thuần (`HttpService`)**, không dùng SDK — mọi chi tiết nhà cung cấp tập trung trong 1 client, và **tầng nghiệp vụ chỉ biết interface `AssistantLlmClient`** nên đổi provider chỉ là đổi `AI_PROVIDER` trong `.env` (không sửa service nào khác).

**3 API (đều ADMIN):**

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/api/v1/assistant/health` | Cấu hình: enabled / có key / model / API base / số nguồn |
| `GET` | `/api/v1/assistant/cases/:id/context` | Xem dữ liệu sẽ gửi model (**0 token**) |
| `GET` | `/api/v1/assistant/cases/:id/analysis` | **Bản phân tích AI đã lưu** (AI tự chạy nền ngay khi khiếu nại được tạo) |
| `POST` | `/api/v1/assistant/cases/:id/analysis/review` | Admin **duyệt / bỏ qua** gợi ý: `{ decision: "ACCEPTED" \| "REJECTED", note? }` |
| `POST` | `/api/v1/assistant/cases/:id/analyze` | Chạy lại phân tích (khi admin muốn dữ liệu mới nhất) |

**Pipeline analyze (5 bước):** `assertReady()` (503 nếu chưa cấu hình) → `CaseContextService.build()` (D1–D14 + ảnh) → `llm.generateJson()` (JSON schema) → `AssistantService.normalize()` (ép enum, kẹp giá trị, lọc hành động vô lý) → trả `{ suggestion, sourcesUsed, sourcesMissing, warnings, usage }`.

### 2.7 Vì sao đổi nhà cung cấp model: Gemini → GLM (số đo thật 10/2026)

**Vấn đề gặp thật:** bấm "Phân tích" là lỗi vì model Gemini đang cấu hình trả **503 `high demand`**; đo cả loạt thì `gemini-pro-latest` **429 hết quota**, `gemini-2.5-flash`/`2.5-pro` **404** (Google khoá với tài khoản mới), chỉ `3.6-flash`/`3.5-flash` còn chạy → quá mong manh cho buổi demo.

**Đo thật với key GLM của dự án** (`GET /api/paas/v4/models` + 1 lượt `chat/completions` mỗi model):

| Model | Kết quả đo |
|---|---|
| `glm-4v-flash` (model bạn chỉ định) | **404 / mã 1211** — model đã bị gỡ, không còn tồn tại |
| `glm-4.5`, `4.5-air`, `4.6`, `4.7`, `5`, `5-turbo`, `5.1`, `5.2`, `5.3`, `5.3-flash`, `5.3-flashx` | **429 / mã 1113** — tài khoản không có gói/quota (đây là các model trả phí) |
| `glm-4.5-flash`, `glm-4.6v-flash` | **200 — dùng được (free)** |

⇒ Cấu hình chốt: **chữ = `glm-4.5-flash`**, **ảnh = `glm-4.6v-flash`**, `AI_PROVIDER=glm`.

**Gọi thật bằng đúng prompt của module** (system instruction + JSON schema + dữ liệu vụ việc), `max_tokens=6000`:

| Phép đo | Kết quả |
|---|---|
| `glm-4.5-flash` | JSON parse được, **đủ 11/11 field**, ~1.100 prompt token + ~1.400 output token, **~43 giây** |
| `glm-4.6v-flash` (prompt schema lớn) | **JSON không hợp lệ** sau ~36s ⇒ giữ làm model ảnh, và client **tự lùi về phân tích chữ (bỏ ảnh) + ghi chú vào `warnings`** |
| Bỏ "danh sách field của schema" khỏi prompt | Model trả **thiếu field** (`analysis` thay vì `summary`, thiếu `keyFindings`) ⇒ bài học: **`json_object` không thay thế được schema cứng của Gemini**, phải mô tả field trong prompt |

> **Độ trễ cần biết trước khi demo:** model free của GLM trả lời ~40–90 giây cho một vụ việc đầy đủ. Nếu muốn nhanh hơn: đặt `GLM_VISION_MODEL=none` (bỏ phần ảnh) hoặc `GLM_THINKING=disabled`.

### 2.8 Quy trình mới: AI **tự phân tích** khi có khiếu nại → admin chỉ **đọc & duyệt**

**Vấn đề của luồng cũ:** admin phải bấm "Phân tích" rồi ngồi chờ 40–90 giây, và output dài (5–8 mục, mỗi mục nhiều dòng) nên đọc rất mệt.

**Luồng mới:**

| Bước | Ai làm | Việc gì |
|---|---|---|
| 1 | Hệ thống | Khiếu nại vừa được tạo ⇒ `CaseService.create()` gọi **nền** `AssistantService.triggerAutoAnalysis()` (**không `await`**: tạo khiếu nại không bị chậm vì AI; lỗi model chỉ ghi log). AI phân tích bằng đúng bộ prompt D1–D14 + ảnh rồi **lưu vào bảng `case_ai_analyses`** (1 bản/vụ việc) |
| 2 | Hệ thống | Admin mở panel ⇒ `GET .../analysis` trả bản đã lưu. Nếu AI còn đang chạy, panel **tự chờ (poll 8 giây/lần)** và tự hiện kết quả — admin không phải bấm gì |
| 3 | Admin | Đọc bản tóm tắt ngắn rồi bấm **✅ Duyệt** (kèm ghi chú tuỳ chọn) hoặc **✖️ Bỏ qua** ⇒ `POST .../analysis/review` **lưu vết ai duyệt, lúc nào, ghi chú gì** |
| 4 | Admin | Vẫn là người ban hành phán quyết/hình phạt ở khối bên dưới — AI không tự thi hành gì (giữ nguyên human-in-the-loop) |

**Ép output ngắn theo mẫu** để đọc trong ~30 giây: *kết quả + độ tự tin* → **Tóm tắt nhanh ≤ 2 câu** → **≤ 3 phát hiện chính** → **≤ 3 bằng chứng thiếu** → **≤ 2 dấu hiệu rủi ro** → **Yêu cầu bổ sung tách 2 cột: Khách hàng / Tài xế–Nhà hàng** → **Ghi chú phán quyết ≤ 3 câu**. Prompt dặn giới hạn, và tầng `normalize()` **chốt lại lần cuối** (mọi lần cắt đều ghi vào `warnings` — không sửa lén output của AI), nên UI luôn nhận được bản ngắn dù model trả gì.

**UI mới (`CaseAiAssistant.tsx`):** bỏ kiểu "bấm thủ công là chính"; thêm badge kết quả màu theo verdict, thanh độ tự tin, nhãn `AI tự phân tích` / `Admin bấm phân tích`, khối **Duyệt / Bỏ qua**, phần *Yêu cầu bổ sung* chia 2 cột, và phần thu gọn *Nguồn dữ liệu & cảnh báo* (nguồn thiếu, warnings, tokens). Cấu hình: `AI_AUTO_ANALYZE=true` (mặc định) để bật/tắt tự động — tắt thì quay lại luồng bấm tay.

---

## 3. Khi lên hệ thống: luồng hoạt động giữa các bên liên quan

### 3.1 Sơ đồ tổng thể

```
 ┌─────────────┐         ┌──────────────┐        ┌────────────────────┐
 │ consumer-app│         │  driver-app  │        │  merchant-app      │
 └──────┬──────┘         └──────┬───────┘        └─────────┬──────────┘
        │  tạo khiếu nại /       │  phản hồi /            │  phản hồi /
        │  phản hồi / kháng nghị │  bằng chứng            │  bằng chứng
        └───────────┬────────────┴───────────┬────────────┘
                    ▼                        ▼
        ┌──────────────────────────────────────────────┐
        │           resolution-service                 │
        │  Case (OPEN → … → RESOLVED/CLOSED)           │
        │  Cron: auto-escalate 72h · auto-resolve      │
        │  ┌────────────────────────────────────────┐  │
        │  │ assistant module                       │  │
        │  │  context(D1..D14) → prompt → normalize │  │
        │  └───────────────┬────────────────────────┘  │
        └──────────────────┼───────────────────────────┘
                           │ (cross-service, best-effort)
        ┌──────────────────┼───────────────────────────────────────────┐
        │ order · dispatch · driver · review · payment · chat · wallet  │
        │ merchant · consumer  (9 microservice)                         │
        └──────────────────┬───────────────────────────────────────────┘
                           ▼
                  ┌──────────────────┐        ┌─────────────────────┐
                  │  GLM (Zhipu)     │◄──────►│   admin-portal      │
                  │  hoặc Gemini     │  HTTPS │  panel              │
                  │  (JSON output)   │        │  CaseAiAssistant    │
                  └──────────────────┘        └──────────┬──────────┘
                                                         ▼
                                              ┌─────────────────────┐
                                              │  Admin (điều tra    │
                                              │  viên) — ra quyết   │
                                              │  định cuối cùng     │
                                              └─────────────────────┘
```

### 3.2 Luồng end-to-end theo thời gian

| Bước | Bên thực hiện | Hành động | Hệ thống làm gì |
|---|---|---|---|
| **B1** | Khách / Tài xế / Nhà hàng (hoặc tự động từ order-service) | Gửi khiếu nại/tố cáo kèm mô tả + ảnh bằng chứng | `POST /api/v1/cases` (role `CONSUMER`/`DRIVER`/`MERCHANT_OWNER`/`ADMIN`) → tạo vụ việc `OPEN`, sinh `caseNumber`, đặt **hạn phản hồi 72h**; **ngay sau đó hệ thống cho AI phân tích nền** và lưu kết quả vào `case_ai_analyses` |
| **B2** | Hệ thống | Phân loại sơ bộ | Gán `category`, `severity`, mở timeline vụ việc |
| **B3** | Bên bị tố cáo | Phản hồi + bằng chứng | `POST /cases/:id/respond`; nếu admin thấy thiếu → `POST /cases/:id/request-evidence` → `WAITING_EVIDENCE` |
| **B4** | Hệ thống (cron mỗi giờ) | Giữ đúng SLA | Quá 72h không ai xử lý → `ESCALATED`; khách không phản hồi trong 72h → tự chốt lỗi khách |
| **B5** | **Admin** | Mở admin-portal → panel **CaseAiAssistant** | `GET /assistant/health` cho biết provider/model và AI có tự phân tích không; nếu chưa bật/chưa có key thì nút "Phân tích lại" bị khoá kèm tooltip giải thích |
| **B6** | Admin | (tuỳ chọn) xem trước dữ liệu | `GET /assistant/cases/:id/context` → hiển thị 14 nguồn, đánh dấu nguồn **THIẾU⚠** (bắt buộc theo danh mục) và ảnh bị bỏ qua. **Không tốn token** |
| **B7** | Admin | **Đọc kết quả AI đã có sẵn** | `GET /assistant/cases/:id/analysis` → panel hiện bản AI đã tự phân tích lúc khiếu nại được tạo (ngắn theo mẫu); nếu AI còn đang chạy thì panel **tự chờ (poll 8s)**. Chỉ bấm **"Phân tích lại"** (`POST .../analyze`) khi muốn dữ liệu mới nhất |
| **B8** | **AI Agent** + Admin duyệt | Trả *đề xuất*, không trả *quyết định* | Panel hiển thị: kết quả + thanh confidence, tóm tắt nhanh, **≤3 phát hiện**, **≤3 thiếu bằng chứng**, rủi ro, **yêu cầu bổ sung tách Khách hàng / Tài xế–Nhà hàng**, ghi chú phán quyết (**nút copy**). Admin bấm **✅ Duyệt** / **✖️ Bỏ qua** (kèm ghi chú tuỳ chọn) ⇒ `POST .../analysis/review` lưu vết ai duyệt, lúc nào |
| **B9** | **Admin (con người)** | Đọc – kiểm chứng – quyết định | Nếu thiếu căn cứ: yêu cầu bổ sung (dùng `followUpQuestions`); nếu đủ: `POST /cases/:id/resolve` với verdict/fault party/ghi chú/hình phạt của **chính admin** |
| **B10** | Hệ thống | Thi hành chế tài | Tạo `Penalty` → tác động sang wallet/payment/driver/merchant/notification theo loại hình phạt |
| **B11** | Bên bị phạt | Kháng nghị (nếu muốn) | Trong **48h**, **1 lần duy nhất** (`UNIQUE(penaltyId)`); admin xử kháng nghị = chung thẩm; nếu `OVERTURNED` → hoàn trả (clawback) |
| **B12** | Hệ thống | Đóng vụ việc | Ghi timeline; kết quả là dữ liệu cho **D14** ở các vụ sau (vòng lặp học từ kinh nghiệm nội bộ) |

### 3.3 Ma trận trách nhiệm (ai làm gì)

| Bên | Được phép | Bị chặn |
|---|---|---|
| **Khách hàng** | Tạo khiếu nại, gửi bằng chứng, phản hồi, kháng nghị hình phạt | Không tự phán quyết, không xem dữ liệu điều tra |
| **Tài xế / Nhà hàng** | Phản hồi, gửi bằng chứng phản biện, kháng nghị | Như trên |
| **Admin (điều tra viên)** | Xem toàn bộ context, gọi AI phân tích, review/resolve/escalate/request-evidence | Quyết định cuối cùng thuộc **admin**, không thuộc AI |
| **AI Agent** | Đọc dữ liệu đã cấp, sinh đề xuất có cấu trúc | Không ghi DB, không đổi status, không thi hành chế tài, không thay admin |
| **Hệ thống (cron)** | Ép SLA: escalate 72h, auto-resolve | Không tự xử lý vụ có tranh chấp phức tạp |

### 3.4 Đường ranh giới "AI đề xuất – Người quyết định"

```
        AI Agent (đề xuất)                    Admin (quyết định)
 ┌──────────────────────────────┐      ┌──────────────────────────────┐
 │ • verdict/fault/severity     │      │ • xem xét + kiểm chứng       │
 │ • hình phạt + lý do          │ ───► │ • sửa / chấp nhận / bỏ       │
 │ • mức confidence + nguồn     │      │ • bấm nút phán quyết         │
 │   thiếu + cờ rủi ro          │      │ • chịu trách nhiệm cuối      │
 └──────────────────────────────┘      └──────────────────────────────┘
        KHÔNG CÓ QUYỀN GHI                CÓ TOÀN QUYỀN GHI
```

### 3.5 Nên dùng AI ở giai đoạn nào của vụ việc

| Trạng thái | AI nên dùng? | Ghi chú |
|---|---|---|
| `OPEN` / `UNDER_REVIEW` | ✅ Hợp lý nhất | Lúc cần tổng hợp dữ liệu nhanh để quyết định |
| `WAITING_EVIDENCE` | ✅ Hữu ích | Dùng `followUpQuestions` + `evidenceGaps` để soạn yêu cầu bổ sung |
| `ESCALATED` | ✅ Nên dùng | Vụ khó/quá hạn — nơi AI tiết kiệm thời gian nhiều nhất |
| `RESOLVED` / `REJECTED` / `CLOSED` | ⚠️ Chỉ để tham chiếu | Vụ đã chốt; gọi lại chỉ tốn token |
| `WITHDRAWN` | ❌ Không cần | Bên khiếu nại đã rút |

---

## 4. Kiểm chứng & trạng thái hiện tại

### 4.1 Đã chạy và có kết quả

| Hạng mục | Kết quả |
|---|---|
| Unit test module assistant | **71/71 pass** (6 suite: `assistant.spec.ts` + `gemini.client.spec.ts` + `glm.client.spec.ts` + `llm-provider.spec.ts` + 2 spec khác) — không cần mạng, không cần API key. Trong đó có test cho **cắt ngắn output**, **tự phân tích nền (source=AUTO)**, **lỗi lưu DB không làm hỏng kết quả**, **lưu vết duyệt** |
| Luồng mới: tự phân tích + duyệt | Unit test xác nhận: tạo khiếu nại ⇒ `triggerAutoAnalysis()` gọi `analyzeCase(source=AUTO)`; admin bấm Duyệt ⇒ lưu `decision/by/note`; AI chưa cấu hình ⇒ **bỏ qua im lặng, không ném lỗi** (vụ việc vẫn tạo bình thường) |
| Ép output ngắn | Test: summary 4 câu ⇒ còn **2 câu**; 5 phát hiện ⇒ **3**; 4 bằng chứng thiếu ⇒ **3**; 3 rủi ro ⇒ **2**; 4+4 câu hỏi ⇒ **3+3**, và mọi lần cắt đều có `warnings` |
| **Gọi thật GLM end-to-end** | Test tạm (đã xoá sau khi đo) gọi `glm-4.5-flash` bằng **đúng system instruction + JSON schema** của module: JSON parse được, **đủ 11/11 field**, `verdict=INCONCLUSIVE`, `confidence=0.3`, ~1.400 token output, **~43 giây** |
| Health sau khi đổi provider | `provider`, `model`, `visionModel` được trả về `GET /assistant/health` để admin biết đang dùng model nào |
| Đăng ký route | Boot `resolution-service` map đủ **3 route** của `/api/v1/assistant/*` |
| `GET /assistant/health` | **200** — `enabled:true`, `hasApiKey:false`, `model:gemini-3.8-flash`, `sourceCount:14` *(số liệu lúc còn dùng Gemini; nay trả thêm `provider:glm`, `model:glm-4.5-flash`, `visionModel:glm-4.6v-flash`)* |
| `POST /analyze` khi thiếu key | **503 ngay trước khi gọi mạng** (đúng van an toàn chi phí) |
| `GET /context` | Case không tồn tại → **404**; case thật (`NOT_RECEIVED`) → **200**, báo đúng nguồn bắt buộc bị thiếu: **D1, D2, D3, D7** |
| Gọi Google với key sai | **400 + reason `API_KEY_INVALID`** → được xử lý thành **503** (không lộ lỗi nội bộ) |
| Chịu lỗi Google quá tải (503) | Mô phỏng đúng lỗi `high demand` của Google trong unit test: **(a)** lỗi 1 lần rồi thành công ⇒ 2 lần gọi, admin vẫn thấy kết quả; **(b)** model chính 503 liên tục ⇒ **tự chuyển `gemini-3.6-flash`** và trả kết quả; **(c)** cả chuỗi đều 503 ⇒ 503 kèm câu gợi ý, ghi log `models: gemini-3.8-flash → gemini-3.6-flash`; **(d)** key sai ⇒ **không thử lại** (đúng 1 lần gọi). *Đây là kiểm chứng phía client bằng mock, không phải test tải thật của Google.* |
| Lỗi *"bấm Phân tích là 503"* khi chạy thật | Nguyên nhân: `gemini-3.8-flash` bị Google quá tải (503 `high demand`) **ngay lúc demo** — không phải lỗi key/code (key đã xác nhận hợp lệ: `GET /v1beta/models` trả **200**). Trước khi sửa, đúng 1 lần quá tải là admin thấy lỗi ngay; sau khi sửa, client **tự thử lại rồi tự đổi model** nên vẫn ra kết quả mà admin không phải làm gì |
| **Đo thật** model nào còn dùng được (10/2026) | Gọi `POST /v1beta/models/{model}:generateContent` bằng key của dự án, mỗi model 1 lượt: `3.8-flash` **503**, `3.7-flash` **503**, `3.1-flash-lite` **503**, `flash-latest` **503** · `2.5-flash` **404**, `2.5-pro` **404** (*"no longer available to new users"*) · `pro-latest` **429** (hết quota) — trong khi `3.6-flash`, `3.5-flash`, `3-flash-preview`, `flash-lite-latest` trả **200**. ⇒ Chính số đo này là căn cứ chọn `GEMINI_FALLBACK_MODELS=gemini-3.6-flash,gemini-3.5-flash` |
| Bổ sung nguồn D7 | Thêm endpoint `GET /api/v1/chat/conversations/order/:orderId/messages` trong `chat-service` |
| Panel admin-portal | `CaseAiAssistant.tsx` viết lại **không còn `any`**, 4 trạng thái banner (loading/lỗi/tắt/thiếu key/sẵn sàng), khoá nút theo health, highlight nguồn thiếu, thanh confidence màu, nút copy, skeleton loading; `tsc --noEmit` **sạch** |

### 4.2 Còn lại (đang chờ, không phải lỗi thiết kế)

1. **Provider mặc định đã là GLM và đã gọi thật thành công** (`glm-4.5-flash`, đủ 11/11 field — mục 2.7/4.1). Việc còn lại để có ảnh chụp cho slide: **tạo 1 khiếu nại thật trong DB** ⇒ AI **tự phân tích nền** (chờ 40–90 giây) ⇒ mở panel, chụp bản ngắn + bấm **Duyệt** rồi chụp vết duyệt.
2. **DB hiện trống vụ việc** → cần tạo 1 khiếu nại thật có `orderId` để demo.
3. Nếu chạy Docker: cần rebuild `resolution-service` **và** `chat-service` (do endpoint D7 mới).

---

## 5. Đề xuất tiếp theo (Roadmap)

1. ~~**Lưu vết gợi ý**~~ ⇒ **ĐÃ LÀM**: bảng `case_ai_analyses` lưu bản phân tích mới nhất + vết duyệt (`reviewDecision`, `reviewedBy`, `reviewedAt`, `reviewNote`); AI tự chạy nền khi khiếu nại được tạo nên không phải gọi lại model nhiều lần. Việc còn lại: ghi thêm một dòng vào **timeline vụ việc** mỗi lần AI phân tích / admin duyệt để nhìn chung một dòng thời gian.
2. **Bổ sung nguồn phase 2**: dữ liệu khuyến mãi/chargeback từ `promotion-service` cho các danh mục `PROMO_ABUSE`, `CHARGEBACK_FRAUD` (hiện các danh mục này thiếu nguồn chuyên biệt).
3. **Đo lường định lượng** để chứng minh hiệu quả: thời gian xử lý trung bình/vụ trước–sau, **tỉ lệ admin chấp nhận gợi ý**, tỉ lệ kháng nghị bị `OVERTURNED` (chỉ số đánh giá chất lượng AI tốt nhất trong nghiệp vụ này).
4. **Vòng phản hồi**: admin đánh dấu "gợi ý đúng/sai" ⇒ dữ liệu để tinh chỉnh prompt theo từng danh mục.

---

## 6. Kết luận

Module AI Agent không được thêm vào vì "cho có AI", mà vì một pain point rất cụ thể và đo được: **một phán quyết khiếu nại/gian lận cần ghép 14 nguồn dữ liệu nằm ở 9 microservice, đọc chat và ảnh bằng tay, trong khi đồng hồ SLA 72h đang chạy, và kết quả lại là trừ tiền/khoá tài khoản thật nên phải giải trình được.**

Giải pháp chọn là **AI làm cố vấn điều tra, con người ra quyết định**: AI tự động gom dữ liệu, đọc cả văn bản lẫn ảnh, trả về một bộ đề xuất có cấu trúc kèm mức tự tin, nguồn đã dùng, nguồn còn thiếu và cờ rủi ro; admin vẫn là người bấm nút phán quyết. Mọi rủi ro của LLM (bịa dữ liệu, JSON hỏng, enum lạ, đề xuất phạt vô lý, lạm dụng token/chi phí) đều đã được xử lý bằng van an toàn ở tầng code: khai báo nguồn **bắt buộc theo danh mục**, ép **structured output** bằng JSON Schema, và tầng **normalize** kiểm tra lại toàn bộ output của model trước khi tới tay admin.

---

## Phụ lục A — Kịch bản demo 5 phút

**Chuẩn bị:** `.env` của `resolution-service` có `AI_ASSISTANT_ENABLED=true`, `AI_PROVIDER=glm` và `GLM_API_KEY=<key>` (xem bảng biến ở `assistant/README.md`); đã tạo 1 vụ việc thật có `orderId`.

```powershell
# 0) Bật/tắt công tắc & kiểm tra cấu hình (không gọi model — thấy provider/model/visionModel)
curl.exe -s http://localhost:3014/api/v1/assistant/health -H "Authorization: Bearer $ADMIN_JWT"

# 1) Cho thấy AI "nhìn thấy" gì — 0 token: 14 nguồn, nguồn nào THIẾU⚠
curl.exe -s "http://localhost:3014/api/v1/assistant/cases/<CASE_ID>/context" `
  -H "Authorization: Bearer $ADMIN_JWT"

# 2) Xem bản AI ĐÃ TỰ PHÂN TÍCH (chạy nền lúc tạo khiếu nại, 0 token)
curl.exe -s "http://localhost:3014/api/v1/assistant/cases/<CASE_ID>/analysis" `
  -H "Authorization: Bearer $ADMIN_JWT"

# 3) Admin duyệt gợi ý (lưu vết ai duyệt) — hoặc "REJECTED" nếu bỏ qua
curl.exe -s -X POST "http://localhost:3014/api/v1/assistant/cases/<CASE_ID>/analysis/review" `
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" `
  -d '{ "decision": "ACCEPTED", "note": "Đã kiểm chứng ảnh + GPS" }'

# 4) Chỉ khi cần dữ liệu mới nhất mới chạy lại (bước duy nhất tốn token)
curl.exe -s -X POST "http://localhost:3014/api/v1/assistant/cases/<CASE_ID>/analyze" `
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" `
  -d '{ "skipImages": false }'

# 5) Demo van an toàn: tắt AI rồi gọi lại ⇒ 503, không gọi mạng
#    AI_ASSISTANT_ENABLED=false + restart ⇒ POST /analyze trả 503
```

**Điểm nhấn khi trình bày:** bước 1 chứng minh *"AI không tự bịa — nó chỉ thấy những gì hệ thống cấp và nói rõ cái còn thiếu"*; bước 2 chứng minh *"output có cấu trúc, có mức tự tin, có nguồn"*; bước 3 chứng minh *"chi phí và an toàn được kiểm soát ở tầng code, không phải ở lời hứa"*.

Hoặc demo trực tiếp trên UI: mở admin-portal → `/cases` → chọn vụ việc → panel **AI Assistant** bên phải → xem banner trạng thái, bấm *Xem ngữ cảnh*, rồi bấm *Phân tích bằng AI*.

---

## Phụ lục B — Câu hỏi thường gặp khi bảo vệ

| Câu hỏi | Trả lời ngắn |
|---|---|
| *Sao không cho AI tự quyết luôn cho nhanh?* | Vì quyết định có hệ quả tài chính/pháp lý thật (trừ tiền, khoá tài khoản) — phải có người chịu trách nhiệm. Xem P7 và mục 2.1. |
| *Làm sao chống AI bịa?* | Ràng buộc dữ liệu đầu vào + JSON Schema + tầng `normalize()` + công khai `sourcesUsed`/`sourcesMissing`/`warnings`. Xem mục 2.4. |
| *Nếu dữ liệu không lấy được thì sao?* | Best-effort: nguồn lỗi vẫn được ghi vào prompt với nhãn `KHÔNG CÓ`; nguồn **bắt buộc theo danh mục** bị thiếu sẽ hiện đỏ `THIẾU⚠` trên UI và buộc AI hạ `confidence ≤ 0.4`, ưu tiên `INCONCLUSIVE`. |
| *Tốn kém không?* | Có endpoint `/context` 0 token để kiểm tra trước; `compactForPrompt()` cắt dữ liệu thừa; chưa cấu hình thì trả 503 **trước khi gọi mạng**. |
| *Sao không dùng SDK cho nhanh?* | Cố ý dùng REST thuần (`HttpService`) để cô lập toàn bộ chi tiết nhà cung cấp trong 1 client; tầng nghiệp vụ chỉ biết interface `AssistantLlmClient` nên **đổi provider Gemini ⇄ GLM chỉ bằng `AI_PROVIDER`** trong `.env`. |
| *Đổi sang model khác (GLM) có phải viết lại không?* | Không. Thêm `glm.client.ts` (API tương thích OpenAI) + 1 factory trong `assistant.module.ts`; `AssistantService` không đổi. Số đo chọn model và các cạm bẫy (model bị gỡ, hết quota, `json_object` thiếu field) nêu ở mục 2.7. |
| *Có phải "làm cho có AI" không?* | Không: mục 1 nêu 7 pain point có số liệu/đối tượng rõ ràng (14 nguồn, 9 service, SLA 72h, 20 danh mục, 7 loại chế tài) và mục 2.2 ánh xạ 1–1 pain point → biện pháp kỹ thuật. |
| *AI trả lời dài quá thì sao?* | Không phụ thuộc việc model có "nghe lời": prompt dặn giới hạn **và** tầng `normalize()` **cắt lần cuối** (summary ≤ 2 câu, ≤ 3 phát hiện chính, ≤ 3 bằng chứng thiếu, ≤ 2 rủi ro, ≤ 3 câu hỏi mỗi bên, ghi chú ≤ 3 câu) — mọi lần cắt đều ghi vào `warnings`. Xem mục 2.8. |
| *Vậy admin còn phải làm gì?* | Chỉ **đọc & duyệt**: AI tự phân tích nền ngay khi khiếu nại được tạo và lưu vào bảng `case_ai_analyses`; admin mở vụ việc là có sẵn bản ngắn, bấm **Duyệt / Bỏ qua**. Phán quyết và hình phạt vẫn do admin ban hành — AI không tự thi hành (mục 2.8). |
| *Google quá tải / trả lỗi 503 thì sao?* | Không phải lỗi của đồ án: client **tự thử lại 3 lần mỗi model** (backoff 1.5s → 3s → 6s, tôn trọng `Retry-After`) rồi **tự đổi sang model dự phòng** (`GEMINI_FALLBACK_MODELS`); cạn cách mới trả 503 kèm gợi ý "đợi 30–60 giây rồi bấm Phân tích lại". Cũng chính vì vậy toàn bộ chi tiết Gemini nằm gọn trong `gemini.client.ts` — đổi model/vendor chỉ sửa 1 file. |
| *Rủi ro còn lại là gì?* | ~~Chưa lưu vết gợi ý~~ → **đã lưu** bản phân tích + vết duyệt (`case_ai_analyses`); còn lại: chưa có nguồn cho `PROMO_ABUSE`/`CHARGEBACK_FRAUD` (mục 5.2) và chất lượng gợi ý cần đo bằng tỉ lệ chấp nhận/tỉ lệ kháng nghị bị lật (mục 5.3). Đây là phần được nêu minh bạch, không giấu. |

---

> **Tài liệu này mô tả đúng trạng thái code tại thời điểm viết.** Phần đã kiểm chứng bằng **gọi model thật** (GLM `glm-4.5-flash`, đủ 11/11 field) nằm ở mục 2.7; luồng tự phân tích + duyệt và việc **ép output ngắn** có unit test (71/71) ở mục 4.1. Phần chưa làm: chụp kết quả analyze end-to-end trên dữ liệu vụ việc thật trong DB (mục 4.2) — không tuyên bố "đã chạy" cho những gì chưa chạy.

---

> **Vị trí tài liệu:** báo cáo này được lưu ở **2 nơi với nội dung giống hệt nhau** —
> `docs/AI_ASSISTANT_REPORT.md` (thư mục `docs/` cấp dự án, cùng chỗ với `RESOLUTION_SERVICE_DESIGN.md`) và
> `mythfood/docs/AI_ASSISTANT_REPORT.md` (trong repo, được git theo dõi).
> Khi sửa nội dung, cập nhật **cả hai** bản để tránh lệch.
