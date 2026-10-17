"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { orderApi, paymentApi } from "@mythfood/api-client";

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

const ELEMENT_STYLE = {
  base: {
    fontSize: "15px",
    color: "#1f2937",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    "::placeholder": { color: "#9ca3af" },
  },
  invalid: { color: "#ef4444", iconColor: "#ef4444" },
};

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

function CardPayForm({
  clientSecret,
  amount,
  onPaid,
  onError,
}: {
  clientSecret: string;
  amount: number;
  onPaid: (paymentIntentId: string) => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) {
      onError("Stripe chưa được tải, vui lòng thử lại.");
      return;
    }
    const card = elements.getElement(CardNumberElement);
    if (!card) {
      onError("Vui lòng nhập thông tin thẻ.");
      return;
    }
    setProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card } },
      );
      if (error) {
        onError(error.message || "Thanh toán thất bại.");
      } else if (paymentIntent?.id) {
        onPaid(paymentIntent.id);
      } else {
        onError("Không nhận được kết quả thanh toán.");
      }
    } catch (err: any) {
      onError(err?.message || "Thanh toán thất bại.");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 mt-3">
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
        <CardNumberElement
          options={{ style: ELEMENT_STYLE, placeholder: "4242 4242 4242 4242" }}
          onChange={(e) => setReady(e.complete)}
        />
      </div>
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <CardExpiryElement
            options={{ style: ELEMENT_STYLE, placeholder: "MM/YY" }}
          />
        </div>
        <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
          <CardCvcElement
            options={{ style: ELEMENT_STYLE, placeholder: "CVC" }}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={!stripe || processing || !ready}
        className="w-full bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
      >
        {processing
          ? "Đang xử lý..."
          : `Thanh toán thêm ${amount.toLocaleString("vi-VN")}₫`}
      </button>
      <p className="text-[11px] text-gray-400 text-center">
        🔒 Thanh toán bảo mật bởi Stripe
      </p>
    </form>
  );
}

