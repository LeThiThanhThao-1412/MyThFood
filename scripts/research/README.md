# Đo lường thực nghiệm (E2/E3)

Ba script dùng để sinh **số liệu thật** cho Mục V-F của bài báo NCKH
(`docs/RESEARCH/01_IEEE_PAPER_VI.md`, `02_IEEE_PAPER_EN.md`).

| Script                    | Việc nó làm                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `parity-check.js`         | So sánh dữ liệu handler in-process (đọc thẳng Postgres) với phản hồi HTTP thật của `consumer-service`/`merchant-service`: bộ khoá, giá trị từng trường, kiểu dữ liệu. Đây là điều kiện để E3 hợp lệ. |
| `bench-hop.js`            | Đo chi phí một hop ở hai nhánh `TracedHttpService` (M2, qua mạng) và `InProcessHttpService` (B1): 30 warm-up + 300 mẫu, in ra JSON đầy đủ p50/p95/p99/mean.                                          |
| `aggregate-bench.js`      | Gộp nhiều tệp JSON của `bench-hop.js` thành bảng báo cáo: **trung vị** các lần chạy kèm **khoảng nhỏ nhất–lớn nhất**, cùng bảng chênh lệch HTTP − B1. Đây là script sinh ra Bảng XI–XII của bài báo. |
| `results/run{1,2,3}.json` | Dữ liệu thô của ba lần lặp dùng cho Bảng XI–XII (11/11/2026).                                                                                                                                        |

## Chạy

```bash
# 1. order-service phải đang chạy (image có packages/instrumentation)
docker cp scripts/research/parity-check.js mythfood-order-service:/app/parity-check.js
docker exec -w /app mythfood-order-service node parity-check.js

# 2. Đo chi phí hop — đặt script trong /app để Node phân giải được axios/rxjs
docker cp scripts/research/bench-hop.js mythfood-order-service:/app/bench-hop.js
docker exec -w /app mythfood-order-service node bench-hop.js > run1.json   # lặp 3 lần

# 3. Gộp ba lần lặp thành bảng báo cáo (trung vị + khoảng)
node scripts/research/aggregate-bench.js scripts/research/results/run*.json
```

Kết quả mong đợi của `parity-check.js`:

```
CONSUMER_EQUAL true
MERCHANT_KEY_DIFF {"onlyHttp":["isOpenNow"],"onlyInproc":[]}
```

`isOpenNow` là trường tính toán của `merchant-service`, `order-service` không đọc —
khác biệt này đã được chấp nhận và ghi rõ trong bài báo.

## Kiểm chứng một lần chạy thuộc nhánh nào

`InstrumentationModule` in ra dòng log lúc khởi động, dùng để kiểm toán:

```
docker logs mythfood-order-service | Select-String 'Instrumentation'
[Instrumentation] HttpService → TracedHttpService | mode=http | hop log=/logs/hops.jsonl | handler nội bộ=2 | runId=adhoc
```

Nếu dòng này ghi `mode=inproc` trong khi bạn định chạy M2 (hoặc ngược lại) thì
toàn bộ lần chạy phải bị loại — đây là bằng chứng duy nhất trong log của tiến
trình về nhánh transport đã dùng.

## Biến môi trường

`BENCH_N` (mặc định 300), `BENCH_WARMUP` (30), `BENCH_CONSUMER_ID`,
`BENCH_MERCHANT_ID`, `SERVICE_API_KEY`. Log hop của lần đo ghi vào
`/logs/bench-hops.jsonl` để không trộn với `hops.jsonl` của lần chạy thật.

## Ma trận E1–E6 — bộ công cụ chạy một lệnh (11/11/2026)

Phần trên chỉ phủ Mục V-F. Để điền được **Bảng V–VII** (E1/E2/E3) cần thêm bộ
dữ liệu hạt giống, bốn hồ sơ tải và một harness. Tất cả nằm trong repo:

