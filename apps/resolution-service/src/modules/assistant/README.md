# Assistant module — Trợ lý AI phân tích khiếu nại / gian lận

Module gọi **LLM** (mặc định: **GLM của Zhipu**; đổi sang Gemini bằng `AI_PROVIDER`)
để phân tích một vụ việc (`Case`) trong `resolution-service`
và trả về **gợi ý có cấu trúc** cho admin. Đây là công cụ hỗ trợ quyết định
(human-in-the-loop): module **không** tự đổi trạng thái vụ việc, không tự ban
hành hình phạt, không tự gọi wallet/driver/merchant.

> 📄 **Báo cáo lý do & luồng vận hành (dành cho thuyết trình/báo cáo đồ án):**
> `docs/AI_ASSISTANT_REPORT.md` — pain point, giải pháp, luồng giữa các bên, kịch bản demo.
> File nằm ở thư mục `docs/` cấp dự án (ngang hàng thư mục `mythfood/`, cùng chỗ với
> `RESOLUTION_SERVICE_DESIGN.md` và `TIEN_DO.md`).

## 1. Kiến trúc

```
modules/assistant/
├── domain/
│   ├── assistant.types.ts     # kiểu dữ liệu + bảng nguồn dữ liệu (D1..D14)
│   └── assistant.prompt.ts    # system instruction, JSON schema, dựng prompt
├── infrastructure/
│   ├── llm.types.ts           # hợp đồng chung: AssistantLlmClient, LlmJsonRequest/Response
│   ├── llm.retry.ts           # thử lại + backoff + `Retry-After` + đọc số từ env (dùng chung)
│   ├── llm.provider.ts        # chọn provider theo AI_PROVIDER (token ASSISTANT_LLM)
│   ├── glm.client.ts          # REST tới GLM (Zhipu) — provider đang dùng
│   └── gemini.client.ts       # REST tới Gemini (Google) — provider thay thế
├── application/
│   ├── case-context.service.ts# thu thập ngữ cảnh từ các service khác
│   ├── assistant.service.ts   # điều phối + chuẩn hoá/kiểm tra output của model
│   └── dtos/assistant.dto.ts
├── presentation/
│   └── assistant.controller.ts
└── assistant.module.ts
```

Luồng xử lý:

```
Tạo khiếu nại (POST /cases)
  → CaseService lưu vụ việc rồi gọi nền AssistantService.triggerAutoAnalysis()
      (không await: response tạo khiếu nại không chậm vì model AI; lỗi chỉ ghi log)
  → AssistantService.analyzeCase(..., source = "AUTO")
      → LlmClient.assertReady()            (tắt / thiếu key ⇒ 503, không gọi mạng)
      → CaseContextService.build()         (D1..D14 + ảnh bằng chứng base64)
      → LlmClient.generateJson()           (GLM: json_object + mô tả field trong prompt)
      → AssistantService.normalize()       (ép enum, clamp, **cắt ngắn theo mẫu**)
      → lưu vào bảng `case_ai_analyses`    (1 bản/vụ việc, ghi đè khi phân tích lại)

Admin mở vụ việc (admin-portal)
  → GET  /cases/:id/analysis          đọc bản đã lưu (chưa có ⇒ panel tự chờ & poll)
  → POST /cases/:id/analysis/review   duyệt = ÁP DỤNG phán quyết + hình phạt + thông báo
  → POST /cases/:id/analyze           chỉ dùng khi muốn chạy lại
```

