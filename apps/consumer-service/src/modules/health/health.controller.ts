import { Controller, Get } from "@nestjs/common";

/**
 * Liveness endpoint cho Docker HEALTHCHECK (apps/consumer-service/Dockerfile).
 *
 * main.ts đặt global prefix "api/v1" nên route thật là GET /api/v1/health —
 * giống merchant-service. Không expose qua Kong (Kong route /api/v1/health
 * tới merchant-service), nên đây là probe nội bộ của container.
 */
@Controller("health")
export class HealthController {
  @Get()
  check() {
    return { status: "ok", service: "consumer-service" };
  }
}