| Tệp                                                    | Việc nó làm                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/research/seed-loadtest.ps1` + `sql/`          | Nạp bộ dữ liệu hạt giống **tất định** (UUID cố định, idempotent) rồi xuất `k6/data/{users,merchants,drivers}.json`.                                                                                                                                                                                                                                                                          |
| `k6/lib/common.js`                                     | Đăng nhập (nhận `phoneNumber`, không phải email), gắn `x-run-id`/`x-trace-id`, đọc độ dài giai đoạn và tốc độ từ biến môi trường.                                                                                                                                                                                                                                                            |
| `k6/w1-read.js`                                        | **W1** — duyệt quán: danh sách → chi tiết → thực đơn (10 rps).                                                                                                                                                                                                                                                                                                                               |
| `k6/w2-place-order.js`                                 | **W2** — đặt một đơn (10 rps), có toạ độ nên phát sinh hop merchant-service.                                                                                                                                                                                                                                                                                                                 |
| `k6/w3-lifecycle.js`                                   | **W3** — vòng đời đơn 6 bước (3 rps), workload của E2/E3.                                                                                                                                                                                                                                                                                                                                    |
| `k6/w4-spike.js`                                       | **W4** — 0 → 60 rps trong 60 s, giữ 120 s; ghi thời điểm lỗi đầu tiên.                                                                                                                                                                                                                                                                                                                       |
| `scripts/wait-ready.ps1`                               | Bốn cổng sẵn sàng của giao thức §2.2 (17 healthy, 14 CSDL, 401, W0).                                                                                                                                                                                                                                                                                                                         |
| `scripts/research/harness.ps1`                         | Chạy trọn một run: Kafka off → tạo lại order-service với `RUN_ID` → bốn cổng → `docker stats` 5 s/lần → k6 → `logs/<RUN_ID>/` → `meta.json` → gọi `aggregate-matrix.js`.                                                                                                                                                                                                                     |
| `scripts/research/aggregate-matrix.js`                 | Đọc `k6.json`/`res.csv`/`hops.jsonl`/`meta.json`, cắt warm-up, in bảng p50/p95/p99 + tài nguyên + hop, ghi `summary.json` và nối dòng vào `logs/summary.csv`.                                                                                                                                                                                                                                |
| `scripts/research/run-matrix.ps1` + `matrix-plan.json` | Chạy **cả hàng đợi** run tuần tự (29 run của E1+E3), bỏ qua run đã xong, ghi tiến trình vào `logs/matrix-progress.log`; dừng giữa chừng rồi chạy lại vẫn không mất số đã đo.                                                                                                                                                                                                                 |
| `scripts/research/report-matrix.js`                    | Gộp nhiều run thành **một ô đo**: trung vị + [min–max] + độ tản % cho từng chỉ số, loại run `-Quick`/lỗi, xuất `logs/cells.json` và bảng Markdown để dán vào bài.                                                                                                                                                                                                                            |
| `scripts/research/table-vi.js`                         | **Bảng VI**: chi phí từng hop. Chạy trên cặp run E3 `http`/`inproc` để tách $q_i$ (thân handler, đo ở nhánh inproc) và $h_i$ (mạng/serialize, bằng phép trừ hai nhánh); bỏ hop `proxied` và hop nền, xuất `logs/table-vi.json` + Markdown.                                                                                                                                                   |
| `scripts/research/code-metrics.js`                     | **E4 — Bảng IX**: đếm tệp/dòng mã, fan-out/fan-in theo URL `http://<x>-service`, chu trình import (Tarjan) cho M2 và M1 (`--m1`), xuất `logs/code-metrics.json` + Markdown. Thay cho `cloc`/`madge` vì máy đo không có hai công cụ đó (giao thức §9.2).                                                                                                                                      |
| `scripts/research/model.js`                            | **Bảng V, VII, X** — ba phép _suy dẫn_ trên số đo: `--table-v` (Eq. (3a): p50 M1 dự đoán = p50 M2 − Σh_i, kèm MAPE so với nhánh B1), `--table-vii` (Eq. (4): M1 = M_base + Σ(M_s − M_base), cần `-MBaseMb`; CPU-seconds/1 000 đơn từ `res.csv`), `--table-x` (Eq. (6): bán kính ảnh hưởng theo endpoint và theo dịch vụ, cộng tần suất được gọi đo từ `hops.jsonl`); xuất `logs/model.json`. |
| `matrix-plan-fast.json`                                | Kế hoạch **rút gọn n = 1** (giao thức §14.5): cặp E3-W3 http/inproc cho Bảng VI, E3-W2-inproc cho Bảng V, bốn kịch bản E5 (`fault`), E1-W1 và E1-W4. Chạy bằng `run-matrix.ps1 -PlanFile matrix-plan-fast.json`.                                                                                                                                                                             |

### Quy trình một run