**Output ngắn theo mẫu** (admin đọc ~30 giây): kết quả + độ tự tin → tóm tắt ≤ 2 câu
→ **📷 phân tích ảnh TÁCH THEO BÊN** — `reporterImages` / `respondentImages`, mỗi bên
`{ support: SUPPORTS/CONTRADICTS/NEUTRAL/NO_IMAGE, analysis ≤ 3 câu, attached, analyzed }`
→ **⚖️ `sideComparison`** ≤ 3 câu so sánh lời khai + ảnh hai bên **rồi mới** chọn verdict
→ tối đa 3 phát hiện chính → tối đa 3 bằng chứng thiếu → tối đa 2 rủi ro → yêu cầu
bổ sung tách riêng **khách hàng** (`followUpQuestions`) và **bên bị khiếu nại**
(`respondentQuestions`) → ghi chú phán quyết ≤ 3 câu. Prompt dặn model giới hạn độ
dài, và `normalize()` **chốt lại lần cuối** (ghi `warnings` khi phải cắt) để UI luôn
nhận được output ngắn bất kể model trả gì.

**Chỉ hỏi khi thật sự cần (2 tầng chặn):**

- **Prompt (luật 18–23):** đã đủ căn cứ kết luận (`VALID`/`INVALID`) ⇒ **cả hai danh sách câu hỏi = `[]`**;
  không hỏi lại thông tin đã có (trạng thái đơn, lý do từ chối…); không hỏi ý muốn/cảm nhận
  (“có muốn đặt lại món không”, “bạn sẽ giải quyết thế nào”); không hỏi bên không liên quan
  (chưa có điều phối D3 ⇒ không hỏi tài xế); tối đa **2 câu/bên**; **không** coi nhà hàng ít đơn
  là rủi ro. Kèm **playbook theo danh mục** (dữ liệu nào đủ thì kết luận luôn), ví dụ
  `UNAUTHORIZED_CANCEL`/`MERCHANT_BEHAVIOR`: nhà hàng từ chối đơn (kể cả “hết hàng”) ⇒
  `VALID` + `MERCHANT`, lý do đã có trong D1/D2 thì không hỏi lại.
- **`normalize()` (guard, vì model hay quên):** verdict khác `INCONCLUSIVE` ⇒ xoá sạch câu hỏi;
  bỏ câu hỏi khớp mẫu “nhiễu” (`có muốn`/`đặt lại món`/`cảm thấy`/`hài lòng`/`sẽ giải quyết`…);
  bỏ `riskFlags` kiểu “ít đơn / chưa có kinh nghiệm / đơn đầu tiên”. Mọi lần bỏ đều ghi `warnings`.

**Trọng số bằng chứng — ảnh & dữ liệu hệ thống quyết định, lời khai chỉ định hướng:**

| Nguồn                                            | Trọng số | Ghi chú                                        |
| ------------------------------------------------ | -------- | ---------------------------------------------- |
| Ảnh giao hàng hệ thống (`deliveryProofPhotoUrl`) | **35%**  | Tài xế chụp ngay trước khi bấm giao thành công |
| Ảnh bên khiếu nại                                | **25%**  | Ảnh do chính khách gửi                         |
| Ảnh bên bị khiếu nại                             | **15%**  | Ảnh tài xế/nhà hàng phản hồi                   |
| Dữ liệu hệ thống (D1–D14)                        | **20%**  | Mỗi nguồn có dữ liệu ≈ 2%, tối đa 20%          |
| Lời khai hai bên                                 | **5%**   | Chỉ để định hướng, không lấn át ảnh            |

- Prompt luật 25–28 dạy model thang này và cấm trả `INCONCLUSIVE` khi đã có ảnh/dữ liệu để đối chiếu.
- **Guard trong code:** nếu **ảnh của chính bên khiếu nại mâu thuẫn với lời khai** (`support = CONTRADICTS`)
  mà bên kia không có ảnh phản bác ngược ⇒ ép `INVALID` + `faultParty = CUSTOMER`,
  `confidence ≥ 0.7`, **bỏ hết hình phạt đề xuất**, thay ghi chú phán quyết bằng câu chuẩn
  (“Khiếu nại không có căn cứ…”) và ghi `warnings` — tránh cảnh AI vừa kết luận INVALID vừa
  đề xuất phạt / vừa đòi hỏi thêm bằng chứng.
