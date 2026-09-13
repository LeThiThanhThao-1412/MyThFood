"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Elements } from "@stripe/react-stripe-js";
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from "@stripe/react-stripe-js";
import type {
  StripeCardNumberElementChangeEvent,
  StripeCardExpiryElementChangeEvent,
  StripeCardCvcElementChangeEvent,
} from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useAuthStore } from "@mythfood/frontend-shared";
import { walletApi } from "@mythfood/api-client";
import { resolveConsumerId } from "@/lib/consumer";

const MIN_WITHDRAW = 10_000;
const QUICK_AMOUNTS = [100_000, 200_000, 500_000, 1_000_000, 2_000_000];

const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "",
);

function toNum(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseFloat(v) || 0;
  return 0;
}

const ELEMENT_STYLE = {
  base: {
    fontSize: "15px",
    color: "#1f2937",
    fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    "::placeholder": { color: "#9ca3af" },
  },
  invalid: { color: "#ef4444", iconColor: "#ef4444" },
};

// ─── Stripe Top-up Form ────────────────────────────────────
function StripeTopupForm({
  clientSecret,
  amount,
  onSuccess,
  onError,
  onCancel,
}: {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !cardComplete) return;

    const cardElement = elements.getElement(CardNumberElement);
    if (!cardElement) {
      onError("Không thể kết nối Stripe. Vui lòng thử lại.");
      return;
    }

    setProcessing(true);
    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } },
      );

      if (error) {
        onError(error.message || "Thanh toán thất bại");
        return;
      }

      if (
        paymentIntent?.status === "succeeded" ||
        paymentIntent?.status === "requires_capture"
      ) {
        onSuccess();
      } else {
        onError("Thanh toán chưa hoàn tất. Vui lòng thử lại.");
      }
    } catch (err: any) {
      onError(err.message || "Lỗi thanh toán");
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-2xl shadow-sm p-5 space-y-4"
    >
      <h3 className="font-bold text-[#1a1a2e]">
        💳 Thanh toán {amount.toLocaleString("vi-VN")}₫
      </h3>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
          Số thẻ
        </label>
        <div
          className={`rounded-xl border bg-gray-50 px-4 py-3.5 transition ${
            cardError
              ? "border-red-300"
              : "border-gray-200 focus-within:border-[#ff6b35] focus-within:ring-2 focus-within:ring-orange-200"
          }`}
        >
          <CardNumberElement
            options={{
              style: ELEMENT_STYLE,
              placeholder: "1234 5678 9012 3456",
              showIcon: true,
            }}
            onChange={(e: StripeCardNumberElementChangeEvent) => {
              setCardComplete(e.complete);
              setCardError(e.error?.message || "");
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
            Hết hạn
          </label>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 focus-within:border-[#ff6b35] focus-within:ring-2 focus-within:ring-orange-200">
            <CardExpiryElement
              options={{ style: ELEMENT_STYLE, placeholder: "MM / YY" }}
              onChange={(e: StripeCardExpiryElementChangeEvent) =>
                setCardError(e.error?.message || "")
              }
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
            CVC
          </label>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 focus-within:border-[#ff6b35] focus-within:ring-2 focus-within:ring-orange-200">
            <CardCvcElement
              options={{ style: ELEMENT_STYLE, placeholder: "123" }}
              onChange={(e: StripeCardCvcElementChangeEvent) =>
                setCardError(e.error?.message || "")
              }
            />
          </div>
        </div>
      </div>

      {cardError && <p className="text-xs text-red-500">{cardError}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={!stripe || processing || !cardComplete}
          className="flex-1 bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Đang xử lý...
            </>
          ) : (
            `Thanh toán ${amount.toLocaleString("vi-VN")}₫`
          )}
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center">🔒 Bảo mật bởi Stripe</p>
    </form>
  );
}

// ─── Main Wallet Page ──────────────────────────────────────
export default function WalletPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [consumerId, setConsumerId] = useState("");

  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTx, setWalletTx] = useState<any[]>([]);

  const [topupAmount, setTopupAmount] = useState("");
  const [topupStatus, setTopupStatus] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showStripe, setShowStripe] = useState(false);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");

  async function loadWallet(cid: string) {
    try {
      const wallet = await walletApi.getWallet(cid, "CONSUMER");
      setWalletBalance(toNum(wallet.balance));
      setWalletTx(wallet.transactions || []);
    } catch {
      /* wallet service might not be running */
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const cid = await resolveConsumerId(user?.id || "", user?.fullName);
        setConsumerId(cid || "");
        if (cid) await loadWallet(cid);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/profile" className="text-white/60 text-lg">
            ←
          </Link>
          <h1 className="text-lg font-bold">💰 Ví của tôi</h1>
          <div className="w-6" />
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* ─── Balance Card ─── */}
        <div className="bg-gradient-to-br from-[#ff6b35] to-[#ff8f65] rounded-2xl p-6 text-white">
          <p className="text-sm text-white/80">Số dư ví</p>
          <p className="text-3xl font-extrabold mt-1">
            {walletBalance.toLocaleString("vi-VN")}₫
          </p>
          <p className="text-xs text-white/70 mt-3">
            Dùng số dư ví để thanh toán đơn hàng, nạp tiền qua Stripe hoặc rút
            về tài khoản.
          </p>
        </div>

        {/* ─── Top-up (Stripe) ─── */}
        {showStripe && clientSecret ? (
          <Elements
            stripe={stripePromise}
            options={{
              appearance: {
                theme: "stripe",
                variables: { colorPrimary: "#ff6b35", borderRadius: "12px" },
              },
            }}
          >
            <StripeTopupForm
              clientSecret={clientSecret}
              amount={Number(topupAmount)}
              onSuccess={async () => {
                // Credit the wallet directly after the card is charged.
                // (Stripe webhook is not reachable on localhost, so we can't
                // rely on it to credit the wallet here.)
                try {
                  await walletApi.topup(
                    consumerId,
                    "CONSUMER",
                    Number(topupAmount),
                  );
                } catch {
                  /* non-fatal - webhook may still credit it */
                }
                setShowStripe(false);
                setClientSecret("");
                setTopupStatus(
                  `✅ Đã nạp ${Number(topupAmount).toLocaleString("vi-VN")}₫ thành công!`,
                );
                setTopupAmount("");
                loadWallet(consumerId);
              }}
              onError={(msg) => {
                setTopupStatus("❌ " + msg);
                setShowStripe(false);
                setClientSecret("");
              }}
              onCancel={() => {
                setShowStripe(false);
                setClientSecret("");
              }}
            />
          </Elements>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h3 className="font-bold text-[#1a1a2e] mb-3">
              💳 Nạp tiền qua Stripe
            </h3>
            <div className="flex gap-2 mb-3 flex-wrap">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTopupAmount(amt.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    topupAmount === amt.toString()
                      ? "border-[#ff6b35] bg-[#fff7ed] text-[#ff6b35]"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {amt >= 1000000
                    ? `${amt / 1000000}tr`
                    : `${(amt / 1000).toFixed(0)}k`}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                value={topupAmount}
                onChange={(e) => setTopupAmount(e.target.value)}
                placeholder={`Số tiền (tối thiểu ${MIN_WITHDRAW.toLocaleString("vi-VN")}₫)`}
                className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]"
              />
              <button
                onClick={async () => {
                  if (!topupAmount || Number(topupAmount) < MIN_WITHDRAW) {
                    setTopupStatus(
                      `❌ Tối thiểu ${MIN_WITHDRAW.toLocaleString("vi-VN")}₫`,
                    );
                    return;
                  }
                  try {
                    const res = await walletApi.topupStripe(
                      consumerId,
                      "CONSUMER",
                      Number(topupAmount),
                    );
                    setClientSecret(res.clientSecret || "");
                    setShowStripe(true);
                    setTopupStatus("");
                  } catch (err: any) {
                    setTopupStatus(
                      "❌ " +
                        (err.message || "Không thể tạo giao dịch nạp tiền"),
                    );
                  }
                }}
                className="bg-[#ff6b35] text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition whitespace-nowrap"
              >
                Nạp qua Stripe
              </button>
            </div>
            {topupStatus && (
              <p
                className={`text-sm mt-2 font-medium ${
                  topupStatus.startsWith("✅")
                    ? "text-green-600"
                    : "text-red-500"
                }`}
              >
                {topupStatus}
              </p>
            )}
          </div>
        )}

        {/* ─── Withdraw ─── */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">
            🏦 Rút tiền về ngân hàng
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            Tối thiểu {MIN_WITHDRAW.toLocaleString("vi-VN")}₫
          </p>
          <div className="flex gap-2 mb-2">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder={`Tối thiểu ${MIN_WITHDRAW.toLocaleString("vi-VN")}₫`}
              className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]"
            />
            <button
              onClick={async () => {
                const amt = Number(withdrawAmount);
                if (!amt || amt < MIN_WITHDRAW) {
                  setWithdrawStatus(
                    `❌ Tối thiểu ${MIN_WITHDRAW.toLocaleString("vi-VN")}₫`,
                  );
                  return;
                }
                try {
                  const result = await walletApi.withdraw(
                    consumerId,
                    "CONSUMER",
                    amt,
                  );
                  setWalletBalance(result.balance);
                  setWithdrawStatus(
                    `✅ Đã rút ${amt.toLocaleString("vi-VN")}₫. Số dư mới: ${result.balance.toLocaleString("vi-VN")}₫`,
                  );
                  setWithdrawAmount("");
                  loadWallet(consumerId);
                } catch (err: any) {
                  setWithdrawStatus("❌ " + (err.message || "Lỗi rút tiền"));
                }
              }}
              className="bg-[#ff6b35] text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition whitespace-nowrap"
            >
              Rút tiền
            </button>
          </div>
          {withdrawStatus && (
            <p
              className={`text-sm font-medium ${
                withdrawStatus.startsWith("✅")
                  ? "text-green-600"
                  : "text-red-500"
              }`}
            >
              {withdrawStatus}
            </p>
          )}
        </div>

        {/* ─── Transaction History ─── */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="font-bold text-[#1a1a2e] mb-3">
            📋 Lịch sử giao dịch
          </h3>
          <div className="space-y-2">
            {walletTx.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">
                Chưa có giao dịch
              </p>
            )}
            {walletTx.map((tx: any) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                        tx.type === "CREDIT"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}
                    >
                      {tx.type === "CREDIT" ? "NHẬN" : "CHI"}
                    </span>
                    <span className="text-sm text-gray-700 truncate">
                      {tx.description}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {new Date(tx.createdAt).toLocaleString("vi-VN")}
                  </p>
                </div>
                <span
                  className={`text-sm font-semibold ml-3 ${
                    tx.type === "CREDIT" ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {tx.type === "CREDIT" ? "+" : "-"}
                  {toNum(tx.amount).toLocaleString("vi-VN")}₫
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ─── Mobile bottom nav ─── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/dashboard"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📦</span>
          <span>Đơn hàng</span>
        </Link>
        <Link
          href="/wallet"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">💰</span>
          <span>Ví</span>
        </Link>
        <button
          onClick={() => {
            clearAuth();
            router.push("/");
          }}
          className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"
        >
          <span className="text-[22px]">👤</span>
          <span>Tài khoản</span>
        </button>
      </nav>
      <div className="lg:hidden h-20" />
    </div>
  );
}
