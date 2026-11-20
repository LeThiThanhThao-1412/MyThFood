# Bộ dữ liệu đánh giá AI — IMAGE MATCHING (thiếu món / sai món)

Mục tiêu: đo được **một con số** cho câu hỏi "AI có phát hiện đúng đơn giao thiếu
món không", tách bạch _lỗi của model_ với _lỗi của ngưỡng quyết định_.

## 1. Nguyên tắc thiết kế

Thí nghiệm tách làm **2 lớp**, không hỏi model "đơn này có thiếu món không":

| Lớp  | Ai làm                                  | Đầu ra                                                                 |
| ---- | --------------------------------------- | ---------------------------------------------------------------------- |
| ĐỌC  | model vision (`glm-4.6v-flash`)         | **kiểm kê** `items[{name,quantity}]`, `countable`, `coverage`          |
| TÍNH | code, 0 token (`domain/image-match.ts`) | `matchScore` = Σ phần khớp ÷ Σ phần đặt, `verdict`, quyết định, chỉ số |

Vì sao: nếu để model trả `matchScore`, con số đó **không kiểm chứng được** (đổi
câu hỏi là đổi điểm) và mỗi lần sai không biết sửa ở đâu. Tách 2 lớp thì điểm chỉ
phụ thuộc vào việc đếm món — sửa prompt/threshold là đo được ngay tác động.

Quy ước quan trọng: **điểm là phép đếm phần, không phải độ giống ảnh**. Ảnh gần
giống nhưng thiếu 1 phần vẫn là thiếu.

## 2. Cấu trúc

```
test-data/ai-eval/
├── images/<comboId>/...            ảnh gốc (đặt tên theo quy ước bên dưới)
├── meta/combos.json                định nghĩa combo: món, số phần, đơn giá, alias
├── meta/samples.jsonl              NHÃN VÀNG sinh tự động (1 dòng = 1 mẫu)
├── meta/samples.schema.json        schema của samples.jsonl
├── meta/label-review.md            biên bản kiểm nhãn (máy + mắt)
├── meta/manifest.csv               bảng đối chiếu để mở ảnh bằng mắt
└── reports/                        báo cáo sinh ra khi chạy harness
    ├── IMAGE_MATCH_REPORT*.md      báo cáo đọc cho người
    ├── IMAGE_MATCH_REPORT*.json    dữ liệu từng mẫu + `label` (kiểm kê model trả) để tái chấm
    └── IMAGE_MATCH_THRESHOLD_SWEEP.md   bảng quét ngưỡng (0 gọi model)
```

### Quy ước tên file ảnh (bắt buộc)

| Tên file                        | Ý nghĩa                                                |
| ------------------------------- | ------------------------------------------------------ |
| `combo1_1ga1mi1khoai1nuoc.jpg`  | ảnh **CHUẨN** — đầy đủ, đúng đơn (dùng làm tham chiếu) |
| `combo1_thieu1ga.jpg`           | **THIẾU** 1 gà                                         |
| `combo1_thieu1ga1nuoc.jpg`      | **THIẾU** 1 gà + 1 nước                                |
| `combo1_sai1ga_thanh_duiga.jpg` | **SAI MÓN** — có món nhưng là món khác                 |
| `combo1_du_nghieng.jpg`         | **ĐỦ** — đủ món, chụp khác góc (đối chứng âm)          |

Script sẽ **báo lỗi** nếu tên file không theo quy ước, vì nhãn sai ⇒ mọi con số
accuracy sau đó vô nghĩa.

## 3. Cách chạy

