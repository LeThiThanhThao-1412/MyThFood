# Biên bản kiểm nhãn vàng

Nhãn trong `samples.jsonl` **không phải gõ tay** — chúng được sinh từ tên file ảnh
(`scripts/build-image-samples.mjs`). Nghĩa là nhãn chỉ đúng nếu (a) tên file đúng
quy ước _và_ (b) tên file mô tả đúng nội dung ảnh. Việc (a) kiểm được bằng máy,
việc (b) chỉ kiểm được bằng mắt — biên bản này ghi lại (b).

## 1. Kiểm bằng máy — `npm run ai:eval:labels`

`scripts/verify-image-labels.mjs` đối chiếu 4 nguồn độc lập với generator:

| Kiểm                                                  | Bắt được lỗi gì                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| file ảnh có thật (`claimImage`, `standardImage`)      | nhãn trỏ tới ảnh đã xoá/đổi tên                                        |
| tên file ↔ `missing`/`extra` của nhãn (qua `aliases`) | gõ sai nhãn: tên nói thiếu 1 gà, nhãn ghi thiếu 1 nước                 |
| số học `matchedQuantity`, `matchScore`                | nhãn lệch điểm so với luật chấm                                        |
| thứ tự luật verdict của `compareInventory`            | có món lạ mà nhãn ghi `MISSING` thay vì `EXTRA`                        |
| ảnh mồ côi / ảnh dùng 2 lần / `sampleId` trùng        | mẫu bị bỏ quên hoặc bị tính 2 lần vào accuracy                         |
| ảnh CHUẨN: token + phần chữ dư trong tên              | ảnh chuẩn thiếu món sẽ làm **mọi** mẫu của combo lệch một cách vô hình |