- Kết quả trả thêm `evidenceWeight: { images, system, testimony, objective, basis, reporterSelfContradiction }`;
  panel admin vẽ thanh **Độ mạnh bằng chứng** (xanh = ảnh, xanh dương = hệ thống, xám = lời khai)
  và ghi rõ “đủ căn cứ kết luận” khi `objective ≥ 50`.

**Nhà cung cấp model** (`AI_PROVIDER`, mặc định `glm`): cả hai client đều thoả
`AssistantLlmClient`, `AssistantService` không biết đang dùng vendor nào.

| Provider         | Model chữ          | Model ảnh        | Ghi chú                                                                                                                 |
| ---------------- | ------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `glm` (mặc định) | `glm-4.5-flash`    | `glm-4.6v-flash` | Model **free** của GLM; `json_object` chỉ bảo đảm JSON hợp lệ nên client **nhét danh sách field của schema vào prompt** |
| `gemini`         | `gemini-3.8-flash` | (dùng chung)     | Ép schema ở phía server; đo 10/2026 hay trả **503 `high demand`**                                                       |

Số đo thật khi chọn model (10/2026): `glm-4v-flash` / nhiều model vision cũ đã bị
**gỡ (1211)**; `glm-4.5`, `4.6`, `4.7`, `5.x` trả **429/1113** (không có gói);
`glm-4.5-flash` và `glm-4.6v-flash` trả **200**. Gọi thật bằng đúng prompt của
module: `glm-4.5-flash` trả **đủ 11/11 field** (~43s), còn `glm-4.6v-flash` với
prompt schema lớn hay trả JSON lỗi ⇒ client **tự lùi về phân tích chữ, bỏ ảnh và
ghi chú vào `warnings`** (đặt `GLM_VISION_MODEL=none` để bỏ hẳn phần ảnh).

**Chống JSON hỏng (3 lớp):** (1) lượt có ảnh mặc định **tắt `thinking`** để model
không "suy nghĩ" hết token rồi trả JSON cụt; (2) JSON vẫn hỏng ⇒ **thử lại 1 lần**
với system nhắc “chỉ JSON” + tắt thinking; (3) vẫn hỏng ⇒ lùi về model chữ (bỏ ảnh)
và ghi chú. Lỗi cuối cùng (nếu có) nêu rõ `finish_reason` + đoạn đầu nội dung để
biết ngay là bị cắt token hay model trả văn bản. Đường chữ mặc định
`GLM_FALLBACK_MODELS=none` — **không** lấy model vision làm dự phòng.

**Ảnh giao hàng từ hệ thống (bằng chứng khách quan):** `order.deliveryProofPhotoUrl`
— tài xế chụp ngay trước khi bấm **giao hàng thành công** (`DeliveryProofDialog` trong
app tài xế) — được gửi cho model **đầu tiên**, chiếm 1 suất trong
`AI_ASSISTANT_MAX_IMAGES`, nhãn `ẢNH HỆ THỐNG — tài xế chụp món ăn lúc giao hàng`.
Ảnh này **không** tính vào `reporterImages`/`respondentImages` (không thuộc bên nào) mà
dùng để đối chiếu lời khai/ảnh hai bên. Kết quả AI trả thêm
`deliveryProof: { photoUrl, analyzed }` ⇒ panel hiện ảnh thật + nhãn “✅ Đã gửi cho AI”.

**Phản hồi của bên bị khiếu nại:** `CaseContextService` đưa `respondentResponse`,
`respondentEvidence`, `respondentRespondedAt` vào prompt **và gửi cả ảnh của hai bên**
(`caseEvidence + caseRespondentEvidence`) cho model vision. Mỗi ảnh được **gắn nhãn
`BÊN KHIẾU NẠI — ảnh N` / `BÊN BỊ KHIẾU NẠI — ảnh N` ngay trước ảnh** trong request,
prompt cũng liệt kê đúng thứ tự đó ⇒ model phân tích **tách biệt từng bên**, rồi mới
viết `sideComparison` và chọn verdict. Khi bên bị khiếu nại bấm
phản hồi, `CaseService.respond()` **chạy lại AI nền**; `GET .../analysis` trả
`stale=true` nếu bản lưu cũ hơn thời điểm phản hồi ⇒ panel hiện cảnh báo + gợi ý bấm
“Phân tích lại”.