```bash
cd apps/resolution-service

# 1) Sinh lại nhãn vàng từ tên file (không gọi mạng)
node scripts/build-image-samples.mjs            # hoặc --print để soi từng mẫu

# 1b) AUDIT nhãn: ảnh phải tồn tại, tên file phải khớp nhãn, số học + verdict khớp luật.
#     Chạy lại mỗi khi thêm/đổi tên ảnh — nhãn sai thì mọi thống kê sau đó vô nghĩa.
npm run ai:eval:labels                           # exit 1 nếu có lỗi nhãn

# 2) Tự kiểm tra harness: dựng nhãn "model hoàn hảo" từ nhãn vàng, KHÔNG gọi mạng
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --dry-run

# 3) Chạy thật (cần GLM_API_KEY, AI_ASSISTANT_ENABLED=true)
#    Harness tự đọc `.env` ở gốc monorepo (không cần export tay, không in key).
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --limit=5   # thử 5 mẫu trước
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --split=real
#    `--out` phải là file .md (file .json cùng tên được sinh tự động)
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --out=test-data/ai-eval/reports/IMAGE_MATCH_REPORT.v2.md
```

Mọi cờ nhận **cả hai dạng** `--limit=5` và `--limit 5` (`--out`, `--split`, `--report`,
`--thresholds`, `--reject`, `--partial` như nhau). Trước đây chỉ dạng `=` được hiểu ⇒
`--limit 3` bị bỏ qua **trong im lặng** và harness chạy hết 58 mẫu.

Một lượt live 58 mẫu ≈ **10–40 phút** với model free (mỗi mẫu 2 ảnh, có retry khi
`429`). Nên chạy nền và ghi log:

```powershell
Start-Process npx.cmd -ArgumentList 'ts-node','--transpile-only','src/tests/ai-eval/images/run-pairs.ts' `
  -RedirectStandardOutput 'test-data/ai-eval/reports/live.log' -PassThru -WindowStyle Hidden
