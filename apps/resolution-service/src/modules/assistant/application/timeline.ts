import { CaseGpsSignals, CaseTimelineEvent } from "../domain/assistant.types";

export interface TimelineInput {
  order?: any;
  orderTimeline?: any;
  dispatch?: any;
  chatMessages?: any[];
  review?: any;
  caseCreatedAt?: string | Date | null;
  caseRespondedAt?: string | Date | null;
  gpsSignals?: CaseGpsSignals | null;
  maxEvents?: number;
}

const asIso = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(value as string | Date);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};

const clean = (value: unknown, max = 160): string => {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/**
 * Ghép dòng thời gian từ nhiều nguồn thành một trục duy nhất.
 *
 * Đây là phần giúp AI suy luận "ai làm gì, lúc nào" thay vì phải tự đối chiếu
 * các khối JSON rời rạc (đơn, điều phối, GPS, chat, đánh giá).
 */
export function buildCaseTimeline(input: TimelineInput): CaseTimelineEvent[] {
  const events: CaseTimelineEvent[] = [];
  const push = (at: unknown, source: string, event: unknown) => {
    const iso = asIso(at);
    const text = clean(event);
    if (!iso || !text) return;
    events.push({ at: iso, source, event: text });
  };

  const order = input.order ?? {};
  push(order.createdAt ?? order.created_at, "D1", "Đơn được tạo");
  if (order.promisedDeliveryAt ?? order.promised_delivery_at) {
    push(
      order.promisedDeliveryAt ?? order.promised_delivery_at,
      "D1",
      "Thời điểm cam kết giao",
    );
  }
  if (order.cancelReason ?? order.cancel_reason) {
    push(
      order.updatedAt ?? order.updated_at,
      "D1",
      `Đơn bị huỷ: ${order.cancelReason ?? order.cancel_reason}`,
    );
  }
  if (order.rejectionReason ?? order.rejection_reason) {
    push(
      order.updatedAt ?? order.updated_at,
      "D1",
      `Nhà hàng từ chối: ${order.rejectionReason ?? order.rejection_reason}`,
    );
  }

  const timelineEntries = Array.isArray(input.orderTimeline)
    ? input.orderTimeline
    : Array.isArray(input.orderTimeline?.timeline)
      ? input.orderTimeline.timeline
      : [];
  for (const entry of timelineEntries) {
    const from = entry?.previousStatus ?? entry?.previous_status ?? "?";
    const to = entry?.newStatus ?? entry?.new_status ?? "?";
    const reason = entry?.reason ? ` — ${entry.reason}` : "";
    push(
      entry?.occurredAt ?? entry?.occurred_at ?? entry?.createdAt,
      "D2",
      `${from} → ${to}${reason}`,
    );
  }

  const dispatch = input.dispatch ?? {};
  if (dispatch?.status) {
    push(
      dispatch.createdAt ?? dispatch.updatedAt,
      "D3",
      `Điều phối: ${dispatch.status}`,
    );
  }
  push(dispatch?.pickedUpAt, "D3", "Tài xế đã lấy hàng");
  push(dispatch?.deliveredAt, "D3", "Hệ thống ghi nhận đã giao");
  if (dispatch?.cancellationReason) {
    push(
      dispatch.updatedAt ?? dispatch.createdAt,
      "D3",
      `Điều phối huỷ: ${dispatch.cancellationReason}`,
    );
  }

  if (Array.isArray(input.chatMessages)) {
    for (const message of input.chatMessages) {
      const role = message?.senderRole ?? message?.sender_role ?? "?";
      push(message?.createdAt ?? message?.created_at, "D7", `Chat ${role}`);
    }
  }

  push(
    input.review?.createdAt ?? input.review?.created_at,
    "D17",
    `Khách đánh giá đơn: ${input.review?.rating ?? "?"}★`,
  );

  push(input.caseCreatedAt, "VỤ VIỆC", "Khiếu nại được tạo");
  push(input.caseRespondedAt, "VỤ VIỆC", "Bên bị khiếu nại phản hồi");

  if (input.gpsSignals?.closestAt) {
    push(
      input.gpsSignals.closestAt,
      "D4",
      `GPS gần điểm giao nhất: ${input.gpsSignals.minDistanceToDeliveryMeters ?? "?"}m`,
    );
  }

  const seen = new Set<string>();
  const unique = events.filter((event) => {
    const key = `${event.at}|${event.source}|${event.event}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.at.localeCompare(b.at));
  const limit = Math.min(40, Math.max(1, input.maxEvents ?? 30));
  if (unique.length <= limit) return unique;

  // Giữ các mốc đầu, mốc cuối và mốc giao hàng để không mất phần quan trọng.
  const head = unique.slice(0, Math.ceil(limit / 2));
  const tail = unique.slice(-Math.floor(limit / 2));
  return [...head, ...tail];
}