**Duyệt gợi ý (✅) là thực thi thật, không chỉ ghi chú:**

- `VALID` ⇒ vụ việc `RESOLVED`, settle tiền (`settleFailureMoney`) và **ghi đúng hình phạt AI đề xuất** (`FINE`/`COMPENSATION`/`SUSPEND`/`BAN`/… kèm `amount`/`durationDays`). Nếu AI không đề xuất hình phạt hợp lệ nào ⇒ fallback chính sách mặc định. **Mức tiền bị chặn trần ≤ 2× giá trị đơn.**
- `INVALID` ⇒ `REJECTED` + release tiền đang giữ.
- `INCONCLUSIVE` ⇒ `WAITING_EVIDENCE`: gửi thông báo kèm **đúng câu hỏi** cho bên còn thiếu bằng chứng (`respondentQuestions` → bên bị khiếu nại, `followUpQuestions` → khách hàng). Vì `normalize()` xoá câu hỏi khi đã kết luận được, nhánh này chỉ còn câu hỏi **thật sự cần**.
- `VALID`/`INVALID` ⇒ thông báo kết quả cho **cả hai bên** (bên bị phạt thấy hình phạt của mình).
- Endpoint trả `{ analysis, outcome }` (verdict, `caseStatus`, số hình phạt, bên đã thông báo) để UI hiện “đã áp dụng gì”.

**Vòng bổ sung bằng chứng (khi AI trả `INCONCLUSIVE`):**

- Vụ việc → `WAITING_EVIDENCE`; hai bên nhận thông báo kèm **đúng câu hỏi của AI**.
- **Người khiếu nại** bổ sung ảnh trong app khách (_“Bổ sung bằng chứng”_) ⇒ `POST /cases/:id/evidence`.
  **Bên bị khiếu nại** phản hồi trong app tài xế (nút “Phản hồi” nay mở cả khi `WAITING_EVIDENCE`) ⇒ `POST /cases/:id/respond`.
- Cả hai đường đều: đưa vụ việc về `UNDER_REVIEW`, ghi timeline, **tự chạy lại AI**
  (`triggerAutoAnalysis`) để phân tích luôn phần bổ sung, và thông báo cho bên còn lại.
- Panel admin: `GET .../analysis` trả `stale=true` khi vụ việc có cập nhật **sau** bản phân
  tích ⇒ hiện cảnh báo _“có cập nhật mới — bấm Phân tích lại”_.

## 2. API

