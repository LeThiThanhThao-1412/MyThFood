import { captureCallSite } from "../call-site";

/**
 * Hồi quy cho lỗi thực tế: bản đầu tiên bỏ qua các frame `at async ...`, nên
 * mọi hop phát sinh từ hàm async (tức gần như toàn bộ order-service) có
 * `callSite = null`, làm mục §7.3 của giao thức không đối chiếu được.
 */
async function callFromAsyncAfterAwait(): Promise<string | null> {
  await Promise.resolve();
  return captureCallSite();
}

function callFromSync(): string | null {
  return captureCallSite();
}

describe("captureCallSite", () => {
  it("trả về file:dòng của mã ứng dụng khi gọi từ hàm async", async () => {
    const site = await callFromAsyncAfterAwait();
    expect(site).toMatch(/call-site\.spec\.ts:\d+$/);
  });

  it("trả về file:dòng khi gọi đồng bộ", () => {
    const site = callFromSync();
    expect(site).toMatch(/call-site\.spec\.ts:\d+$/);
  });

  it("bỏ qua frame của node_modules và của chính lớp đo", () => {
    const site = captureCallSite();
    expect(site).not.toContain("node_modules");
    expect(site).not.toContain("packages/instrumentation");
  });

  it("tự nâng stackTraceLimit nên vẫn thấy điểm gọi khi bị hạ xuống 2 frame", () => {
    // Đây là đúng lỗi gặp trên container: stack của một hop (rxjs `defer` →
    // `subscribe` → `firstValueFrom`) dài hơn giới hạn mặc định, frame ứng dụng
    // bị cắt nên `callSite` luôn null. Test hạ giới hạn để tái hiện vô điều kiện.
    const original = Error.stackTraceLimit;
    Error.stackTraceLimit = 2;
    try {
      expect(callFromSync()).toMatch(/call-site\.spec\.ts:\d+$/);
    } finally {
      Error.stackTraceLimit = original;
    }
  });
});
