import { of, throwError } from "rxjs";
import { IntegrationService } from "../../modules/integration/integration.service";

/**
 * Tải ảnh bằng chứng — chỗ hay hỏng âm thầm.
 *
 * Ảnh upload được lưu với host của client (`http://localhost:3010`), còn
 * resolution-service chạy trong docker nên phải đổi sang `UPLOAD_SERVICE_URL`.
 * Nếu tải hỏng mà chỉ trả `null` thì admin thấy "0 ảnh gửi AI" và tưởng khách
 * không gửi ảnh — nên mọi lỗi phải kèm nguyên nhân.
 */
describe("IntegrationService — tải ảnh bằng chứng", () => {
  const originalEnv = { ...process.env };

  beforeAll(() => {
    process.env.UPLOAD_SERVICE_URL = "http://upload-service:3010";
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  const httpError = (status: number, body: unknown) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: {
        status,
        data: Buffer.from(JSON.stringify(body)),
      },
    });

  /** HttpService giả: trả theo URL, ghi lại thứ tự host đã thử. */
  const makeService = (handler: (url: string) => any) => {
    const calls: string[] = [];
    const httpService = {
      get: (url: string) => {
        calls.push(url);
        try {
          return of(handler(url));
        } catch (err) {
          return throwError(() => err);
        }
      },
    };
    return { service: new IntegrationService(httpService as any), calls };
  };

  it("đổi host ảnh localhost sang UPLOAD_SERVICE_URL", async () => {
    const { service, calls } = makeService((url) => {
      if (url.includes("upload-service:3010")) {
        return {
          headers: { "content-type": "image/jpeg" },
          data: Buffer.from("jpeg-bytes"),
        };
      }
      throw httpError(404, { message: "File not found" });
    });

    const result = await service.downloadImageDetailed(
      "http://localhost:3010/api/v1/upload/complaints/a.jpg",
    );

    expect(result.image?.mimeType).toBe("image/jpeg");
    expect(result.image?.base64).toBe(
      Buffer.from("jpeg-bytes").toString("base64"),
    );
    expect(calls[0]).toBe(
      "http://upload-service:3010/api/v1/upload/complaints/a.jpg",
    );
  });

  it("thử host kế tiếp khi host đầu lỗi 500", async () => {
    const { service } = makeService((url) => {
      if (url.includes("upload-service:3010")) {
        throw httpError(500, { message: "Internal server error" });
      }
      if (url.includes("localhost:3010")) {
        return {
          headers: { "content-type": "image/png" },
          data: Buffer.from("png-bytes"),
        };
      }
      throw httpError(404, { message: "File not found" });
    });

    const result = await service.downloadImageDetailed(
      "http://localhost:3010/api/v1/upload/complaints/a.png",
    );

    expect(result.image?.mimeType).toBe("image/png");
  });

  it("trả nguyên nhân khi mọi host đều lỗi", async () => {
    const { service } = makeService(() => {
      throw httpError(404, { message: "File not found" });
    });

    const result = await service.downloadImageDetailed(
      "http://localhost:3010/api/v1/upload/complaints/a.jpg",
    );

    expect(result.image).toBeNull();
    expect(result.reason).toContain("404 File not found");
  });

  it("báo rõ khi URL trả JSON thay vì ảnh", async () => {
    const { service } = makeService(() => ({
      headers: { "content-type": "application/json" },
      data: Buffer.from("{}"),
    }));

    const result = await service.downloadImageDetailed(
      "http://cdn.example.com/api/v1/upload/complaints/1729-abc",
    );

    expect(result.image).toBeNull();
    expect(result.reason).toContain("không phải ảnh");
  });

  it("loại HEIC sớm với lý do rõ ràng (model không đọc được)", async () => {
    const { service } = makeService(() => ({
      // upload-service trả octet-stream cho đuôi lạ ⇒ đoán MIME từ URL.
      headers: { "content-type": "application/octet-stream" },
      data: Buffer.from("heic-bytes"),
    }));

    const result = await service.downloadImageDetailed(
      "http://cdn.example.com/api/v1/upload/complaints/a.HEIC",
    );

    expect(result.image).toBeNull();
    expect(result.reason).toContain("image/heic");
    expect(result.reason).toContain("chưa hỗ trợ");
  });

  it("đoán MIME từ đuôi khi service trả octet-stream (.jpg vẫn đọc được)", async () => {
    const { service } = makeService(() => ({
      headers: { "content-type": "application/octet-stream" },
      data: Buffer.from("jpg-bytes"),
    }));

    const result = await service.downloadImageDetailed(
      "http://cdn.example.com/api/v1/upload/complaints/a.jpg",
    );

    expect(result.image?.mimeType).toBe("image/jpeg");
  });

  it("thử lại khi DNS trượt (EAI_AGAIN) — ảnh không bị mất vĩnh viễn", async () => {
    let attempts = 0;
    const { service, calls } = makeService(() => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(
          new Error("getaddrinfo EAI_AGAIN s3.amazonaws.com"),
          {
            code: "EAI_AGAIN",
          },
        );
      }
      return {
        headers: { "content-type": "image/jpeg" },
        data: Buffer.from("jpeg-bytes"),
      };
    });

    const result = await service.downloadImageDetailed(
      "http://cdn.example.com/api/v1/upload/complaints/dns.jpg",
    );

    // Trước đây 1 lần DNS trượt là ảnh bị bỏ ⇒ AI kết luận "không có ảnh".
    expect(result.image?.mimeType).toBe("image/jpeg");
    expect(attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it("không thử lại với 404 (tải lại chỉ tốn timeout)", async () => {
    let calls = 0;
    const { service } = makeService(() => {
      calls += 1;
      throw httpError(404, { message: "File not found" });
    });

    const result = await service.downloadImageDetailed(
      "http://cdn.example.com/api/v1/upload/complaints/missing.jpg",
    );

    expect(result.image).toBeNull();
    expect(calls).toBe(3); // 3 host ứng viên, mỗi host 1 lần
  });

  it("cache ảnh theo URL — lượt 'Phân tích lại' không tải lại", async () => {
    let calls = 0;
    const { service } = makeService(() => {
      calls += 1;
      return {
        headers: { "content-type": "image/png" },
        data: Buffer.from("png-bytes"),
      };
    });
    const url = "http://cdn.example.com/api/v1/upload/complaints/cache.png";

    const first = await service.downloadImageDetailed(url);
    const second = await service.downloadImageDetailed(url);

    expect(first.image?.base64).toBe(second.image?.base64);
    expect(calls).toBe(1);
  });

  it("cache tắt khi AI_IMAGE_CACHE_TTL_MS=0 (vẫn tải lại mỗi lần)", async () => {
    process.env.AI_IMAGE_CACHE_TTL_MS = "0";
    try {
      let calls = 0;
      const { service } = makeService(() => {
        calls += 1;
        return {
          headers: { "content-type": "image/png" },
          data: Buffer.from("png-bytes"),
        };
      });
      const url = "http://cdn.example.com/api/v1/upload/complaints/nocache.png";

      await service.downloadImageDetailed(url);
      await service.downloadImageDetailed(url);

      expect(calls).toBe(2);
    } finally {
      delete process.env.AI_IMAGE_CACHE_TTL_MS;
    }
  });

  it("bỏ ảnh quá AI_MAX_IMAGE_BYTES và nêu dung lượng thật", async () => {
    process.env.AI_MAX_IMAGE_BYTES = "1024";
    try {
      const { service } = makeService(() => ({
        headers: { "content-type": "image/jpeg" },
        data: Buffer.alloc(2048),
      }));

      const result = await service.downloadImageDetailed(
        "http://cdn.example.com/api/v1/upload/complaints/big.jpg",
      );

      expect(result.image).toBeNull();
      expect(result.reason).toContain(">");
      expect(result.reason).toContain("KB");
    } finally {
      delete process.env.AI_MAX_IMAGE_BYTES;
    }
  });
});
