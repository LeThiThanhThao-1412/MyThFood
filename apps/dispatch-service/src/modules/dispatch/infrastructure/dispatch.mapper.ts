import {
  Dispatch,
  DispatchStatus,
  DispatchDeclineReason,
} from "../domain/dispatch.aggregate";
import { DispatchId } from "../domain/dispatch-id";
import { DispatchEntity } from "./dispatch.entity";

export class DispatchMapper {
  static toDomain(entity: DispatchEntity): Dispatch {
    return Dispatch.rehydrate(DispatchId.from(entity.id), {
      orderId: entity.orderId,
      merchantId: entity.merchantId,
      merchantLatitude: entity.merchantLatitude,
      merchantLongitude: entity.merchantLongitude,
      deliveryAddress: entity.deliveryAddress,
      deliveryLatitude: entity.deliveryLatitude,
      deliveryLongitude: entity.deliveryLongitude,
      deliveryOption: entity.deliveryOption as any,
      priorityRank: entity.priorityRank ?? 1,
      promisedDeliveryAt: entity.promisedDeliveryAt ?? null,
      batchId: entity.batchId ?? null,
      routeSequence: entity.routeSequence ?? null,
      maxStackedOrders: entity.maxStackedOrders ?? 1,
      dispatchTimeoutSeconds: entity.dispatchTimeoutSeconds ?? 300,
      driverResponseTimeoutSeconds: entity.driverResponseTimeoutSeconds ?? 60,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      status: entity.status as DispatchStatus,
      driverId: entity.driverId,
      matchedDriverIds: entity.matchedDriverIds ?? [],
      retryCount: entity.retryCount,
      declineReason: entity.declineReason,
      declineReasonType: entity.declineReasonType
        ? (entity.declineReasonType as DispatchDeclineReason)
        : null,
      pickedUpAt: entity.pickedUpAt,
      deliveredAt: entity.deliveredAt,
      expiresAt: entity.expiresAt,
      cancellationReason: entity.cancellationReason,
      notes: entity.notes,
    });
  }

  static toPersistence(dispatch: Dispatch): DispatchEntity {
    const entity = new DispatchEntity();
    entity.id = dispatch.id.value;
    entity.orderId = dispatch.dispatchOrderId;
    entity.merchantId = dispatch.dispatchMerchantId;
    entity.merchantLatitude = dispatch.dispatchMerchantLatitude;
    entity.merchantLongitude = dispatch.dispatchMerchantLongitude;
    entity.deliveryAddress = dispatch.dispatchDeliveryAddress;
    entity.deliveryLatitude = dispatch.dispatchDeliveryLatitude;
    entity.deliveryLongitude = dispatch.dispatchDeliveryLongitude;
    entity.deliveryOption = dispatch.dispatchDeliveryOption;
    entity.priorityRank = dispatch.dispatchPriorityRank;
    entity.promisedDeliveryAt = dispatch.dispatchPromisedDeliveryAt;
    entity.batchId = dispatch.dispatchBatchId;
    entity.routeSequence = dispatch.dispatchRouteSequence;
    entity.maxStackedOrders = dispatch.dispatchMaxStackedOrders;
    entity.dispatchTimeoutSeconds = dispatch.dispatchTimeoutSeconds;
    entity.driverResponseTimeoutSeconds =
      dispatch.dispatchDriverResponseTimeoutSeconds;
    entity.status = dispatch.dispatchStatus;
    entity.driverId = dispatch.dispatchDriverId;
    entity.matchedDriverIds = dispatch.dispatchMatchedDriverIds;
    entity.retryCount = dispatch.dispatchRetryCount;
    entity.declineReason = dispatch.dispatchDeclineReason;
    entity.declineReasonType = dispatch.dispatchDeclineReasonType;
    entity.pickedUpAt = dispatch.dispatchPickedUpAt;
    entity.deliveredAt = dispatch.dispatchDeliveredAt;
    entity.expiresAt = dispatch.dispatchExpiresAt;
    entity.cancellationReason = dispatch.dispatchCancellationReason;
    entity.notes = dispatch.dispatchNotes;
    return entity;
  }
}