```

Bước 2 phải ra **100 % đúng kết luận và MAE 0** — nếu không, lỗi nằm ở harness
hoặc hàm chấm, không phải ở model. Đây là chốt tự kiểm tra trước khi tốn quota.

### 3b. Quét ngưỡng trên dữ liệu ĐÃ chạy (0 token)

```bash
npm run ai:eval:rescore                       # quét 0.85/0.80/0.75/0.70 trên report mới nhất
npm run ai:eval:rescore -- --thresholds=0.70,0.75,0.80,0.85,0.90 --split=synthetic
npm run ai:eval:rescore -- --reject=0.95 --strict   # tự kiểm lệch ⇒ exit 1
npm run ai:eval:rescore -- --rows                  # bảng từng mẫu → reports/IMAGE_MATCH_ROWS.md
```

`--rows` in **bảng chéo nhãn vàng × kết luận chấm lại** + từng mẫu: đây là công cụ
phân loại lỗi, không phải để đọc 58 dòng bằng mắt. Khi sửa code chấm (khớp tên, cửa
chặn `UNCLEAR`…) nó cho biết **mẫu nào đổi kết luận và vì sao**, thay vì chỉ nhìn
một con số tổng đẹp lên.

Vì sao **không** chạy lại model để so ngưỡng: model vision không tất định, chạy
lại là **đổi đề thi** — hai bộ điểm không còn so sánh được. Report `.json` lưu
`label` (kiểm kê model trả), `score`, `truth` và `combos.orderItems`, nên
`rescore.ts` dựng lại điểm rồi áp ngưỡng khác trên **cùng một dữ liệu**.

Script tự kiểm: ở ngưỡng gốc của report, phân bố quyết định phải trùng mục 3 của
báo cáo gốc; lệch ⇒ cảnh báo (và `--strict` ⇒ exit 1) thay vì âm thầm in số sai.

### 3c. So hai thiết kế prompt (A/B) — `--menu`

```bash
# (A) kiểm kê MÙ: model không thấy danh sách món, code tự khớp tên
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --out=.../IMAGE_MATCH_REPORT.v2.md
# (B) có danh sách đơn: model trả thêm orderItemId ⇒ code khớp theo MÃ
npx ts-node --transpile-only src/tests/ai-eval/images/run-pairs.ts --menu --out=.../IMAGE_MATCH_REPORT.v3.md
```

Vì sao phải thử (B) chứ không sửa prompt mãi: đo live 2 lượt cho thấy sai số lớn
nhất **không** phải đếm sai mà là **lệch từ vựng** — model gọi `chè trái cây` cho
`chè thập cẩm`, `trứng chiên` cho `trứng ốp la`, `canh chua` cho `súp`. Hai tên
đúng nghĩa khác nhau, không hàm so tên nào cứu được.

Rủi ro của (B) — thứ phải **đo**, không được giả định: model thấy danh sách nên có
thể "đọc danh sách" thay vì đọc ảnh ⇒ tự nhiên thấy món thiếu ⇒ `Bỏ sót` tăng.
Vì vậy chỉ số để quyết định là **`Bỏ sót` + `Báo động sai`**, không phải `Đúng kết
luận`. Cả hai đọc trên cùng 58 mẫu, cùng nhãn vàng.

## 4. Chỉ số trong báo cáo

| Chỉ số                       | Nghĩa                                     | Đọc thế nào                                                                      |
| ---------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `Đúng kết luận`              | verdict dự đoán = verdict nhãn vàng       | thước đo chính                                                                   |
| `Báo động sai` (false alarm) | ảnh **đủ** món mà kết luận thiếu/sai      | **đắt nhất**: hoàn tiền oan, merchant mất tiền                                   |
| `Bỏ sót` (missed defect)     | ảnh **thiếu** món mà kết luận đủ          | khách mất quyền lợi                                                              |
| `MAE điểm`                   | sai số % trung bình của `matchScore`      | > 0.15 ⇒ model đếm sai số phần đáng kể                                           |
| `Quyết định tự động`         | AUTO_APPROVE / AUTO_REJECT / NEEDS_REVIEW | tỉ lệ phải chuyển người xử lý                                                    |
| `Loại khỏi chỉ số`           | mẫu mà provider bỏ ảnh / gọi model lỗi    | **không** phải phép đo: sửa hạ tầng rồi chạy lại, đừng đọc thành "model đếm kém" |

## 5. Trạng thái bộ dữ liệu (11/2026)

- **58 mẫu synthetic**: 46 thiếu món + 12 đối chứng âm (ảnh đủ), 6 combo.
- **0 mẫu "sai món"** và **0 mẫu real** — hai lỗ hổng đã biết:
  - sai món: cần ảnh chụp món khác thật (`wrongItemCatalog` trong `combos.json` đã
    sẵn sàng, chỉ thiếu ảnh);
  - real: ảnh do người dùng thật gửi, phải sửa `split: "real"` trong `samples.jsonl`
    (script ghi đè được) và **không được gộp** vào trung bình synthetic.
- Ảnh hiện là ảnh chụp lại từ catalog ⇒ **sạch hơn thực tế** (đủ sáng, không rung,
  không tay che). Con số trên bộ này là **cận trên lạc quan**.
- **Nhãn đã audit**: 58/58 mẫu hợp lệ (`npm run ai:eval:labels`), **25 ảnh đã soi
  mắt** (13 ảnh mẫu + **12/12 ảnh đối chứng âm `du_*`** + 5/6 ảnh chuẩn) — xem
  `meta/label-review.md`. 33 ảnh mẫu còn lại rủi ro thấp nhưng **chưa** được kiểm
  bằng mắt.
- **8 mẫu `combo4` (8 phần)** thiếu 1 phần ⇒ khớp 87.5 % ⇒ rơi **vùng xám**: đúng là
  thiếu món nhưng không tự duyệt được. Nhưng v4 cho thấy đơn lớn cũng là nơi model sai
  nhiều nhất (4 ca `MISSING` bị gọi `MATCH`), nên đơn > 5 phần **không bao giờ tự bác**
  (`autoRejectMaxTotalQuantity`) — đánh đổi có chủ đích, cần quyết định lại bằng ảnh
  thật (xem mục 6).
- **Lịch sử đo live trên bộ 58 mẫu** (mỗi lượt: `reports/IMAGE_MATCH_REPORT.<lượt>.json`):

  | Lượt                                             | Thay đổi                                                                                         | Đúng kết luận | MAE        | Báo động sai | Tự duyệt / tự bác / người | % tự quyết |
  | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------- | ---------- | ------------ | ------------------------- | ---------- |
  | v1                                               | prompt cũ, kiểm kê **mù**                                                                        | 0 %           | 0.622      | 11/12        | 0 / 0 / 58                | 0 %        |
  | v2                                               | prompt: dịch tên món, bỏ gia vị, định nghĩa `coverage`                                           | 22.4 %        | 0.3342     | 8/12         | 9 / 4 / 45                | 22.8 %     |
  | v3                                               | `--menu`: model thấy danh sách món, trả `orderItemId`                                            | **65.5 %**    | **0.0212** | **0/12**     | 17 / 12 / 29              | **50 %**   |
  | v3 + `--partial=warn` (phản thực trên cùng nhãn) | coi `coverage: partial` là bằng chứng                                                            | **98.3 %**    | 0.0228     | —            | 36 / 12 / 10              | **82.8 %** |
  | v4                                               | `coverage` hỏi về **khung hình** + chặn tự bác đơn > 5 phần                                      | **72.4 %**    | 0.0449     | **0/12**     | 26 / 10 / 22              | **62.1 %** |
  | v5                                               | harness **import luật prompt từ production** (`IMAGE_INVENTORY_RULES`), không còn bản luật riêng | **87.9 %**    | **0.0192** | **0/12**     | 32 / 10 / 16              | **72.4 %** |

  v4 **từng** là cấu hình tốt nhất (07/11/2026): 62.1 % tự quyết, **0 ca hoàn tiền oan,
  0 ca bác oan**. v4 phát hiện 4 ca `MISSING` bị kết luận `MATCH` (đều ở đơn 8 phần) ⇒ nếu không
  có luật chặn thì máy **bác oan 4 ca**; luật chặn đổi 4 ca đó thành "chuyển người"
  (mất ~10 điểm tự động hoá, xem `meta/label-review.md` mục 4g).

  **v5 là mốc mới** (08/11/2026) và là lượt đầu tiên đo **đúng câu lệnh container đang
  chạy** — harness bỏ bản luật riêng, `import` `IMAGE_INVENTORY_RULES` /
  `IMAGE_INVENTORY_ITEM_SCHEMA` / `IMAGE_INVENTORY_FIELDS` từ
  `src/modules/assistant/domain/assistant.prompt.ts`. Kết quả: `partial` 9 → 5,
  `countable: false` 0/58, đúng 72.4 % → **87.9 %**, MAE 0.0449 → **0.0192**, tự quyết
  vẫn **72.4 %** và **0 ca hoàn tiền oan, 0 ca bác oan**. 7 ca lệch nhãn: 6 ca `UNCLEAR`
  do cửa chặn A5 (5 ca model tự khai `partial` + 1 ca `items: []`) và 1 ca `MATCH` 100 %
  trên đơn 8 phần bị luật `autoRejectMaxTotalQuantity` giữ ở `NEEDS_REVIEW`. Chi tiết
  mục 4h của `meta/label-review.md`.

  Phân loại lỗi từng lượt + bảng từng mẫu: `meta/label-review.md` mục 4a–4h,
  `reports/IMAGE_MATCH_ROWS.<lượt>.md`, bảng quét ngưỡng
  `reports/IMAGE_MATCH_THRESHOLD_SWEEP.<lượt>.md`.

- **Kết luận thiết kế quan trọng nhất**: sai số lớn nhất **không** phải model đếm kém
  mà là **lệch từ vựng** (`chè thập cẩm` ↔ `chè trái cây`, `trứng ốp la` ↔ `trứng