Kết quả 07/11/2026: **58/58 mẫu hợp lệ, 0 lỗi**, 6 cảnh báo (đều là "combo chưa có
mẫu sai món" — thiếu ảnh, không phải lỗi nhãn).

## 2. Kiểm bằng mắt — 25/58 ảnh + 5/6 ảnh chuẩn + **12/12 ảnh đối chứng âm**

Người kiểm: phiên làm việc 07/11/2026 (đọc trực tiếp file ảnh, đối chiếu
`meta/combos.json`).

| Ảnh                                            | Nhãn nói                                                                 | Nhìn thấy trong ảnh                 | Kết luận |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------- | -------- |
| `combo1_1ga1mi1khoai1nuoc` (chuẩn)             | 1 gà + 1 mì + 1 khoai + 1 nước                                           | đúng 4 món, 1 miếng gà              | khớp     |
| `combo1_thieu1ga`                              | thiếu 1 gà                                                               | mì + khoai + nước, **không có gà**  | khớp     |
| `combo2_1hambuger1nuoc1khoai` (chuẩn)          | 1 burger + 1 nước + 1 khoai                                              | đúng 3 món                          | khớp     |
| `combo2_thieu1hambuger`                        | thiếu 1 burger                                                           | chỉ nước + khoai                    | khớp     |
| `combo3_1banhtrangtron1cavien2trasua` (chuẩn)  | 1 bánh tráng + 1 cá viên + **2** trà sữa                                 | đúng **2** ly trân châu             | khớp     |
| `combo3_thieu1trasua`                          | thiếu 1 trà sữa                                                          | còn **1** ly                        | khớp     |
| `combo3_thieu2trasua`                          | thiếu 2 trà sữa                                                          | còn **0** ly                        | khớp     |
| `combo4_…8 món…` (chuẩn)                       | bún lá, đậu hũ, thịt luộc, chả cốm, nem chua rán, lòng dồi, rau, mắm tôm | đủ **8/8** món                      | khớp     |
| `combo4_thieu1bunla1nemchuaran`                | thiếu bún lá + nem chua rán                                              | không có bún, không có nem chua rán | khớp     |
| `combo4_thieu1longdoi1rau`                     | thiếu lòng dồi + rau                                                     | không có lòng dồi, không có rau     | khớp     |
| `combo5_thieu1trungopla1nuoc`                  | thiếu trứng ốp la + nước (alias của trà đá)                              | không có trứng, không có ly nước    | khớp     |
| `combo6_2chethapcam1diatraicay2tradau` (chuẩn) | **2** chè + 1 đĩa trái cây + **2** trà dâu                               | đúng 2 bát chè, 2 ly trà dâu        | khớp     |
| `combo6_thieu1chethapcam`                      | thiếu 1 chè                                                              | còn **1** bát chè                   | khớp     |

### 2b. Nhóm đối chứng âm `du_nghieng` / `du_toi` (soi 12/12)

Đây là nhóm **đắt nhất nếu nhãn sai**: ảnh được ghi là "ĐỦ" mà thực ra thiếu món
thì mọi kết luận "thiếu món" đúng của model sẽ bị tính thành _báo động sai_ — tức
ta tự tạo ra vẻ ngoài "AI hoàn tiền oan" rồi đi sửa prompt vô ích.

| Ảnh                 | Nhãn nói                                     | Nhìn thấy trong ảnh                                                                 | Kết luận |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| `combo1_du_nghieng` | đủ: gà + mì + khoai + nước                   | 1 đùi gà rán, 1 đĩa mì ý, 1 hộp khoai, 1 ly nước                                    | khớp     |
| `combo1_du_toi`     | đủ 4 món                                     | như trên, ánh sáng tối                                                              | khớp     |
| `combo2_du_nghieng` | đủ: burger + nước + khoai                    | đúng 3 món                                                                          | khớp     |
| `combo2_du_toi`     | đủ 3 món                                     | đúng 3 món, nền xám                                                                 | khớp     |
| `combo3_du_nghieng` | đủ: bánh tráng + cá viên + **2** trà sữa     | 1 hộp bánh tráng trộn, 1 khay cá viên, **2** ly trà sữa                             | khớp     |
| `combo3_du_toi`     | đủ 3 dòng / 4 phần                           | như trên, tối hơn                                                                   | khớp     |
| `combo4_du_nghieng` | đủ **8** món bún đậu                         | bún lá, đậu hũ chiên, thịt luộc, chả cốm, nem chua rán, lòng dồi, rau sống, mắm tôm | khớp     |
| `combo4_du_toi`     | đủ 8 món                                     | đủ **8/8**, góc chụp sát hơn                                                        | khớp     |
| `combo5_du_nghieng` | đủ: cơm + sườn + trứng + súp + trà đá        | đúng 5 món (có thêm bát nước chấm nhỏ)                                              | khớp     |
| `combo5_du_toi`     | đủ 5 món                                     | như trên                                                                            | khớp     |
| `combo6_du_nghieng` | đủ: **2** chè + đĩa trái cây + **2** trà dâu | đúng 2 bát chè, 1 đĩa trái cây, **2** ly trà dâu                                    | khớp     |
| `combo6_du_toi`     | đủ 5 phần                                    | như trên                                                                            | khớp     |

Kết quả: **12/12 khớp nhãn**. Nhóm `COMPLETE` (12 đối chứng âm) nay đã được kiểm
bằng mắt **toàn bộ** ⇒ cột _báo động sai_ của lần chạy live đầu tiên là đáng tin
(xem tiếp mục 2c về rủi ro "món phụ" bị model khai báo thừa).

### 2c. Rủi ro nhìn thấy khi soi ảnh (KHÔNG phải lỗi nhãn)

Các ảnh "đủ" có **món phụ/thành phần** mà model vision rất dễ khai báo thành món
riêng: lát xúc xích trên đĩa mì ý (combo1), chả giò + xúc xích trong khay cá viên
(combo3), trứng cút trên bánh tráng trộn (combo3), bát nước chấm (combo5). Hệ quả
dự đoán: `verdict = EXTRA` ⇒ `decideImageMatch` đẩy sang **NEEDS_REVIEW** — không
phải hoàn tiền oan, nhưng **mất tự động**. Đây là giả thuyết cần số liệu live để
xác nhận, không được sửa nhãn để "khớp" với model.

Ưu tiên soi các ca **dễ sinh nhãn sai**: đếm số phần > 1 (trà sữa ×2, chè ×2, trà
dâu ×2) và combo nhiều món (combo4). Các ca `thieu1<1 món>` một phần thì rủi ro
thấp hơn nhiều.

## 3. Còn lại và rủi ro đã biết

- **33/58 ảnh chưa soi mắt**, **1 ảnh chuẩn chưa soi** (`combo5_1com1suon1trungopla1sup1trada`).
  Rủi ro thấp (đều là ca 1 món bị bỏ) nhưng **chưa được chứng minh**, không được
  coi là đã kiểm.
- ~~Nhóm `du_nghieng` / `du_toi` chưa soi~~ → **đã soi 12/12 ngày 07/11/2026** (mục 2b).
- Tên ảnh chuẩn combo4 có tiền tố mô tả `bundaumamtomgom` mà generator **không
  đọc** — audit chỉ cảnh báo, không xác nhận. Đã bù bằng mắt (mục 2): ảnh đủ 8 món.
- Ảnh thật (`split: "real"`) chưa có ⇒ nhãn hiện chỉ đúng cho ảnh catalog sạch.

## 4. Nhật ký chạy LIVE (gọi model thật)

| Ngày               | Kết quả                                                                                                                                                                                         | Bằng chứng                                                                                 |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 07/11/2026 (sáng)  | **Không đo được mẫu nào** — tài khoản GLM báo `429/1305` (quá tải) cho `glm-4.6v-flash`, rồi `429/1113` (không có gói/quota) cho model dự phòng `glm-4.6v-flashx` và `glm-4.5v`                 | `reports/IMAGE_MATCH_REPORT.smoke.md` mục 4                                                |
| 07/11/2026 (chiều) | **BASELINE v1 — đo được 58/58 mẫu** (sau khi nạp quota). `Đúng kết luận` **0 %** · MAE **0.622** · `Báo động sai` **11/12 = 91.7 %** · `Bỏ sót` 0 % · quyết định **0 duyệt / 0 bác / 58 người** | `reports/IMAGE_MATCH_REPORT.baseline1.json` · bảng từng mẫu: `reports/IMAGE_MATCH_ROWS.md` |

### 4a. Baseline v1 đọc ra được gì (quan trọng hơn con số 0 %)

Model dự phòng bị gọi xen vào (`glm-4.6v-flash` 11 mẫu, `glm-4.6v-flashx` 47 mẫu)
do `429/1305` — **hai model trong cùng một báo cáo**, đừng coi là một phép đo sạch.

Phân loại 58 mẫu theo nguyên nhân (số đếm từ `label` lưu trong report):

| Nhóm                                    | Số mẫu | Nguyên nhân thật                                                                                                                   |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `UNCLEAR` vì `coverage: "partial"`      | **35** | model tự khai "ảnh chỉ bày một phần đơn" gần như mặc định ⇒ code chặn đúng luật nhưng **không có gì để chấm**                      |
| `UNCLEAR` vì `items: []`                | 1      | `MIS-combo3-thieu1banhtrangtron` — model không thấy món nào                                                                        |
| `EXTRA` vì **tên khác ngôn ngữ**        | 5      | model ghi `spaghetti`, `fries`, `soda`, `drinks`, `cucumber` trong khi đơn ghi `mì ý`, `khoai tây chiên`, `nước ngọt`, `dưa chuột` |
| `EXTRA` vì **liệt kê đồ ăn kèm/gia vị** | ~10    | `dầu hào`, `cà chua`, `dưa chuột`, `tỏi`, `trái cây`, `canh chua`, `gỏi cuốn`… không nằm trong đơn ⇒ thành "món lạ"                |
| `EXTRA` vì **đếm thiếu**                | ~7     | ảnh có 7–8 món, model chỉ liệt kê 3–5 (combo4, combo5)                                                                             |

Hai kết luận không thể rút ra từ chỉ số tổng:

1. **`Báo động sai 91.7 %` không phải "model nhìn kém"** — 12 ảnh đối chứng âm đều
   đủ món; model đếm **đúng** nhưng ghi tên/đồ ăn kèm khác cách gọi của đơn, và code
   cũ biến "không hiểu tên" thành `EXTRA` + "nghi đóng gói nhầm phía quán". Đây là
   **cáo buộc sai do lỗi từ vựng**, cùng họ với lỗi provider bỏ ảnh ở trên.
2. **`0 % tự quyết` mới là con số vận hành**: 58/58 ca phải chuyển người, tức hệ
   thống chưa tiết kiệm được gì. `Báo động sai 0 %` trên một báo cáo khác có thể chỉ
   nghĩa là máy **không dám quyết ca nào** — xem cột `% tự quyết` trong bảng quét ngưỡng.

### 4b. Sửa gì sau baseline v1 (đo lại được **0 token** trên chính 58 nhãn)

| Sửa                                                                                | File                | Đo lại trên 58 nhãn cũ                                             |
| ---------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Không khớp được **một dòng nào** ⇒ `UNCLEAR` (lỗi từ vựng), không còn `EXTRA`      | `item-inventory.ts` | hết 5 ca `EXTRA` do tên tiếng Anh; MAE 0.622 → **0.4282**          |
| Khớp **tên chung** khi duy nhất (`"bún"` ⊂ `"bún lá"`, `"đậu"` ⊂ `"đậu hũ chiên"`) | `item-inventory.ts` | combo4: `2/8` → `6/8` phần khớp ở các ca trước đây bị coi là thiếu |
| Chặn `--out` không phải `.md` (trước đó ghi markdown đè lên `.json`)               | `run-pairs.ts`      | —                                                                  |
| `--rows` in bảng từng mẫu + bảng chéo nhãn × kết luận                              | `rescore.ts`        | dùng để phân loại lỗi ở mục 4a                                     |

`reports/IMAGE_MATCH_THRESHOLD_SWEEP.md` mục 4 sẽ **cảnh báo tự kiểm lệch** khi quét
lại report cũ: đúng như thiết kế — report v1 lưu quyết định của **code cũ**, còn bảng
quét dùng **code hiện tại**. Muốn so sạch thì chạy live lại rồi mới quét.

⇒ Còn lại (chưa sửa, chờ lượt live v2 có prompt mới): `coverage: partial` 35 mẫu,
đồ ăn kèm bị liệt kê thành món, đếm thiếu trên ảnh nhiều món.

### 4c. Lượt live v2 — sửa prompt (dịch tên món · bỏ gia vị · định nghĩa `coverage`)

58/58 đo được, `reports/IMAGE_MATCH_REPORT.v2.json`, bảng từng mẫu
`reports/IMAGE_MATCH_ROWS.v2.md`. Model: `glm-4.6v-flashx` 50 · `glm-4.6v-flash` 7 ·
`glm-4.5-flash` 1 (vẫn bị `429` nên **3 model trong một báo cáo**).

| Chỉ số                           | v1 (mù + prompt cũ) | v2 (mù + prompt mới) |
| -------------------------------- | ------------------- | -------------------- |
| Đúng kết luận                    | 0 %                 | **22.4 %**           |
| MAE điểm                         | 0.622               | **0.3342**           |
| Báo động sai (12 ảnh đủ món)     | 11/12               | **8/12**             |
| Tự duyệt / tự bác / chuyển người | 0 / 0 / 58          | **9 / 4 / 45**       |
| `coverage: all_items`            | 22                  | **41**               |
| Điểm chấm được                   | 22                  | **38**               |

Prompt mới làm đúng hai việc: (a) hết `coverage: "partial"` mặc định (36 → 16 mẫu),
(b) model dịch tên món (`mì Ý`, `khoai tây chiên`, `nước ngọt`) nên combo1/2 khớp
được. Quét ngưỡng: 85/80/75 cho **cùng** kết quả (9 duyệt / 4 bác / 44 người, tự
quyết 22.8 %, hoàn tiền oan 0, bỏ sót 0); 70 % chỉ còn 5 duyệt (tự quyết 15.8 %).

Cái **còn lại** — và đây là lý do phải đổi thiết kế, không phải sửa prompt thêm:

| Nhóm còn sai                         | Ví dụ thật trong report                                                                                                   | Bản chất                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Lệch **từ vựng** giữa ảnh và đơn     | đơn `chè thập cẩm` ↔ model ghi `chè trái cây`; `trứng ốp la` ↔ `trứng chiên`; `súp` ↔ `canh chua`; `trà đá` ↔ `nước ngọt` | **không** hàm so tên nào cứu được: hai tên đúng nghĩa khác nhau                                                                 |
| Model gọi món **không có trong đơn** | `mì ống`, `lạp xưởng`/`sosis`, `chả giò`, `nem rán`, `thịt nướng`, `dưa chuột`, `nước chấm` (combo4)                      | thành `EXTRA` ⇒ **tắt tự động hoá** của ca đó                                                                                   |
| **Đếm thiếu** trên đơn 8 món         | `MIS-combo4-thieu1bunla1longdoi`: khớp 2/8 trong khi nhãn vàng 6/8                                                        | nguy hiểm **về tiền**: verdict `MISSING` đúng nên máy tự duyệt, nhưng danh sách "thiếu" dài hơn thực tế ⇒ **hoàn tiền quá mức** |
| `coverage: partial` còn 16           | combo1/2/3/6 ở các ca chụp 2 món                                                                                          | chặn đúng luật, nhưng vẫn là mất tự động hoá                                                                                    |

Bài học về chỉ số: `Hoàn tiền oan 0` và `Bỏ sót 0` ở bảng quét ngưỡng **không** bắt
được ca "verdict đúng mà số tiền sai" — nó chỉ so verdict với nhãn. Ca 2/8 nói trên
lộ ra ở `MAE điểm` (0.3342), không lộ ở cột tiền. Muốn đo tiền thì phải có `unitPrice`
trong `combos.json` (hiện để `null` cho khỏi bịa giá) ⇒ việc của lần bổ sung dữ liệu sau.

### 4d. Đo phản thực: nếu coi `coverage: "partial"` là bằng chứng hợp lệ

`npm run ai:eval:rescore -- --report=.../IMAGE_MATCH_REPORT.v2.json --partial=warn`
(chấm lại **cùng 57 nhãn**, 0 token):

|                                  | cửa chặn `partial` (hiện tại) | coi `partial` là bằng chứng |
| -------------------------------- | ----------------------------- | --------------------------- |
| Tự duyệt / tự bác / chuyển người | 9 / 4 / 44                    | **19 / 4 / 34**             |
| % tự quyết                       | 22.8 %                        | **40.4 %**                  |
| Đúng kết luận                    | 22.8 %                        | **40.4 %**                  |
| Hoàn tiền oan · Bỏ sót tiền      | 0 · 0                         | **0 · 0**                   |
| MAE điểm                         | 0.3342                        | **0.2735**                  |

Đọc ra: cửa chặn `partial` đang **tắt tự động hoá của 10 ca đúng** mà không đổi lấy
được an toàn nào (hoàn tiền oan vẫn 0). Nguyên nhân gốc là **câu hỏi đang đặt sai**:
`coverage` hiện được hỏi như "ảnh có bày trọn ĐƠN không", trong khi với khiếu nại thiếu
món thì ảnh khách gửi **luôn** có ít hơn đơn — đó chính là bằng chứng, không phải lý do
để từ chối kết luận. Trong 58 ảnh thì 100 % là ảnh chụp **trọn những gì khách nhận**
(model gọi `partial` nghĩa là "ít hơn đơn").

⇒ Việc cần làm (đã ghi vào mục 6 của README): đổi `coverage` thành câu hỏi về **khung
hình** ("có hộp/món nào bị cắt mất hoặc bị che không thấy trọn?"), chứ không phải câu
hỏi về **số lượng so với đơn**. Chỉ khi đó mới dùng nó làm cửa chặn.

### 4e. Hai lỗi harness phát hiện trong lúc đo (đã sửa)

1. **`.json` và `.md` cùng lượt chạy ghi hai con số khác nhau**: `.md` tính chỉ số trên
   mẫu đo được, `.json` lại tính trên **tất cả** dòng ⇒ v2 ghi `all.samples = 58` trong
   khi chỉ 57 mẫu là phép đo (`MIS-combo5-thieu1trungopla1nuoc` bị `finish_reason=length`,
   GLM trả 12 075 ký tự không phải JSON). Nay cả hai dùng `metricsOf(measured)`.
2. **`--out` nhận `.json` rồi ghi markdown đè lên JSON**: gọi
   `--out=.../IMAGE_MATCH_REPORT.live.json` thì markdown được ghi vào file `.json`,
   sau đó JSON ghi đè ⇒ **mất báo cáo markdown, không có cảnh báo**. Nay `--out`
   bắt buộc là `.md` (file `.json` sinh tự động cùng tên).

### 4f. Lượt live v3 — cho model xem DANH SÁCH MÓN (`--menu`, trả `orderItemId`)

58/58 đo được (0 mẫu lỗi), `reports/IMAGE_MATCH_REPORT.v3.json`, bảng từng mẫu
`reports/IMAGE_MATCH_ROWS.v3.md`. Prompt giống v2 + danh sách món kèm mã.

| Chỉ số                               | v1 (mù, prompt cũ) | v2 (mù, prompt mới) | **v3 (`--menu`)** |
| ------------------------------------ | ------------------ | ------------------- | ----------------- |
| Đúng kết luận                        | 0 %                | 22.4 %              | **65.5 %**        |
| MAE điểm                             | 0.622              | 0.3342              | **0.0212**        |
| Trong dung sai 15 %                  | 0 %                | 28.95 %             | **97.4 %**        |
| Báo động sai (12 ảnh đủ món)         | 11/12              | 8/12                | **0/12**          |
| Bỏ sót                               | 0 %                | 0 %                 | 0 %               |
| Tự duyệt / tự bác / chuyển người     | 0 / 0 / 58         | 9 / 4 / 45          | **17 / 12 / 29**  |
| % tự quyết                           | 0 %                | 22.8 %              | **50 %**          |
| Kết luận `MATCH` đúng trên 12 ảnh đủ | 0                  | 4                   | **12/12**         |

Vì sao `--menu` đổi mọi thứ: model không còn phải _dịch_ tên món sang cách gọi
của quán. Nó đếm 4 hộp rồi trỏ `orderItemId = eval-combo4-bunla`; code khớp theo
mã nên `chè thập cẩm` ↔ `chè trái cây` không còn là vấn đề. Bằng chứng trong
report: các dòng từng sai vì từ vựng nay có tên khớp chính xác thực đơn
(`hamburger bò`, `cá viên chiên`, `chè thập cẩm`, `trà dâu`).

**Rủi ro của `--menu` đã được đo, không phải suy đoán**: model thấy danh sách nên
có thể "đọc danh sách" thay vì đọc ảnh ⇒ `Bỏ sót` tăng. Số đo: `Bỏ sót 0/46`, tức
model **không** bịa ra món thiếu. Nhưng đây là ảnh catalog sạch — phải đo lại trên
ảnh thật trước khi tin.

**Ngưỡng cuối cùng đã phân biệt được** (trên v3, cùng dữ liệu):

| Duyệt khi ≤ | Duyệt tự động | Chuyển người | % tự quyết | Hoàn tiền oan | Bỏ sót tiền |
| ----------- | ------------- | ------------ | ---------- | ------------- | ----------- |
| 85 %        | 17            | 29           | 50.0 %     | 0             | 0           |
| 80 %        | 17            | 29           | 50.0 %     | 0             | 0           |
| 75 %        | 11            | 35           | 39.7 %     | 0             | 0           |
| 70 %        | 5             | 41           | 29.3 %     | 0             | 0           |

⇒ 0.85 và 0.80 **vẫn** y hệt (không mẫu nào rơi vào (0.80, 0.85]), nhưng **0.80 vs
0.75 đã khác**: hạ xuống 75 % mất 6 ca tự duyệt đúng (các đơn 5 món thiếu 1 ⇒ 80 %).
Trên bộ này **0.80 là lựa chọn tốt nhất** — không mất ca nào, giữ nguyên an toàn.

Còn lại 19 mẫu `UNCLEAR`, **tất cả** vì `coverage: "partial"` (combo1/2/3/6 ở các
ảnh chỉ có 2 món). Chấm lại phản thực trên đúng bộ nhãn v3 với `--partial=warn`:

|                                  | v3 (cửa chặn `partial`) | v3 + `partial` là bằng chứng |
| -------------------------------- | ----------------------- | ---------------------------- |
| Đúng kết luận                    | 65.5 %                  | **98.3 %**                   |
| Tự duyệt / tự bác / chuyển người | 17 / 12 / 29            | **36 / 12 / 10**             |
| % tự quyết                       | 50.0 %                  | **82.8 %**                   |
| Hoàn tiền oan · Bỏ sót tiền      | 0 · 0                   | **0 · 0**                    |
| MAE điểm                         | 0.0212                  | 0.0228                       |

Tức là: **50 % → 82.8 % tự động hoá, 65.5 % → 98.3 % đúng, không thêm ca sai nào** —
chỉ bằng cách hỏi `coverage` đúng câu (xem 4d). Đó là nội dung lượt live v4.

Ghi chú về rủi ro lạm dụng mà cửa chặn `partial` từng chặn: khách chụp mỗi 1 hộp
trong đơn 4 rồi nói thiếu ⇒ máy kết luận thiếu 3. Trong production việc này do
**ảnh giao hàng của tài xế** (túi niêm phong, đủ số hộp) chặn, không phải `coverage`
— nên bỏ cửa chặn này không mở lỗ hổng mới, miễn là luồng ảnh giao hàng còn đó.

### 4g. Lượt live v4 — `coverage` hỏi về KHUNG HÌNH + luật chặn tự bác đơn nhiều món

58/58 đo được, `reports/IMAGE_MATCH_REPORT.v4.json`, bảng từng mẫu
`reports/IMAGE_MATCH_ROWS.v4.md`. Prompt = v3; chỉ đổi câu hỏi `coverage` (hỏi "có
hộp nào bị cắt/che khỏi khung không", không hỏi "ảnh có bày trọn đơn không").

| Chỉ số                           | v3           | **v4**           |
| -------------------------------- | ------------ | ---------------- |
| `coverage: all_items`            | 39           | **49**           |
| `coverage: partial`              | 19           | **9**            |
| Đúng kết luận                    | 65.5 %       | **72.4 %**       |
| MAE điểm                         | 0.0212       | 0.0449           |
| Báo động sai (12 ảnh đủ)         | 0/12         | **0/12**         |
| **Bỏ sót (46 ảnh thiếu)**        | 0 %          | **8.7 % (4/46)** |
| Tự duyệt / tự bác / chuyển người | 17 / 12 / 29 | 26 / 16 / 16     |

Sửa câu hỏi `coverage` đúng là đòn bẩy: 19 → 9 mẫu bị chặn, tự quyết 50 % → 72.4 %.
**Nhưng nó lộ ra một lỗi mới, đúng loại lỗi mà harness sinh ra để bắt**: 4 ca
`MISSING` bị kết luận `MATCH` (đếm đủ 8/8 trong khi ảnh thiếu 1) ⇒ máy **bác claim
của khách**. Cả 4 đều ở **combo4 — đơn 8 phần (khay bún đậu)**; đơn ≤ 5 phần vẫn
12/12 `MATCH` đúng. Nguyên nhân: model nhìn thấy danh sách món nên có lúc "đếm theo
danh sách" — đúng rủi ro đã ghi ở mục 3c của README, giờ có số.

⇒ Đã thêm luật vào policy (`image-match.ts`):
`autoRejectMaxTotalQuantity = 5` — **chỉ tự bác khi đơn ≤ 5 phần**, đơn nhiều hơn
chuyển người. Đo lại trên cùng nhãn v3/v4 (0 token):

|                  | trước luật chặn | sau luật chặn |
| ---------------- | --------------- | ------------- |
| v4 — bỏ sót tiền | 4 ca            | **0 ca**      |
| v4 — tự bác      | 16              | **10**        |
| v4 — % tự quyết  | 72.4 %          | **62.1 %**    |
| v3 — bỏ sót tiền | 0               | 0             |
| v3 — % tự quyết  | 50.0 %          | 46.6 %        |

Đánh đổi: mất ~10 điểm tự động hoá để **không bác oan ca nào**. Theo nguyên tắc
"bác sai đắt hơn để người xem" thì đây là hướng đúng, và con số này là _cận dưới_
của tự động hoá trên ảnh sạch — ảnh thật sẽ thấp hơn.

### 4h. Lượt live v5 — luật prompt **dùng chung nguồn** với production

58/58 đo được, `reports/IMAGE_MATCH_REPORT.v5.json`, bảng từng mẫu
`reports/IMAGE_MATCH_ROWS.v5.md`, quét ngưỡng `reports/IMAGE_MATCH_THRESHOLD_SWEEP.v5.md`.

Khác biệt so với v4 **không phải** prompt mới: harness bỏ bản luật riêng và **import**
`IMAGE_INVENTORY_RULES` / `IMAGE_INVENTORY_ITEM_SCHEMA` / `IMAGE_INVENTORY_FIELDS` từ
`src/modules/assistant/domain/assistant.prompt.ts`. Nghĩa là lượt này đo **đúng câu
lệnh mà container đang chạy** — trước đây harness và production là hai bản luật na ná
nhau, sửa một bên là số liệu hết giá trị.

| Chỉ số                           | v3           | v4                                         | **v5**              |
| -------------------------------- | ------------ | ------------------------------------------ | ------------------- |
| `coverage: all_items`            | 39           | 49                                         | **53**              |
| `coverage: partial`              | 19           | 9                                          | **5**               |
| `countable: false`               | —            | —                                          | **0/58**            |
| Chấm được điểm                   | 49           | 49                                         | **52/58**           |
| Đúng kết luận                    | 65.5 %       | 72.4 %                                     | **87.9 %**          |
| MAE điểm                         | 0.0212       | 0.0449                                     | **0.0192**          |
| Báo động sai (12 ảnh đủ)         | 0/12         | 0/12                                       | **0/12**            |
| Bỏ sót (46 ảnh thiếu)            | 0 %          | 8.7 %                                      | **2.2 % (1/46)**    |
| Tự duyệt / tự bác / chuyển người | 17 / 12 / 29 | 26 / 16 / 16 (sau luật chặn: 26 / 10 / 22) | **32 / 10 / 16**    |
| % tự quyết                       | 50 %         | 62.1 %                                     | **72.4 %**          |
| Model thực gọi                   | flash        | flash + flashx                             | flash 50 + flashx 8 |

7 ca lệch nhãn vàng chia làm hai loại, **không loại nào gây quyết định sai**:

1. **6 ca `UNCLEAR`** (điểm `null`, không chấm): 5 ca model tự khai
   `coverage: partial` ⇒ code từ chối kết luận; 1 ca `items: []` + `countable: true`
   (`MIS-combo4-thieu1bunla1longdoi`) ⇒ kiểm kê rỗng không giải thích được ⇒ chuyển
   người. Đây là **cửa chặn A5 hoạt động đúng**, không phải model đếm kém: ảnh thiếu
   món trông rất giống ảnh "chỉ bày một phần", và code chọn "thà chuyển người".
2. **1 ca `MIS-combo4-thieu1dauhuchien` kết luận `MATCH` 100 %** trong khi nhãn là
   `MISSING` 87.5 % (model kể có đậu hũ chiên). Đơn 8 phần ⇒ **luật
   `autoRejectMaxTotalQuantity = 5` chặn thành `NEEDS_REVIEW`** ⇒ vẫn 0 ca bác oan.
   Đây là bằng chứng thứ hai rằng luật chặn ở 4g là cần thiết, không phải phòng xa.

⇒ **Trạng thái tốt nhất hiện có**: luật prompt dùng chung + `--menu` + `coverage` khung
hình + policy 0.80/1.0 + chặn tự bác ở 5 phần ⇒ **72.4 % tự quyết, 0 ca hoàn tiền oan,
0 ca bác oan, 87.9 % đúng, MAE 0.0192** trên 58 mẫu synthetic. Vẫn **chưa** đủ để bật
`AI_IMAGE_MATCH_SCORING=on`: cần ảnh thật, ảnh "sai món", `unitPrice` để đo tiền thật,
và một lượt audit `shadow` trên traffic thật.
