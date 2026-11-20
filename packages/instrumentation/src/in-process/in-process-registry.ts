import { Injectable } from "@nestjs/common";
import { InProcessRouteDefinition, InProcessHandler } from "./in-process.types";

/**
 * Sổ đăng ký route nội bộ.
 *
 * B1 chỉ có giá trị khi biết **bao nhiêu hop thật sự được xử lý trong tiến
 * trình**. Vì vậy registry được thiết kế để trả lời được hai câu hỏi:
 *   1. Route này có handler chưa? (`match` → undefined nghĩa là chưa)
 *   2. Danh sách handler đang có là gì? (`list` → ghi vào meta.json của run)
 */
@Injectable()
export class InProcessRegistry {
  private readonly routes: InProcessRouteDefinition[] = [];

  register(definition: InProcessRouteDefinition): this {
    this.routes.push({
      ...definition,
      method: definition.method.toUpperCase(),
    });
    return this;
  }

  registerAll(definitions: InProcessRouteDefinition[]): this {
    for (const definition of definitions) this.register(definition);
    return this;
  }

  match(method: string, path: string): InProcessRouteDefinition | undefined {
    const wanted = method.toUpperCase();
    return this.routes.find(
      (route) => route.method === wanted && route.path.test(path),
    );
  }

  /** Tên các handler đang hoạt động, theo thứ tự đăng ký. */
  list(): string[] {
    return this.routes.map((route) => `${route.method} ${route.name}`);
  }

  get size(): number {
    return this.routes.length;
  }

  /** Đăng ký kèm kiểm tra trùng tên — trùng tên làm log không kiểm toán được. */
  registerUnique(
    name: string,
    method: string,
    path: RegExp,
    handler: InProcessHandler,
  ): this {
    const existing = this.routes.find((route) => route.name === name);
    if (existing) {
      throw new Error(`Handler in-process trùng tên: ${name}`);
    }
    return this.register({ name, method, path, handler });
  }
}
