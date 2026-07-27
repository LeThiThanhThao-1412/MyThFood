'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Elements } from '@stripe/react-stripe-js';
import {
  useStripe,
  useElements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
} from '@stripe/react-stripe-js';
import type {
  StripeCardNumberElementChangeEvent,
  StripeCardExpiryElementChangeEvent,
  StripeCardCvcElementChangeEvent,
} from '@stripe/stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useAuthStore } from '@mythfood/frontend-shared';
import { driverApi, orderApi, walletApi } from '@mythfood/api-client';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v) || 0;
  return 0;
}

const ELEMENT_STYLE = {
  base: { fontSize: '15px', color: '#1f2937', fontFamily: 'ui-sans-serif, system-ui', '::placeholder': { color: '#9ca3af' } },
  invalid: { color: '#ef4444', iconColor: '#ef4444' },
};

function getStripeKey(): string {
  return process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
}

let stripeP: any = null;
function getStripePromise() {
  if (!stripeP) {
    const key = getStripeKey();
    if (key) stripeP = loadStripe(key);
  }
  return stripeP;
}

// ─── Stripe Top-up Form ────────────────────────────────────
function StripeTopupForm({
  amount,
  ownerId,
  onSuccess,
  onError,
  onCancel,
}: {
  amount: number;
  ownerId: string;
  onSuccess: (newBalance: number) => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || !cardComplete) return;
    setProcessing(true);

    try {
      // Topup via backend wallet API
      const result = await walletApi.topup(ownerId, 'DRIVER', amount);
      onSuccess(result.balance);
    } catch (err: any) {
      // Backend may return error — try direct call
      try {
        const result = await walletApi.topup(ownerId, 'DRIVER', amount);
        onSuccess(result.balance);
      } catch (err2: any) {
        onError(err2.message || 'Lỗi thanh toán');
      }
    } finally {
      setProcessing(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
      <h3 className="font-bold text-[#1a1a2e]">💳 Thanh toán {amount.toLocaleString('vi-VN')}₫</h3>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">Số thẻ</label>
        <div className={`rounded-xl border bg-gray-50 px-4 py-3.5 transition ${cardError ? 'border-red-300' : 'border-gray-200 focus-within:border-[#ff6b35] focus-within:ring-2 focus-within:ring-orange-200'}`}>
          <CardNumberElement options={{ style: ELEMENT_STYLE, placeholder: '1234 5678 9012 3456', showIcon: true }}
            onChange={(e: StripeCardNumberElementChangeEvent) => { setCardComplete(e.complete); setCardError(e.error?.message || ''); }} />
        </div>
        {cardError && <p className="text-xs text-red-500 mt-1 ml-1">{cardError}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">Hết hạn</label>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 focus-within:border-[#ff6b35] focus-within:ring-2 focus-within:ring-orange-200">
            <CardExpiryElement options={{ style: ELEMENT_STYLE, placeholder: 'MM/YY' }} />
          </div>
        </div>
        <div><label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">CVC</label>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 focus-within:border-[#ff6b35] focus-within:ring-2 focus-within:ring-orange-200">
            <CardCvcElement options={{ style: ELEMENT_STYLE, placeholder: '123' }} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 justify-center">
        {['Visa', 'Mastercard', 'JCB'].map(b => <span key={b} className="text-[10px] bg-gray-100 px-2 py-1 rounded font-medium text-gray-500">{b}</span>)}
        <span className="text-[10px] bg-green-50 text-green-600 px-2 py-1 rounded font-semibold">3DS</span>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold text-sm">Hủy</button>
        <button type="submit" disabled={!stripe || processing || !cardComplete}
          className="flex-1 bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
          {processing ? <><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang xử lý...</> : `Thanh toán ${amount.toLocaleString('vi-VN')}₫`}
        </button>
      </div>
      <p className="text-xs text-gray-400 text-center">🔒 Bảo mật bởi Stripe</p>
    </form>
  );
}

// ═══════════════════════════════════════════════════════════════
export default function DriverWalletPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [driver, setDriver] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'credit' | 'income'>('credit');

  const [topupAmount, setTopupAmount] = useState('');
  const [topupStatus, setTopupStatus] = useState('');
  const [showStripe, setShowStripe] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState('');

  // Real wallet data from backend
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTx, setWalletTx] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); return; }
    async function load() {
      try {
        const dRes = await driverApi.getByUserId(user?.id || '');
        const d = (dRes as any).data ?? dRes;
        setDriver(d);

        if (d?.id) {
          // Load wallet from backend
          try {
            const wallet = await walletApi.getWallet(d.id, 'DRIVER');
            setWalletBalance(wallet.balance);
            setWalletTx(wallet.transactions || []);
          } catch { /* wallet service might not be running */ }

          // Load orders
          try {
            const oRes = await orderApi.listByDriver(d.id);
            setAllOrders(Array.isArray(oRes) ? oRes : []);
          } catch {}
        }
      } catch {} finally { setLoading(false); }
    }
    load();
  }, [isAuthenticated, user, router]);

  const activeCODOrders = allOrders.filter(o => o.status === 'OUT_FOR_DELIVERY' || o.status === 'READY_FOR_PICKUP');
  const holdAmount = activeCODOrders.reduce((sum, o) => sum + toNum(o.totalAmount), 0);

  // Income = from wallet balance (settlement) + computed from orders
  const deliveredOrders = allOrders.filter(o => o.status === 'DELIVERED');
  const incomeFromOrders = deliveredOrders.reduce((sum, o) => sum + Math.round(toNum(o.deliveryFee || 15000) * 0.75), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  const driverId = driver?.id || user?.id || '';

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <header className="bg-[#1a1a2e] px-4 sm:px-6 py-4 text-white">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-white/60 text-lg">←</Link>
          <h1 className="text-lg font-bold">💰 Ví của tôi</h1>
          <div className="w-6" />
        </div>
      </header>

      <div className="flex mx-4 mt-4 bg-white rounded-2xl p-1.5 shadow-sm max-w-md lg:max-w-lg lg:mx-auto">
        {[{ key: 'credit' as const, icon: '💳', label: 'Ví tín dụng' }, { key: 'income' as const, icon: '💵', label: 'Ví thu nhập' }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${tab === t.key ? 'bg-[#ff6b35] text-white shadow-md' : 'text-gray-500'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {tab === 'credit' && (
          <>
            <div className="bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44] rounded-2xl p-6 text-white">
              <p className="text-sm text-white/60">Số dư ví tín dụng</p>
              <p className="text-3xl font-extrabold mt-1">{walletBalance.toLocaleString('vi-VN')}₫</p>
              <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/10">
                <div><p className="text-xs text-white/50">Khả dụng</p><p className="text-lg font-bold text-[#2ecc71]">{Math.max(0, walletBalance - holdAmount).toLocaleString('vi-VN')}₫</p></div>
                <div><p className="text-xs text-white/50">Đang giữ COD</p><p className="text-lg font-bold text-[#e67e22]">{holdAmount.toLocaleString('vi-VN')}₫</p></div>
              </div>
            </div>

            <div className="bg-[#fff7ed] rounded-2xl p-4 border border-orange-100 text-sm text-gray-600">
              <p className="font-semibold text-[#ff6b35] mb-2">💡 Ví tín dụng:</p>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Nhận đơn COD → tiền bị <strong>đóng băng</strong></li>
                <li>Giao thành công → tiền được <strong>giải phóng</strong></li>
                <li className="text-red-500">⚠️ KHÔNG thể rút tiền từ ví này</li>
              </ul>
            </div>

            {showStripe && Number(topupAmount) >= 50000 ? (
              <Elements stripe={getStripePromise()} options={{ appearance: { theme: 'stripe', variables: { colorPrimary: '#f97316', borderRadius: '12px' } } }}>
                <StripeTopupForm
                  amount={Number(topupAmount)}
                  ownerId={driverId}
                  onSuccess={(newBalance) => {
                    setWalletBalance(newBalance);
                    setShowStripe(false);
                    setTopupStatus(`✅ Đã nạp ${Number(topupAmount).toLocaleString('vi-VN')}đ thành công!`);
                    setTopupAmount('');
                  }}
                  onError={(msg) => { setTopupStatus('❌ ' + msg); setShowStripe(false); }}
                  onCancel={() => setShowStripe(false)}
                />
              </Elements>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-bold text-[#1a1a2e] mb-3">💳 Nạp tiền qua Stripe</h3>
                <div className="flex gap-2 mb-3 flex-wrap">
                  {[100000, 200000, 500000, 1000000].map(amt => (
                    <button key={amt} onClick={() => setTopupAmount(amt.toString())}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${topupAmount === amt.toString() ? 'border-[#ff6b35] bg-[#fff7ed] text-[#ff6b35]' : 'border-gray-200 text-gray-500'}`}>
                      {amt >= 1000000 ? `${amt/1000000}tr` : `${(amt/1000).toFixed(0)}k`}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="number" value={topupAmount} onChange={e => setTopupAmount(e.target.value)}
                    placeholder="Số tiền (tối thiểu 50.000đ)"
                    className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]" />
                  <button onClick={() => { if (!topupAmount || Number(topupAmount) < 50000) { setTopupStatus('❌ Tối thiểu 50.000đ'); return; } setShowStripe(true); }}
                    className="bg-[#ff6b35] text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition whitespace-nowrap">
                    Nạp qua Stripe
                  </button>
                </div>
                {topupStatus && <p className={`text-sm mt-2 font-medium ${topupStatus.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{topupStatus}</p>}
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-[#1a1a2e] mb-3">📋 Lịch sử giao dịch</h3>
              <div className="space-y-2">
                {walletTx.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Chưa có giao dịch</p>}
                {walletTx.map((tx: any) => (
                  <div key={tx.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tx.type === 'CREDIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {tx.type === 'CREDIT' ? 'NẠP' : 'RÚT'}
                        </span>
                        <span className="text-sm text-gray-700 truncate">{tx.description}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(tx.createdAt).toLocaleString('vi-VN')}</p>
                    </div>
                    <span className={`text-sm font-semibold ml-3 ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}>
                      {tx.type === 'CREDIT' ? '+' : '-'}{tx.amount?.toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {tab === 'income' && (
          <>
            <div className="bg-gradient-to-br from-[#2ecc71] to-[#27ae60] rounded-2xl p-6 text-white">
              <p className="text-sm text-white/80">Số dư ví thu nhập</p>
              <p className="text-3xl font-extrabold mt-1">{incomeFromOrders.toLocaleString('vi-VN')}₫</p>
            </div>

            <div className="bg-green-50 rounded-2xl p-4 border border-green-100 text-sm text-gray-600">
              <p className="font-semibold text-green-700 mb-2">✅ Ví thu nhập:</p>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Nhận: Phí ship (75%), tip, thưởng</li>
                <li><strong>CÓ THỂ rút</strong> về ngân hàng</li>
                <li>Điều kiện: ≥ 50.000đ, tối đa 3 lần/ngày</li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-[#1a1a2e] mb-3">🏦 Rút tiền</h3>
              <div className="flex gap-2 mb-2">
                <input type="number" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)}
                  placeholder="Tối thiểu 50.000đ" className="flex-1 bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-green-500" />
                <button onClick={async () => {
                  const amt = Number(withdrawAmount);
                  if (!amt || amt < 50000) { setWithdrawStatus('❌ Tối thiểu 50.000đ'); return; }
                  try {
                    const result = await walletApi.withdraw(driverId, 'DRIVER', amt);
                    setWalletBalance(result.balance);
                    setWithdrawStatus(`✅ Yêu cầu rút ${amt.toLocaleString('vi-VN')}đ đã gửi (24-48h)`);
                    setWithdrawAmount('');
                  } catch (err: any) {
                    setWithdrawStatus('❌ ' + (err.message || 'Lỗi rút tiền'));
                  }
                }} className="bg-[#2ecc71] text-white px-5 py-3 rounded-xl font-semibold text-sm hover:bg-green-600 transition whitespace-nowrap">
                  Rút tiền
                </button>
              </div>
              {withdrawStatus && <p className={`text-sm font-medium ${withdrawStatus.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{withdrawStatus}</p>}
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5">
              <h3 className="font-bold text-[#1a1a2e] mb-3">📋 Đơn đã giao</h3>
              <div className="space-y-2">
                {deliveredOrders.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Chưa có đơn nào</p>}
                {deliveredOrders.map((o: any) => (
                  <div key={o.id} className="flex justify-between text-sm py-2 border-b border-gray-50">
                    <span className="text-gray-700">#{o.id?.slice(0, 8)}</span>
                    <span className="text-green-600 font-semibold">+{Math.round(toNum(o.deliveryFee || 15000) * 0.75).toLocaleString('vi-VN')}₫</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </main>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🏠</span><span>Trang chủ</span></Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">📦</span><span>Đơn hàng</span></Link>
        <Link href="/location" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🗺️</span><span>Bản đồ</span></Link>
        <Link href="/wallet" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"><span className="text-[22px]">💰</span><span>Ví</span></Link>
        <button onClick={() => { clearAuth(); router.push('/'); }} className="flex flex-col items-center text-[10px] text-gray-400 bg-transparent border-none font-sans cursor-pointer"><span className="text-[22px]">👤</span><span>Tài khoản</span></button>
      </nav>
    </div>
  );
}