import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";

@WebSocketGateway({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  namespace: "/orders",
})
export class OrderGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(OrderGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage("join:merchant")
  handleJoinMerchant(
    @MessageBody() data: { merchantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `merchant:${data.merchantId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage("join:consumer")
  handleJoinConsumer(
    @MessageBody() data: { consumerId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `consumer:${data.consumerId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined room ${room}`);
  }

  @SubscribeMessage("leave:merchant")
  handleLeaveMerchant(
    @MessageBody() data: { merchantId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `merchant:${data.merchantId}`;
    client.leave(room);
  }

  /**
   * Emit to merchant when a new order is placed or status changes
   */
  emitOrderUpdate(merchantId: string, event: string, data: any) {
    this.server.to(`merchant:${merchantId}`).emit(event, data);
  }

  /**
   * Emit to consumer when order status changes
   */
  emitConsumerUpdate(consumerId: string, event: string, data: any) {
    this.server.to(`consumer:${consumerId}`).emit(event, data);
  }
}
