import { Logger, OnModuleInit } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import {
  DriverService,
  type LocationBroadcast,
} from "../driver/application/driver.service";

// ============================================================================
// TrackingGateway — namespace `/tracking` của driver-service (Phase 1).
//
// UPLINK (tài xế → server):
//   `tracking:push` { latitude, longitude }  → ack { ok, error? }
//   Xác thực JWT ở handshake, tự suy ra `driverId` từ userId (client không được
//   phép khai báo driverId để tránh giả mạo vị trí tài xế khác).
//
// DOWNLINK (server → client):
//   `tracking:update` phát vào room `order:<orderId>` (app khách đang theo dõi
//   đơn) và `driver:<driverId>` (thiết bị/điều phối của chính tài xế).
//   Client subscribe bằng `tracking:subscribe` { orderId } / `tracking:unsubscribe`.
// ============================================================================

const TRACKING_NAMESPACE = "/tracking";

const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : "*";

@WebSocketGateway({
  namespace: TRACKING_NAMESPACE,
  // Client xác thực bằng JWT trong `handshake.auth.token` (không dùng cookie),
  // nên không bật credentials để tránh xung đột khi origin là "*".
  cors: { origin: corsOrigin },
})
export class TrackingGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  private readonly server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly driverService: DriverService,
  ) {}

  onModuleInit(): void {
    // DriverService phát sự kiện sau MỌI lần lưu vị trí (HTTP, batch, WS) →
    // gateway chỉ lo fan-out, không cần biết transport.
    this.driverService.registerLocationListener((update) =>
      this.broadcastLocation(update),
    );
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);
      if (!token) throw new Error("Missing access token");

      const payload: any = await this.jwtService.verifyAsync(token);
      const userId = payload?.sub;
      if (!userId) throw new Error("Invalid token payload");

      const driver = await this.driverService.getByUserId(userId);
      const driverId = driver ? driver.id.toString() : null;

      client.data.userId = userId;
      client.data.roles = Array.isArray(payload?.roles) ? payload.roles : [];
      client.data.driverId = driverId;

      if (driverId) {
        await client.join(`driver:${driverId}`);
      }

      client.emit("tracking:ready", { userId, driverId });
    } catch (err) {
      this.logger.warn(
        `Tracking handshake rejected: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      client.emit("tracking:error", { message: "UNAUTHORIZED" });
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {
    // Room membership do socket.io tự dọn khi socket đóng.
  }

  /** App khách / điều phối subscribe room của một đơn để nhận vị trí tài xế. */
  @SubscribeMessage("tracking:subscribe")
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (!orderId) return { ok: false, error: "MISSING_ORDER_ID" };
    await client.join(`order:${orderId}`);
    return { ok: true };
  }

  @SubscribeMessage("tracking:unsubscribe")
  async handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { orderId?: string },
  ): Promise<{ ok: boolean }> {
    const orderId = typeof body?.orderId === "string" ? body.orderId : "";
    if (orderId) await client.leave(`order:${orderId}`);
    return { ok: true };
  }

  /** Tài xế đẩy 1 điểm GPS qua WebSocket (fallback: HTTP batch). */
  @SubscribeMessage("tracking:push")
  async handlePush(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { latitude?: unknown; longitude?: unknown },
  ): Promise<{ ok: boolean; error?: string }> {
    const driverId: string | null = client.data?.driverId ?? null;
    if (!driverId) return { ok: false, error: "DRIVER_PROFILE_NOT_FOUND" };

    const latitude = Number(body?.latitude);
    const longitude = Number(body?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { ok: false, error: "INVALID_COORDINATES" };
    }
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return { ok: false, error: "COORDINATES_OUT_OF_RANGE" };
    }
    if (latitude === 0 && longitude === 0) {
      return { ok: false, error: "INVALID_COORDINATES" };
    }

    try {
      await this.driverService.updateLocation(
        driverId,
        { latitude, longitude },
        "WS",
      );
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "LOCATION_REJECTED",
      };
    }
  }

  /** Fan-out vị trí mới cho app khách (theo đơn) và thiết bị tài xế. */
  private broadcastLocation(update: LocationBroadcast): void {
    if (!this.server) return;
    const payload = {
      driverId: update.driverId,
      orderId: update.orderId,
      latitude: update.latitude,
      longitude: update.longitude,
      recordedAt: update.recordedAt.toISOString(),
      source: update.source,
    };

    if (update.orderId) {
      this.server
        .to(`order:${update.orderId}`)
        .emit("tracking:update", payload);
    }
    this.server
      .to(`driver:${update.driverId}`)
      .emit("tracking:update", payload);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake?.auth?.token;
    if (typeof authToken === "string" && authToken) return authToken;

    const header = client.handshake?.headers?.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7).trim();
    }
    return null;
  }
}