| Method | Path                                          | Role  | Mô tả                                                                                     |
| ------ | --------------------------------------------- | ----- | ----------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/assistant/health`                    | ADMIN | Trạng thái cấu hình (enabled, có key, model, API base)                                    |
| `GET`  | `/api/v1/assistant/cases/:id/context`         | ADMIN | **Không tốn token**: trả đúng ngữ cảnh sẽ gửi cho model                                   |
| `GET`  | `/api/v1/assistant/cases/:id/analysis`        | ADMIN | Bản phân tích AI đã lưu (AI tự chạy nền khi khiếu nại được tạo); `data: null` nếu chưa có |
| `POST` | `/api/v1/assistant/cases/:id/analyze`         | ADMIN | Gọi LLM (GLM/Gemini theo `AI_PROVIDER`), trả gợi ý xử lý                                  |
| `POST` | `/api/v1/assistant/cases/:id/analysis/review` | ADMIN | Admin duyệt / bỏ qua. **Duyệt = áp dụng phán quyết + hình phạt + thông báo cho các bên**  |

Body của `analyze` (tuỳ chọn): `{ "skipImages": true, "maxImages": 2 }`.

## 3. Biến môi trường

| Biến                      | Mặc định                                    | Ý nghĩa                                                                                                                                                  |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_ASSISTANT_ENABLED`    | `false`                                     | Công tắc tổng. `false` ⇒ mọi lệnh analyze trả 503                                                                                                        |
| `AI_AUTO_ANALYZE`         | `true`                                      | AI tự phân tích ngay khi khiếu nại được tạo (admin chỉ đọc & duyệt). `false` ⇒ quay lại luồng bấm tay                                                    |
| `AI_PROVIDER`             | `glm`                                       | Chọn nhà cung cấp: `glm` (Zhipu) hoặc `gemini` (Google)                                                                                                  |
| `GLM_API_KEY`             | —                                           | **Bắt buộc khi `AI_PROVIDER=glm`**. Chỉ để trong `.env`, không commit                                                                                    |
| `GLM_MODEL`               | `glm-4.5-flash`                             | Model cho dữ liệu chữ (model free)                                                                                                                       |
| `GLM_VISION_MODEL`        | `glm-4.6v-flash`                            | Model nhận ảnh bằng chứng; đặt `none` để bỏ hẳn phần ảnh                                                                                                 |
| `GLM_API_BASE`            | `https://open.bigmodel.cn/api/paas/v4`      | Đổi khi dùng endpoint z.ai/khác                                                                                                                          |
| `GLM_TIMEOUT_MS`          | `120000`                                    | Timeout mỗi lượt gọi model                                                                                                                               |
| `GLM_MAX_ATTEMPTS`        | `3` (tối đa 6)                              | Số lần gọi **mỗi** model khi lỗi tạm thời (429/5xx/mạng)                                                                                                 |
| `GLM_RETRY_BASE_MS`       | `1500`                                      | Chờ giữa 2 lần thử (backoff mũ + jitter, tôn trọng `Retry-After`)                                                                                        |
| `GLM_FALLBACK_MODELS`     | `glm-4.6v-flash`                            | Model dự phòng khi model chính 1113/1211/404; `none` để tắt                                                                                              |
| `GLM_THINKING`            | `auto`                                      | `auto` = để model tự quyết; `disabled` = trả lời ngay; `enabled` = suy luận dài                                                                          |
| `GEMINI_API_KEY`          | —                                           | **Bắt buộc khi `AI_PROVIDER=gemini`**                                                                                                                    |
| `GEMINI_MODEL`            | `gemini-3.8-flash`                          | Model dùng cho cả text và vision                                                                                                                         |
| `GEMINI_API_BASE`         | `https://generativelanguage.googleapis.com` | Đổi khi Google chuyển API version                                                                                                                        |
| `GEMINI_TIMEOUT_MS`       | `120000`                                    | Timeout gọi model                                                                                                                                        |
| `AI_ASSISTANT_MAX_IMAGES` | `4` (tối đa 8)                              | Số ảnh bằng chứng gửi kèm                                                                                                                                |
| `GEMINI_MAX_ATTEMPTS`     | `3` (tối đa 6)                              | Số lần gọi **mỗi** model khi Google quá tải / 5xx                                                                                                        |
| `GEMINI_RETRY_BASE_MS`    | `1500`                                      | Chờ giữa 2 lần thử (backoff mũ + jitter, tôn trọng `Retry-After`)                                                                                        |
| `GEMINI_FALLBACK_MODELS`  | `gemini-3.6-flash,gemini-3.5-flash`         | Model dự phòng, tự chuyển khi model chính 503/429/404. Đo thật 10/2026: `2.5-flash`/`2.5-pro` trả **404** (Google khoá với tài khoản mới) nên không dùng |
| `UPLOAD_SERVICE_URL`      | —                                           | Để đổi `localhost:3010` → địa chỉ upload-service khi chạy docker                                                                                         |
| `CHAT_SERVICE_URL`        | `http://chat-service:3015`                  | Nguồn D11                                                                                                                                                |
| `DISPATCH_SERVICE_URL`    | `http://dispatch-service:3008`              | Nguồn D3                                                                                                                                                 |
| `REVIEW_SERVICE_URL`      | `http://review-service:3011`                | Nguồn D5                                                                                                                                                 |
| `PAYMENT_SERVICE_URL`     | `http://payment-service:3006`               | Nguồn D6                                                                                                                                                 |

