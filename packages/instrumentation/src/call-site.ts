/**
 * Xác định điểm gọi (file:dòng) trong mã ứng dụng.
 *
 * Vì sao cần: giao thức E2 phải phân biệt "hop im lặng" (lời gọi nằm trong
 * `try { ... } catch {}` nên lỗi bị nuốt) với "hop vắng mặt". Chỉ có log hop
 * thì không thể biết ai nuốt lỗi; điểm gọi cho phép `analyze.py` đối chiếu với
 * bảng dòng đã kiểm chứng trong giao thức §7.3.
 */
const CALL_SITE_PATTERN =
  /\(?([A-Za-z]:[\\/][^()]+|\/[^()]+|[^()\s]+):(\d+):(\d+)\)?$/;

export function captureCallSite(): string | null {
  // Giới hạn mặc định của V8 là 10 frame, trong khi stack thật của một hop đi
  // qua rxjs (`defer` → `subscribe` → `firstValueFrom`) đã ngốn gần hết; frame
  // của mã ứng dụng nằm ngoài giới hạn nên `captureCallSite` trả null.
  // Đã kiểm chứng trên container: trước khi nâng giới hạn, mọi bản ghi
  // `bench-hops.jsonl` đều có `callSite: null`.
  const previousLimit = Error.stackTraceLimit;
  Error.stackTraceLimit = 64;

  let stack: string | undefined;
  try {
    stack = new Error().stack;
  } finally {
    Error.stackTraceLimit = previousLimit;
  }

  if (!stack) return null;

  for (const raw of stack.split("\n").slice(1)) {
    let line = raw.trim();
    if (!line.startsWith("at ")) continue;

    // V8 gắn nhãn "at async <fn>" cho frame bất đồng bộ. Bỏ nhãn nhưng KHÔNG
    // bỏ frame: hầu hết hop của order-service nằm trong hàm async, nếu bỏ qua
    // thì callSite luôn null và mục §7.3 của giao thức mất khả năng đối chiếu.
    if (line.startsWith("at async ")) {
      line = `at ${line.slice("at async ".length)}`;
    }

    const match = CALL_SITE_PATTERN.exec(line);
    if (!match) continue;

    const file = (match[1] ?? "").replace(/\\/g, "/");
    if (isIgnored(file)) continue;

    // Hai đoạn cuối đủ để định vị (thư mục + tệp), không lộ đường dẫn tuyệt đối.
    return `${file.split("/").slice(-2).join("/")}:${match[2] ?? "0"}`;
  }

  return null;
}

function isIgnored(file: string): boolean {
  if (file.startsWith("node:")) return true;
  if (file.includes("/node_modules/")) return true;
  // Chính lớp đo, trừ tệp kiểm thử của nó (test cần thấy điểm gọi của chính nó).
  if (/packages\/instrumentation\/(src|dist)\//.test(file)) {
    return !file.includes("__tests__");
  }
  return false;
}