chiên`, `súp` ↔ `canh chua`). Không hàm so tên nào cứu được; cho model xem danh
  sách món để nó **trỏ mã** (`--menu`) đưa MAE 0.3342 → 0.0212 và hết báo động sai.
  Rủi ro "model đọc danh sách thay vì đọc ảnh" đã đo: `Bỏ sót 0/46`.
- **`coverage: "partial"` đang chặn oan**: với khiếu nại thiếu món, ảnh khách gửi
  **luôn** có ít hơn đơn — đó là bằng chứng, không phải lý do từ chối kết luận. Đo
  phản thực: bỏ cửa chặn này ⇒ 65.5 % → 98.3 % đúng, 50 % → 82.8 % tự quyết, **không
  thêm ca sai nào**. Đã sửa câu hỏi trong prompt (hỏi về khung hình, không hỏi về số
  món so với đơn); lượt v4 xác nhận `partial` giảm 19 → 9 mẫu, lượt v5 còn **5/58**
  (và `countable: false` = 0/58 ⇒ cửa chặn `countable` **không hề** chặn oan ảnh sạch).
- **Policy phải chặn tự bác ở đơn nhiều món** (`autoRejectMaxTotalQuantity = 5`):
  v4 có 4 ca `MISSING` bị kết luận `MATCH` (toàn đơn 8 phần) — không chặn thì máy bác
  oan 4 ca. Đơn ≤ 5 phần: 12/12 `MATCH` đúng ở cả v3 và v4.
- **Ngưỡng duyệt: chốt 0.80** (mặc định trong `DEFAULT_IMAGE_MATCH_POLICY`). 0.85 và
  0.80 cho **kết quả y hệt** trên mọi lượt (không mẫu nào rơi vào (0.80, 0.85]) ⇒ chọn
  mức chặt hơn vì ảnh thật sẽ nhiễu hơn, ca nào rơi vào khe đó thì để người xem. Hạ tiếp
  0.75 thì **mất 6 ca tự duyệt đúng** (đơn 5 món thiếu 1 = 80 %) ⇒ không hạ.
  `EXTRA` luôn bị xếp `NEEDS_REVIEW` **trước khi** xét ngưỡng, nên chỉ cần model kể
  thêm một chén nước chấm là ca đó mất quyền tự quyết — đây là lý do phải sửa _cách
  liệt kê món_, không phải hạ ngưỡng.
- **`Hoàn tiền oan 0` chưa đủ để tin**: cột tiền trong bảng quét chỉ so **verdict**
  với nhãn, không so **số tiền**. Ca model đếm 2/8 phần (đúng verdict `MISSING`) vẫn
  tự duyệt nhưng danh sách "thiếu" dài hơn thực tế ⇒ hoàn quá mức; chỉ `MAE điểm` bắt
  được. Muốn đo tiền thật phải có `unitPrice` trong `combos.json` (hiện `null`).
- **Chưa có baseline trên ảnh THẬT**: cả 4 lượt đều là ảnh chụp lại từ catalog
  (đủ sáng, không rung, không tay che) ⇒ mọi con số trên là **cận trên lạc quan**.

## 6. Thí nghiệm tiếp theo (theo thứ tự)

1. ~~Nạp quota rồi chạy live để có baseline~~ → **xong 07–08/11/2026**: 5 lượt v1→v5
   (xem bảng ở mục 5). Cấu hình tốt nhất hiện tại: luật prompt **dùng chung nguồn** với
   production + `--menu` + `coverage` hỏi về khung hình + `autoRejectMaxTotalQuantity = 5`.
2. **Ảnh THẬT là việc quan trọng nhất còn lại.** Cả 5 lượt đều là ảnh chụp lại từ
   catalog (đủ sáng, không rung, không tay che). Mọi con số ở mục 5 là **cận trên**.
   Cần 10–20 ảnh khách gửi thật (`split: "real"`), gồm cả ảnh chụp thiếu sáng/nhiều
   hộp, rồi chạy `--split=real`.
3. **Ảnh "sai món"** (0 mẫu hiện tại) — nhóm duy nhất chưa đo được. `wrongItemCatalog`
   trong `combos.json` đã sẵn sàng, chỉ thiếu ảnh. Đây cũng là nhóm dễ gây
   `hoàn tiền oan` nhất.
4. **Đo tiền thật**: điền `unitPrice` vào `combos.json` để `Hoàn tiền oan`/`Bỏ sót
tiền`/`refundCap` có số. Hiện để `null` nên bảng quét chỉ so **verdict**, không so
   **số tiền** — ca "verdict đúng mà hoàn quá mức" chỉ lộ ra qua `MAE điểm`.
5. **Nhiễu giữa các lượt**: mỗi lượt bị `429` nên có 1–3 model trong cùng báo cáo
   (v4 gọi `glm-4.6v-flash` rồi `glm-4.6v-flashx`; v5: 50 mẫu `flash` + 8 mẫu `flashx`,
   0 mẫu bị loại khỏi chỉ số). Đừng so hai lượt như hai phép đo sạch; muốn so công bằng
   thì chấm lại `label` bằng `--rows` hoặc cố định `model`.
6. **Đã đưa vào production (F2/P6 trong `docs/AI_ASSISTANT_SYNTHETIC_DATA_PLAN.md`)** —
   làm xong 08/11/2026, chạy ở chế độ `shadow`:
   - luật prompt + item schema **dùng chung một nguồn**: `IMAGE_INVENTORY_RULES` /
     `IMAGE_INVENTORY_ITEM_SCHEMA` / `IMAGE_INVENTORY_FIELDS` trong
     `src/modules/assistant/domain/assistant.prompt.ts`. Harness
     (`run-pairs.ts`) **import** từ đó, không còn bản luật riêng ⇒ hết cảnh
     "đo một đằng, chạy một nẻo". Sửa luật = sửa một chỗ (test parity trong
     `assistant.spec.ts` canh việc này).
   - `AI_IMAGE_SCHEMA` + `AiImageFindings` có `items[{name,quantity,orderItemId}]`,
     `boxes`, `countable`, `sealed`, `coverage` ở **cả hai bên ảnh** (không nằm
     trong `required` ⇒ schema cũ vẫn hợp lệ).
   - mã dòng ở production là `#1..#n` theo **thứ tự dòng đơn** (không dùng
     `menuItemId`: có thể null và có thể trùng khi cùng món đặt 2 dòng khác
     options); harness dùng `menuItemId` của combo — cả hai chỉ là "mã dòng".
   - `applyImageMatchScoring` chạy **ngay sau lượt đọc ảnh, trước lượt chữ**:
     `AI_IMAGE_MATCH_SCORING=off|shadow|on` (mặc định **`on`** từ 08/11/2026 ⇒ code
     được ghi đè kết luận khi điểm rơi vào vùng `AUTO_*`, và vẫn tôn trọng
     `autoRejectMaxTotalQuantity`; `shadow` giữ lại để đo lại trên dữ liệu mới).
   - Từ 08/11/2026, sự cố món ăn còn chạy thêm **ghép cặp ảnh** ([ảnh thực đơn của
     quán] ↔ [ảnh khách chụp], `AI_IMAGE_PAIRWISE=on`): mỗi cặp là một lượt gọi
     vision riêng, trả `sameDish` + `similarityPercent` + số phần; code gộp lại
     (số phần lấy **MAX** theo món, không cộng) rồi mới chấm điểm. Xem
     `docs/AI_MISSING_ITEM_EVALUATION.md`.
   - **Việc còn lại**: đo lại trên dữ liệu thật để phát hiện kiểu hỏng mới
     (`countable=false` hàng loạt, `items=[]`, model bịa món theo danh sách) bằng
     `AI_IMAGE_MATCH_SCORING=shadow` + `AI_IMAGE_PAIRWISE=off` nếu cần so sánh;
     giữ `EXTRA ⇒ NEEDS_REVIEW` và luật chặn tự bác; **không** hạ ngưỡng để tăng
     tự động hoá.