Các biến `ORDER_/DRIVER_/MERCHANT_/CONSUMER_/WALLET_/NOTIFICATION_SERVICE_URL`
đã có sẵn cho `IntegrationService`.

> **Bảng `case_ai_analyses`:** entity được khai báo trong `config/database.config.ts`
> (`entities: [...]` — thiếu chỗ này sẽ lỗi `No metadata for "CaseAiAnalysisEntity"`).
> Ở `NODE_ENV=development`, TypeORM `synchronize` tự tạo bảng. Nếu chạy production
> (`synchronize=false`), tạo tay:
>
> ```sql
> CREATE TABLE IF NOT EXISTS case_ai_analyses (
>   id uuid PRIMARY KEY,
>   "caseId" uuid NOT NULL,
>   "caseNumber" varchar(40) NOT NULL,
>   source varchar(10) NOT NULL,
>   model varchar(80) NOT NULL,
>   verdict varchar(20) NOT NULL,
>   confidence numeric(4,3) NOT NULL,
>   payload jsonb NOT NULL,
>   "reviewDecision" varchar(10),
>   "reviewedBy" varchar(100),
>   "reviewedAt" timestamptz,
>   "reviewNote" text,
>   "createdAt" timestamptz NOT NULL DEFAULT now(),
>   "updatedAt" timestamptz NOT NULL DEFAULT now()
> );
> CREATE UNIQUE INDEX IF NOT EXISTS idx_case_ai_analyses_case_id
>   ON case_ai_analyses ("caseId");
> ```

> **⚠️ Nơi đặt biến & cách nạp:** file `.env` nằm ở **gốc monorepo** (`mythfood/.env`).
> `ConfigModule` đọc `.env` theo CWD nên `app.module.ts` đã thêm đường dẫn tuyệt đối
> trỏ về file gốc — nhờ vậy chạy `pnpm dev` trong `apps/resolution-service` vẫn thấy
> `AI_PROVIDER`/`GLM_API_KEY`. **Chạy Docker** thì biến phải được truyền qua
> `docker-compose.yml` (`environment:` của `resolution-service`), và sau khi sửa env
> phải **recreate** container: `docker compose up -d --force-recreate resolution-service`
> (chỉ `restart` sẽ dùng lại env cũ). Kiểm tra nhanh bằng `GET /assistant/health`:
> `provider`, `apiKeyEnv`, `hasApiKey`, `model`.

## 4. Nguồn dữ liệu

| ID  | Dữ liệu                      | Service                                                                                       |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------- |
| D1  | Chi tiết đơn hàng            | order                                                                                         |
| D2  | Timeline trạng thái đơn      | order                                                                                         |
| D3  | Chuyến điều phối (dispatch)  | dispatch                                                                                      |
| D4  | Vết GPS tài xế               | driver                                                                                        |
| D5  | Đánh giá của đơn             | review                                                                                        |
| D6  | Thanh toán của đơn           | payment                                                                                       |
| D7  | Chat khách ↔ tài xế          | chat (**endpoint `conversations/order/:orderId/messages` được thêm trong cùng thay đổi này**) |
| D8  | Giao dịch ví                 | wallet                                                                                        |
| D9  | Lịch sử đơn của khách        | order                                                                                         |
| D10 | Lịch sử đơn của tài xế       | order                                                                                         |
| D11 | Hồ sơ công khai tài xế       | driver                                                                                        |
| D12 | Hồ sơ nhà hàng               | merchant                                                                                      |
| D13 | Hồ sơ khách hàng             | consumer                                                                                      |
| D14 | Khiếu nại trước đó của 2 bên | resolution (nội bộ)                                                                           |

