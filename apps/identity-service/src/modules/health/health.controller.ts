import { Controller, Get } from "@nestjs/common";

/**
 * Liveness endpoint cho Docker HEALTHCHECK (apps/identity-service/Dockerfile).
 *
 * main.ts đặt global prefix "api/v1" nên route thật là GET /api/v1/health —
 * giống merchant-service. Không expose qua Kong (Kong chỉ route /api/v1/health
 * tới merchant-service), nên đây thuần tuý là probe nội bộ của container.
 */
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok", service: "identity-service" };
  }
}