export default function OrderChangeRequestCard({
  request,
  onChange,
}: {
  request: any;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [payment, setPayment] = useState<{
    paymentId: string;
    clientSecret: string;
    amount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (request?.status === "AWAITING_PAYMENT" && !payment) {
      paymentApi
        .getAdjustmentPaymentSecret(request.id)
        .then((res: any) => {
          const data = res?.data ?? res;
          if (!cancelled && data?.paymentId && data?.clientSecret) {
            setPayment({
              paymentId: data.paymentId,
              clientSecret: data.clientSecret,
              amount: toNum(data.amount),
            });
          }
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
  }, [request?.id, request?.status]);

  const diff = useMemo(() => {
    const count = (items: any[]) => {
      const map = new Map<string, number>();
      for (const item of items || []) {
        map.set(item.name, (map.get(item.name) ?? 0) + toNum(item.quantity));
      }
      return map;
    };
    const before = count(request.beforeItems);
    const after = count(request.afterItems);
    const removed: string[] = [];
    const added: string[] = [];
    for (const [name, qty] of before) {
      const d = qty - (after.get(name) ?? 0);
      if (d > 0) removed.push(`${name} ×${d}`);
    }
    for (const [name, qty] of after) {
      const d = qty - (before.get(name) ?? 0);
      if (d > 0) added.push(`${name} ×${d}`);
    }
    return { removed, added };
  }, [request?.beforeItems, request?.afterItems]);

  const delta = toNum(request?.deltaAmount);
  const method = String(request?.paymentMethod || "CASH").toUpperCase();
  const CARD_MINIMUM_AMOUNT = 13000;
  const isSmallCardDelta =
    method === "CREDIT_CARD" && delta > 0 && delta < CARD_MINIMUM_AMOUNT;

  async function handleAccept() {
    setBusy(true);
    setError("");
    try {
      const result: any = await orderApi.acceptChangeRequest(request.id, {});
      if (result?.requiresPayment && result.payment) {
        setPayment(result.payment);
      } else {
        onChange();
      }
    } catch (e: any) {
      setError(e?.message || "Không thể xác nhận chỉnh sửa");
    } finally {
      setBusy(false);
    }
  }

  async function handleCardPaid(paymentIntentId: string) {
    if (!payment) return;
    setBusy(true);
    setError("");
    try {
      try {
        await paymentApi.completeAdjustment(payment.paymentId, {
          transactionId: paymentIntentId,
        });
      } catch {
        /* order-service sẽ verify lại với payment-service */
      }
      await orderApi.acceptChangeRequest(request.id, {
        paymentId: payment.paymentId,
        transactionId: paymentIntentId,
      });
      onChange();
    } catch (e: any) {
      setError(e?.message || "Không thể áp dụng thay đổi sau khi thanh toán");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    setError("");
    try {
      await orderApi.rejectChangeRequest(request.id, {
        ...(rejectReason.trim() ? { reason: rejectReason.trim() } : {}),
      });
      onChange();
    } catch (e: any) {
      setError(e?.message || "Không thể từ chối chỉnh sửa");
    } finally {
      setBusy(false);
    }
  }

  const paymentHint =
    delta === 0
      ? "Tổng tiền không thay đổi."
      : method === "WALLET"
        ? delta > 0
          ? `Ví của bạn sẽ bị trừ thêm ${delta.toLocaleString("vi-VN")}₫ khi đồng ý.`
          : `Bạn sẽ được hoàn ${Math.abs(delta).toLocaleString("vi-VN")}₫ vào ví.`
        : method === "CREDIT_CARD"
          ? delta > 0
            ? isSmallCardDelta
              ? `Chênh lệch ${delta.toLocaleString("vi-VN")}₫ quá nhỏ để thanh toán bằng thẻ nên sẽ được trừ vào ví khi bạn đồng ý.`
              : `Bạn cần thanh toán thêm ${delta.toLocaleString("vi-VN")}₫ bằng thẻ.`
            : `Bạn sẽ được hoàn ${Math.abs(delta).toLocaleString("vi-VN")}₫ vào ví.`
          : `Số tiền thanh toán khi nhận hàng sẽ ${delta > 0 ? "tăng" : "giảm"} ${Math.abs(delta).toLocaleString("vi-VN")}₫.`;

  return (
    <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-[#1a1a2e]">
            🏪 Nhà hàng đề xuất chỉnh sửa đơn
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Đơn cần bạn xác nhận trước khi thay đổi có hiệu lực.
          </p>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium shrink-0">
          {request.status === "AWAITING_PAYMENT"
            ? "Chờ thanh toán"
            : "Chờ xác nhận"}
        </span>
      </div>

      {request.reason && (
        <p className="text-sm text-gray-700 bg-white rounded-xl p-2.5">
          📝 Lý do: {request.reason}
        </p>
      )}

      {(diff.removed.length > 0 || diff.added.length > 0) && (
        <div className="text-xs text-gray-600 space-y-0.5">
          {diff.removed.length > 0 && (
            <p className="text-red-600">− Bỏ: {diff.removed.join(", ")}</p>
          )}
          {diff.added.length > 0 && (
            <p className="text-green-600">+ Thêm: {diff.added.join(", ")}</p>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl p-3 text-sm space-y-1">
        <div className="flex justify-between text-gray-500">
          <span>Tổng hiện tại</span>
          <span>{toNum(request.before?.total).toLocaleString("vi-VN")}₫</span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>Giảm giá hiện tại</span>
          <span>
            -{toNum(request.before?.discount).toLocaleString("vi-VN")}₫
          </span>
        </div>
        <div className="flex justify-between font-semibold pt-1 border-t border-gray-100">
          <span>Tổng sau chỉnh sửa</span>
          <span className="text-[#ff6b35]">
            {toNum(request.after?.total).toLocaleString("vi-VN")}₫
          </span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Chênh lệch</span>
          <span className={delta > 0 ? "text-orange-600" : "text-green-600"}>
            {delta > 0 ? "+" : ""}
            {delta.toLocaleString("vi-VN")}₫
          </span>
        </div>
      </div>

      <p className="text-xs text-gray-600 bg-white rounded-xl p-2.5">
        💳 {paymentHint}
      </p>

      {request.expiresAt && (
        <p className="text-[11px] text-gray-400">
          Yêu cầu hết hạn lúc{" "}
          {new Date(request.expiresAt).toLocaleTimeString("vi-VN")} — quá hạn
          đơn sẽ giữ nguyên.
        </p>
      )}

      {request.status === "AWAITING_PAYMENT" ? (
        payment ? (
          <Elements stripe={stripePromise}>
            <CardPayForm
              clientSecret={payment.clientSecret}
              amount={payment.amount || Math.abs(delta)}
              onPaid={handleCardPaid}
              onError={setError}
            />
          </Elements>
        ) : (
          <p className="text-xs text-gray-500 text-center py-2">
            Đang chuẩn bị thanh toán...
          </p>
        )
      ) : showReject ? (
        <div className="space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            placeholder="Lý do từ chối (không bắt buộc)"
            className="w-full border rounded-xl px-3 py-2 text-sm outline-none bg-white"
          />
          <div className="flex gap-2">
            <button
              onClick={handleReject}
              disabled={busy}
              className="flex-1 bg-red-500 text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            >
              Xác nhận từ chối
            </button>
            <button
              onClick={() => setShowReject(false)}
              className="flex-1 bg-white border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-semibold"
            >
              Hủy
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowReject(true)}
            disabled={busy}
            className="flex-1 bg-white border border-gray-300 text-gray-600 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            Từ chối
          </button>
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex-[2] bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {busy
              ? "Đang xử lý..."
              : delta > 0 && method === "CREDIT_CARD" && !isSmallCardDelta
                ? "Đồng ý & thanh toán"
                : "Đồng ý chỉnh sửa"}
          </button>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-xl p-2.5">
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