Nguồn nào lỗi/không có dữ liệu vẫn được ghi vào prompt dưới nhãn `KHÔNG CÓ`.
Danh mục nào thiếu nguồn _bắt buộc_ (khai báo trong `CASE_CONTEXT_SOURCES[].criticalFor`)
sẽ sinh thêm cảnh báo và được model yêu cầu hạ `confidence`.

## 5. Nguyên tắc an toàn

- Model chỉ được đề xuất; admin bấm nút phán quyết như cũ.
- `suggestedVerdict` / `suggestedFaultParty` / `suggestedSeverity` ngoài enum ⇒
  bị thay bằng giá trị an toàn và ghi vào `warnings`.
- Đề xuất hình phạt nhắm vào bên **không** tham gia vụ việc ⇒ bị loại bỏ.

---

## Cập nhật: ngữ cảnh mở rộng D15–D19 · ẩn danh PII · phân tích sâu

### 1. Nguồn dữ liệu mới (D15–D19)

| ID  | Nguồn                   | Endpoint                                                                                                    | Dùng để kết luận                                                          |
| --- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| D15 | Thực đơn & món đã đặt   | `GET /merchants/:id/menu?includeUnavailable=true`                                                           | So giá niêm yết ↔ giá trên đơn, món hết hàng lúc đặt, tùy chọn, ảnh chuẩn |
| D16 | Khuyến mãi & flash sale | `GET /promotions/merchant/:id`, `.../flash-sales/merchant/:id`, **`GET /promotions/usages/order/:orderId`** | Mã đã dùng, mức giảm, hạn mức/đã dùng, flash sale tồn suất                |
| D17 | Đánh giá nhà hàng       | `GET /reviews/order/:orderId`, `GET /reviews/merchant/:id?take=5`                                           | Đối chiếu đánh giá với khiếu nại, mẫu đánh giá xấu                        |
| D18 | Đánh giá tài xế         | `GET /reviews/driver/:id?take=5`                                                                            | Hành vi tài xế, mẫu đánh giá                                              |
| D19 | Hồ sơ năng lực tài xế   | **`GET /drivers/:id/analytics-profile`**                                                                    | Uy tín, mức mệt, số đơn đang giữ, thâm niên                               |

Endpoint mới chỉ **SELECT**, guard `ADMIN`/service-key, response whitelist — **không** trả PII.

### 2. Ẩn danh PII (`AI_PII_MODE=enforce` mặc định)

- Key blocklist: tên/SĐT/email/CCCD/địa chỉ/toạ độ/payment/Stripe/token.
- Pseudonym HMAC: `KH-`, `TX-`, `NH-`, `ND-`.
- Text scrub: SĐT VN, email, CCCD 12 số, STK.
- GPS: chỉ tín hiệu dẫn xuất (khoảng cách tới điểm giao, tốc độ, jump, dừng) — **không** toạ độ thô.
- `shadow` để đối chiếu trước khi bật; `off` chỉ dùng khi test.
- Panel admin hiển thị “Đã ẩn N trường PII”.

### 3. Sửa lỗi phân tích

- GPS lấy **theo đơn/cửa sổ giao** (trước đây lấy 200 điểm cũ nhất của tài xế rồi prompt cắt 25 điểm đầu).
- Thêm `<DONG_THOI_GIAN>` hợp nhất đơn/điều phối/GPS/chat/đánh giá.
- `<TIN_HIEU_GPS>` thay cho toạ độ thô.
- Nguồn D15–D19 in thẻ riêng, **không dump JSON** trong `<NGUON_DU_LIEU>`.

### 4. Output 2 tầng