```powershell
cd d:\MyThFood\mythfood

# 0) một lần cho mỗi lần dựng lại stack: bộ dữ liệu hạt giống + k6/data/*.json
.\scripts\research\seed-loadtest.ps1

# 1) một run đo (mã thoát 0 = đạt mọi ngưỡng; 99 = có ngưỡng vượt, vẫn dùng được)
.\scripts\research\harness.ps1 -RunId E1-W2-r1 -Experiment E1 -Profile W2
.\scripts\research\harness.ps1 -RunId E3-W3-inproc-r1 -Experiment E3 -Profile W3 -Variant B1
.\scripts\research\harness.ps1 -RunId E5-W2-F1-r1 -Experiment E5 -Profile W2 -TargetRate 5 -Note 'F1 review-service down'

# 2) kiểm tra đường ống mà không lấy số (10 s warm-up / 60 s đo)
.\scripts\research\harness.ps1 -RunId E1-W1-q1 -Experiment E1 -Profile W1 -Quick

# 3) chạy cả ma trận (29 run: E1 W2/W3/E3/W1/W4), rồi gộp thành ô đo
.\scripts\research\run-matrix.ps1                  # -From <RunId> để chạy tiếp, -DryRun để xem trước
node scripts/research/report-matrix.js --markdown  # trung vị [min–max] từng ô, kèm Markdown
node scripts/research/table-vi.js --write           # Bảng VI: q_i/h_i từ cặp run E3 http/inproc
```

`run-matrix.ps1` ghi tiến trình vào `logs/matrix-progress.log` (một dòng mỗi sự
kiện: `START`/`DONE`/`SKIP`/`FAIL`/`END`) và toàn bộ output của từng run vào
`logs/<RUN_ID>/harness.txt`. Nó giữ `logs/matrix.lock` để hai phiên không chạy
chồng lên nhau, và khi kết thúc đưa order-service về `RUN_ID=adhoc`, `mode=http`.

Kết quả nằm ở `logs/<RUN_ID>/`: `meta.json`, `hops.jsonl`, `k6.json`,
`k6-summary.json`, `k6.txt`, `res.csv`, `summary.json`. `logs/summary.csv` gộp
mọi run — cột `value` **chỉ do script điền** (§12.3).

### Dọn trạng thái trước mỗi run (Bước 3.5)

Harness không đo trên trạng thái tích luỹ: trước mỗi run nó đưa CSDL về cùng một
điểm xuất phát bằng hai câu SQL đi thẳng vào Postgres (không qua service nên
**không sinh hop**), rồi ghi kết quả vào `meta.json`:

| Việc             | Câu lệnh                                 | `meta.json`    | Vì sao (số đo)                                                                                                                                                     |
| ---------------- | ---------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Huỷ đơn tồn đọng | `UPDATE orders SET status='CANCELLED' …` | `ordersReset`  | Không dọn thì hai cron 30 s của order-service huỷ dồn đơn `PENDING` của run trước → bão hop refund; đo được 3 572 hop nền, p50 W3 tăng 4–8 lần (giao thức §14.1)   |
| Nạp lại số dư ví | `UPDATE wallets SET balance = …`         | `walletsReset` | COD settlement **trừ ví tài xế** đúng tiền món; 5.000.000 đ/tài xế chỉ đủ ~200 đơn nên hop `settlement/accrue` chuyển sang **500** sau ~4 run W3 (giao thức §14.3) |

`-NoReset` tắt cả hai để tái hiện trạng thái nhiễm. Dữ liệu của những run chạy
trước khi có bước này nằm ở `logs/archive/` và **không** dùng vào Bảng V–VII.

### Tiêm lỗi (E5)

| Tệp                                         | Việc nó làm                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `k6/e5-fault.js`                            | Hai giai đoạn liên tiếp trong MỘT run: `baseline` 120 s rồi `fault` 180 s ở 5 đơn/s. Hai scenario riêng để metric không trộn: `e5_baseline_latency` / `e5_fault_latency`, `e5_baseline_completed` / `e5_fault_completed`. Chỉ số của Bảng VIII là `e5_fault_completed`. |
| `scripts/research/faults/stop-service.ps1`  | Dừng/khởi động lại một dịch vụ và **chờ healthy** (tối đa 90 s) trước khi run sau bắt đầu.                                                                                                                                                                              |
| `scripts/research/faults/F1.ps1` … `F4.ps1` | Bốn kịch bản của §8.1: review (không tới hạn), promotion, notification, inventory (tới hạn).                                                                                                                                                                            |