- Bản ngắn giữ nguyên (summary ≤2 câu, keyFindings 5, evidenceGaps 5, riskFlags 3).
- Thêm optional: `sourceAssessment`, `detailedFindings`, `contradictions`, `timelineHighlights`, `whatWouldChangeVerdict`.
- `AI_DEEP_OUTPUT=false` để tắt.

### 5. Ảnh

- Loại ảnh: `DELIVERY_PROOF`, `REPORTER`, `RESPONDENT`, `MENU_REFERENCE`, `REVIEW`.
- Ảnh chuẩn món chỉ để đối chiếu hình dạng/bao bì; khác biệt nhỏ không đồng nghĩa sai món.

### 6. Rollout & rollback

`AI_CONTEXT_MENU|PROMO|MERCHANT_REVIEWS|DRIVER_REVIEWS|DRIVER_PROFILE`, `AI_MAX_MENU_IMAGES`, `AI_PROMPT_CHAR_BUDGET`, `AI_DEEP_OUTPUT`.
Tắt cờ ⇒ nguồn đó không gọi/không vào prompt.

### 7. Kiểm chứng

- `pnpm --filter @mythfood/resolution-service test` → **111/111**.
- Test mới: `pii-redactor`, `gps-signals`, `timeline`, `prompt-extended`.
- Tài liệu chi tiết: `docs/AI_DATA_ACCESS_MATRIX.md`.

- `confidence` bị kẹp về `[0, 1]`; `amount` / `durationDays` phải là số dương.
- Mọi câu trả lời kèm `sourcesUsed` / `sourcesMissing` / `warnings` / `usage`
  để admin biết gợi ý dựa trên dữ liệu gì.
- Google trả **503 (model quá tải)** ⇒ client tự thử lại 3 lần (backoff 1.5s → 3s → 6s,
  tôn trọng `Retry-After`) rồi tự chuyển sang model dự phòng; hết cách mới báo lỗi
  kèm gợi ý _"đợi 30–60 giây rồi bấm Phân tích lại"_ — admin không phải tự mò.
- Lỗi cấu hình (thiếu/sai key, assistant bị tắt) thì **không** thử lại: trả 503 ngay
  để biết phải sửa `.env`, không tốn thời gian chờ vô ích.
- Lỗi _nội dung_ (model trả JSON hỏng, bị chặn SAFETY) thì **không** đổi model —
  đổi model không chắc sửa được mà lại tốn thêm token.

## 6. Kiểm thử thủ công

```powershell
# 1. Trạng thái cấu hình
curl.exe -s http://localhost:3014/api/v1/assistant/health `
  -H "Authorization: Bearer $ADMIN_JWT"

# 2. Xem dữ liệu AI sẽ nhận (không tốn token)
curl.exe -s "http://localhost:3014/api/v1/assistant/cases/<CASE_ID>/context" `
  -H "Authorization: Bearer $ADMIN_JWT"

# 3. Gọi phân tích
curl.exe -s -X POST "http://localhost:3014/api/v1/assistant/cases/<CASE_ID>/analyze" `
  -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" `
  -d '{ "skipImages": false }'
```

Unit test (không cần mạng, không cần key):

```powershell
npx jest --config apps/resolution-service/jest.config.js --rootDir apps/resolution-service/src
```

## 7. Hạn chế đã biết

- Kết quả **không được lưu**: mỗi lần gọi là một lần gọi model (tốn token). Nếu
  cần audit trail, thêm bảng `case_ai_suggestions` + ghi vào timeline vụ việc.
- Ảnh bằng chứng phải là URL tải được công khai/pre-signed; ảnh lưu ở chế độ
  local trong docker cần `UPLOAD_SERVICE_URL`.
- Các danh mục gian lận cần thêm dữ liệu promo/chargeback (promotion-service)
  chưa được nối — xem ghi chú "phase 2" trong `docs/RESOLUTION_SERVICE_DESIGN.md`.
- Model + key phải được xác nhận bằng một lệnh gọi thật (`/assistant/health`
  chỉ kiểm tra cấu hình, không gọi model).