```powershell
# F1: dừng review-service từ giây thứ 127 và bật lại sau 180 s
.\scripts\research\harness.ps1 -RunId E5-F1-r1 -Experiment E5 -Profile W2 `
    -FaultApply  .\scripts\research\faults\F1.ps1 `
    -FaultRevert .\scripts\research\faults\F1.ps1
```

Harness ghi thời điểm bật/tắt thật vào `logs/<RunId>/fault.json` và
`meta.json` (`faultAppliedAt`, `faultRevertedAt`), nên cửa sổ lỗi luôn đối chiếu
được với cửa sổ đo. F5 (Toxiproxy, §8.3) chưa dựng: cần thêm service Toxiproxy
vào một overlay riêng vì nó đổi `PAYMENT_SERVICE_URL` của order-service.

| Biến                                     | Mặc định dev     | Trong `docker-compose.research.yml` | Vì sao                                                                                                                                        |
| ---------------------------------------- | ---------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `THROTTLE_TTL` (identity)                | 1000 ms, 3 req/s | **0** (tắt)                         | W3 đăng nhập 170 tài khoản trong `setup()`; để nguyên thì 429 làm hỏng cả run. Chỉ ảnh hưởng `setup()`, không ảnh hưởng phần đo.              |
| `MAX_ACTIVE_ORDERS_PER_CONSUMER` (order) | 3                | **0** (không giới hạn)              | Đo thật: cùng một khách đặt đơn thứ 4 nhận 409 trong ~20 ms; W2/W4 dùng 100 khách cho hàng nghìn đơn nên trần này biến mọi phép đo thành 409. |

Cả hai đặt **giống nhau ở M2 và B1/B2**, và harness ghi lại giá trị hiệu lực
trong `meta.json` (`serviceClientMode`, `k6ExitCode`, …).

### Số đo dùng để hiệu chỉnh (không suy đoán)

- Đăng nhập: ~130 ms/lần trong network (bcrypt cost 12) ⇒ phải nằm trong
  `setup()`, và 170 tài khoản phải đăng nhập **theo lô 8 song song** + `setupTimeout: 8m`.
- `POST /api/v1/orders` (M2, COD, 1.0 CPU): **p50 = 0,29 s**, p95 = 0,68 s
  (run `E1-W2-r1`: 2 300 đơn, 7,57 đơn/s, 0 lỗi, 4 600 hop do tải sinh ra).
- W3 ở 10 rps: mỗi bước PATCH p50 2,5–3 s và 82 lượt bị bỏ ⇒ order-service bão
  hoà 1 CPU; độ trễ đo được là xếp hàng, không phải chi phí kiến trúc. Vì vậy
  W3 mặc định **3 rps** (`-e W3_RATE=` để đổi) — E3 so sánh M2/B1 trong cùng
  vùng không bão hoà.
- Hop nền (cron flash-sale refund) có `traceId = "-"`; k6 gửi
  `x-trace-id: <RUN_ID>-vu<k>-it<n>` nên `aggregate-matrix.js` chỉ tính hop do
  tải sinh ra và báo riêng số dòng nền đã bỏ.

### Đã biết, chưa sửa (ghi vào nhật ký, không sửa số)

- `markDelivered` gọi `PATCH /api/v1/drivers/:id/location` với body
  `{latitude, longitude}` và nhận **400** (đã bắt lỗi, không ảnh hưởng đơn).
  Hop này vẫn xuất hiện trong Bảng VI với `status = 400` — phải nêu, không được
  lặng lẽ loại bỏ.
- Ví **tài xế** bị COD settlement trừ đúng tiền món, nên ví cạn sau ~4 run W3 và
  hop `settlement/accrue` trả **500** (`wallet.service.ts`, `debitForCOD`). Bước
  3.5 nạp lại số dư về định mức seed trước mỗi run (giao thức §14.3); nếu chạy
  harness với `-NoReset` thì phải tự nạp lại ví, nếu không số liệu hop ví sẽ sai.
- `debitForCOD` ném `Error` thường khi thiếu số dư ⇒ HTTP **500** thay vì 409/422.
  Đây là lỗi của hệ thống cần nêu trong phần đánh giá độ tin cậy, không phải lỗi
  của harness.

- Một luồng tuần tự (1 VU): mục đích là cô lập chi phí hop, không đo thông lượng.
- Cả hai nhánh đều đi qua lớp ghi log hop, nên chi phí đo lường là như nhau.
- Handler in-process vẫn truy vấn Postgres qua mạng — nên "sàn" 1,7–1,9 ms là
  chi phí thật, không phải 0.
