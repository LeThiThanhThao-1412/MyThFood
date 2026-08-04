'use client';
import { useEffect, useState, useCallback, useRef, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
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
import {
  orderApi,
  consumerApi,
  paymentApi,
  merchantApi,
  type ConsumerProfile,
  type Address,
  type PaymentMethod,
  type PlaceOrderRequest,
  type Order,
} from '@mythfood/api-client';
import { useCartStore, useAuthStore } from '@mythfood/frontend-shared';
import { calculateShippingFee, type ShippingFeeInfo } from './shipping-utils';

// ─── Stripe JS ───────────────────────────────────────────────
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '',
);

// ─── Dynamic Map ─────────────────────────────────────────────
const CheckoutMap = dynamic(
  () => import('@mythfood/frontend-shared/components/MapView'),
  { ssr: false },
);

// ─── Types / Constants ──────────────────────────────────────
interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

const ADDRESS_TYPE_LABELS: Record<string, { icon: string; label: string }> = {
  HOME: { icon: '🏠', label: 'Nhà' },
  WORK: { icon: '🏢', label: 'Cơ quan' },
  OTHER: { icon: '📍', label: 'Khác' },
};

const ELEMENT_STYLE = {
  base: {
    fontSize: '15px',
    color: '#1f2937',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    '::placeholder': { color: '#9ca3af' },
  },
  invalid: { color: '#ef4444', iconColor: '#ef4444' },
};

function detectCardBrand(brand: string): { label: string } | null {
  const map: Record<string, string> = {
    visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex',
    discover: 'Discover', jcb: 'JCB', unionpay: 'UnionPay', diners: 'Diners',
  };
  const label = map[brand.toLowerCase()];
  return label ? { label } : null;
}

// ─── Stripe Card Form (inline) ──────────────────────────────
function StripeCardFields({
  cardBrand,
  cardComplete, setCardComplete, cardError, setCardError, setCardBrand,
  expiryComplete, setExpiryComplete, expiryError, setExpiryError,
  cvcComplete, setCvcComplete, cvcError, setCvcError,
}: {
  cardBrand: { label: string } | null;
  cardComplete: boolean;
  setCardComplete: (v: boolean) => void;
  cardError: string;
  setCardError: (v: string) => void;
  setCardBrand: (v: { label: string } | null) => void;
  expiryComplete: boolean;
  setExpiryComplete: (v: boolean) => void;
  expiryError: string;
  setExpiryError: (v: string) => void;
  cvcComplete: boolean;
  setCvcComplete: (v: boolean) => void;
  cvcError: string;
  setCvcError: (v: string) => void;
}) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in-up">
      <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3 ml-1">
        💳 Nhập thông tin thẻ
      </p>

      {/* Card Number */}
      <div className="mb-3">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">Số thẻ</label>
        <div className={`relative rounded-xl border bg-gray-50 px-4 py-3 transition-all ${
          cardError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus-within:border-purple-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-200'
        }`}>
          <CardNumberElement
            options={{ style: ELEMENT_STYLE, placeholder: '1234 5678 9012 3456', showIcon: true }}
            onChange={(e: StripeCardNumberElementChangeEvent) => {
              setCardComplete(e.complete);
              setCardError(e.error?.message || '');
              setCardBrand(e.brand ? detectCardBrand(e.brand) : null);
            }}
          />
          {cardBrand && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
              {cardBrand.label}
            </span>
          )}
        </div>
        {cardError && <p className="text-xs text-red-500 mt-1 ml-1">{cardError}</p>}
      </div>

      {/* Expiry + CVC */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">Hết hạn (MM/YY)</label>
          <div className={`rounded-xl border bg-gray-50 px-4 py-3 transition-all ${
            expiryError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus-within:border-purple-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-200'
          }`}>
            <CardExpiryElement
              options={{ style: ELEMENT_STYLE, placeholder: 'MM / YY' }}
              onChange={(e: StripeCardExpiryElementChangeEvent) => {
                setExpiryComplete(e.complete);
                setExpiryError(e.error?.message || '');
              }}
            />
          </div>
          {expiryError && <p className="text-xs text-red-500 mt-1 ml-1">{expiryError}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">Mã CVC</label>
          <div className={`rounded-xl border bg-gray-50 px-4 py-3 transition-all ${
            cvcError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus-within:border-purple-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-200'
          }`}>
            <CardCvcElement
              options={{ style: ELEMENT_STYLE, placeholder: '123' }}
              onChange={(e: StripeCardCvcElementChangeEvent) => {
                setCvcComplete(e.complete);
                setCvcError(e.error?.message || '');
              }}
            />
          </div>
          {cvcError && <p className="text-xs text-red-500 mt-1 ml-1">{cvcError}</p>}
        </div>
      </div>

      {/* Card brand badges */}
      <div className="flex items-center gap-2 justify-center">
        {['Visa', 'Mastercard', 'Amex', 'JCB'].map(b => (
          <span key={b} className={`text-[10px] px-2 py-0.5 rounded font-medium border transition-colors ${
            cardBrand?.label === b ? 'bg-purple-50 border-purple-300 text-purple-600' : 'bg-transparent border-gray-200 text-gray-400'
          }`}>{b}</span>
        ))}
        <span className="text-[10px] bg-green-50 text-green-600 px-2 py-0.5 rounded font-semibold border border-green-200">🔒 3DS</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
function CheckoutContent() {
  const router = useRouter();
  const stripe = useStripe();
  const elementsHook = useElements();
  const { user, isAuthenticated, token } = useAuthStore();
  const { items, merchantId, merchantName, clearCart, getSubtotal } = useCartStore();

  const [consumerId, setConsumerId] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);

  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [customAddress, setCustomAddress] = useState('');
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [lat, setLat] = useState(10.775);
  const [lng, setLng] = useState(106.7);
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [promoCode, setPromoCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [promoApplied, setPromoApplied] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const suggestionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRef = useRef<HTMLDivElement | null>(null);

  // Stripe card state
  const [cardBrand, setCardBrand] = useState<{ label: string } | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardError, setCardError] = useState('');
  const [expiryComplete, setExpiryComplete] = useState(false);
  const [expiryError, setExpiryError] = useState('');
  const [cvcComplete, setCvcComplete] = useState(false);
  const [cvcError, setCvcError] = useState('');
  const [stripeError, setStripeError] = useState('');

  useEffect(() => {
    if (!isAuthenticated) { router.push('/login'); }
  }, [isAuthenticated, router]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionRef.current && !suggestionRef.current.contains(e.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setProfileLoading(false);
      return;
    }
    const currentUser = user;
    async function loadConsumer() {
      let found = false;
      try {
        const res: any = await consumerApi.getByUserId(currentUser.id);
        // API có thể trả về dạng { data: {...} } hoặc trực tiếp object
        const profile = res?.data || res;
        if (profile?.id) {
          setConsumerId(profile.id);
          setAddresses(profile.addresses || []);
          setPaymentMethods(profile.paymentMethods || []);
          found = true;
        }
      } catch { /* getByUserId failed */ }

      // Fallback: dùng userId làm consumerId
      if (!found) {
        setConsumerId(currentUser.id);
      }
      setProfileLoading(false);
    }
    loadConsumer();
  }, [isAuthenticated, user, token]);

  const fetchSuggestions = useCallback((query: string) => {
    if (suggestionTimeout.current) clearTimeout(suggestionTimeout.current);
    if (query.length < 4) { setSuggestions([]); setShowSuggestions(false); return; }
    suggestionTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&countrycodes=VN`,
        );
        const data = await res.json();
        setSuggestions(data);
        setShowSuggestions(data.length > 0);
      } catch { setSuggestions([]); }
    }, 400);
  }, []);

  const detectMyLocation = () => {
    if (!navigator.geolocation) { setError('Trình duyệt không hỗ trợ định vị'); return; }
    setFetchingLocation(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      setLat(latitude); setLng(longitude);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1&accept-language=vi`);
        const data = await res.json();
        setCustomAddress(data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      } catch { setCustomAddress(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`); }
      setUseCustomAddress(true); setSelectedAddressId(null); setFetchingLocation(false);
    }, () => { setError('Không thể lấy vị trí.'); setFetchingLocation(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };

  const applyPromo = () => {
    if (!promoCode.trim()) return;
    const code = promoCode.trim().toUpperCase();
    if (code === 'PROMO10') { setDiscount(Math.round(subtotal * 0.1)); setPromoApplied(true); setError(''); }
    else if (code === 'PROMO20') { setDiscount(20000); setPromoApplied(true); setError(''); }
    else { setDiscount(0); setPromoApplied(false); setError('Mã khuyến mãi không hợp lệ'); }
  };

  const [dynamicFee, setDynamicFee] = useState<ShippingFeeInfo | null>(null);

  // Real merchant location (fetched from API)
  const [merchantLat, setMerchantLat] = useState(10.770);
  const [merchantLng, setMerchantLng] = useState(106.700);
  // COD support from merchant settings
  const [merchantCodAccepted, setMerchantCodAccepted] = useState(true);

  // Fetch merchant location & COD settings
  useEffect(() => {
    if (!merchantId) return;
    const mid = merchantId; // Narrow type for async closure
    let cancelled = false;
    async function fetchMerchantInfo() {
      try {
        const m = await merchantApi.getById(mid);
        if (!cancelled && m) {
          // Use real merchant coordinates
          if (m.latitude != null) setMerchantLat(m.latitude);
          if (m.longitude != null) setMerchantLng(m.longitude);
          // Check COD setting from merchant's localStorage
          const codSetting = localStorage.getItem(`merchant_${mid}_acceptsCod`);
          if (codSetting !== null) {
            setMerchantCodAccepted(codSetting === 'true');
          }
        }
      } catch {
        // Keep default values if fetch fails
      }
    }
    fetchMerchantInfo();
    return () => { cancelled = true; };
  }, [merchantId]);

  // Fetch dynamic shipping fee when location changes (client-side calculation)
  useEffect(() => {
    if (!merchantId) return;
    let cancelled = false;
    async function fetchFee() {
      try {
        const fee = await calculateShippingFee(merchantLat, merchantLng, lat, lng);
        if (!cancelled) setDynamicFee(fee);
      } catch {
        if (!cancelled) setDynamicFee(null);
      }
    }
    fetchFee();
    return () => { cancelled = true; };
  }, [lat, lng, merchantId, merchantLat, merchantLng]);

  const subtotal = getSubtotal();
  const deliveryFee = dynamicFee?.totalFee || 15000;
  const serviceFee = Math.round(subtotal * 0.02);
  const total = Math.max(0, subtotal + deliveryFee + serviceFee - discount);

  if (!isAuthenticated) return null;
  if (items.length === 0 && !successOrder) { router.push('/cart'); return null; }

  function getSelectedAddress(): Address | undefined { return addresses.find(a => a.id === selectedAddressId); }
  function getSelectedAddressLabel(): string {
    const addr = getSelectedAddress(); if (!addr) return '';
    const t = ADDRESS_TYPE_LABELS[addr.type] || ADDRESS_TYPE_LABELS.OTHER;
    return `${t.icon} ${t.label} - ${addr.address}`;
  }
  function handleAddressSelect(addr: Address) {
    setSelectedAddressId(addr.id); setUseCustomAddress(false); setCustomAddress(addr.address);
    if (addr.latitude) setLat(addr.latitude); if (addr.longitude) setLng(addr.longitude);
    setShowSuggestions(false);
  }
  function handleCustomAddressChange(value: string) {
    setCustomAddress(value); setUseCustomAddress(true); setSelectedAddressId(null); fetchSuggestions(value);
  }
  function selectSuggestion(s: Suggestion) {
    setCustomAddress(s.display_name); setLat(parseFloat(s.lat)); setLng(parseFloat(s.lon));
    setUseCustomAddress(true); setSelectedAddressId(null); setShowSuggestions(false);
  }

  async function handlePlaceOrder() {
    if (!user || !merchantId) {
      setError('Vui lòng đăng nhập và chọn nhà hàng');
      return;
    }
    if (!consumerId) {
      setError('Không thể tạo hồ sơ người dùng. Vui lòng thử đăng nhập lại.');
      return;
    }

    const finalAddress = useCustomAddress ? customAddress.trim() : getSelectedAddress()?.address || '';
    if (!finalAddress) { setError('Vui lòng chọn hoặc nhập địa chỉ giao hàng'); return; }

    // Validate card fields if Stripe
    if (paymentMethod === 'CREDIT_CARD') {
      if (!cardComplete || !expiryComplete || !cvcComplete) {
        setStripeError('Vui lòng điền đầy đủ và chính xác thông tin thẻ');
        return;
      }
    }

    setLoading(true); setError(''); setStripeError('');

    try {
      const orderBody: PlaceOrderRequest = {
        consumerId, merchantId, orderType: 'DELIVERY',
        items: items.map(i => ({
          menuItemId: i.menuItem.id, name: i.menuItem.name,
          quantity: i.quantity, unitPrice: i.menuItem.price,
          specialInstructions: i.specialInstructions || '',
        })),
        deliveryAddress: finalAddress, deliveryLatitude: lat, deliveryLongitude: lng,
        deliveryFee, serviceFee, discount, notes: notes || undefined,
      };

      const order = await orderApi.place(orderBody);

      // ─── COD ─────────────────────────────────────
      if (paymentMethod === 'CASH') {
        try {
          await paymentApi.create({ orderId: order.id, consumerId, merchantId, amount: order.totalAmount, paymentMethod: 'CASH' });
        } catch { /* non-fatal */ }
        clearCart();
        setSuccessOrder(order);
      }
      // ─── Stripe ──────────────────────────────────
      else {
        const cardElement = elementsHook?.getElement(CardNumberElement);
        if (!stripe || !cardElement) {
          setStripeError('Không thể kết nối Stripe. Vui lòng thử lại.');
          setLoading(false);
          return;
        }

        // Create PaymentIntent via backend
        const sp = await paymentApi.createStripePayment({
          orderId: order.id, consumerId, merchantId, amount: order.totalAmount, paymentMethod: 'CREDIT_CARD',
        });

        // Confirm card payment with clientSecret
        const { error: stripeErr, paymentIntent } = await stripe.confirmCardPayment(sp.clientSecret, {
          payment_method: { card: cardElement },
        });

        if (stripeErr) {
          setStripeError(stripeErr.message || 'Thanh toán thất bại');
          setLoading(false);
          return;
        }

        if (paymentIntent?.status === 'succeeded' || paymentIntent?.status === 'requires_capture') {
          try {
            await paymentApi.complete(sp.id, { transactionId: paymentIntent.id });
          } catch { /* non-fatal */ }
          clearCart();
          setSuccessOrder(order);
        } else {
          setStripeError('Thanh toán chưa hoàn tất. Vui lòng thử lại.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Đặt hàng thất bại. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  const isStripe = paymentMethod === 'CREDIT_CARD';
  const allFieldsValid = isStripe ? (cardComplete && expiryComplete && cvcComplete) : true;

  // ─── SUCCESS STATE ────────────────────────────────
  if (successOrder) {
    return (
      <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-2xl font-extrabold text-[#1a1a2e] mb-2">Đặt hàng thành công!</h1>
            <p className="text-gray-500 mb-4">Đơn hàng của bạn đang được xử lý</p>
            <div className="bg-[#fff7ed] rounded-2xl p-5 mb-6 text-left text-sm">
              <p className="font-bold text-gray-800 mb-2">📋 Mã đơn: <span className="text-[#ff6b35]">#{successOrder.id.slice(0, 8)}</span></p>
              <div className="space-y-1.5 text-gray-600">
                <p>🏪 {merchantName}</p>
                <p>📍 {successOrder.deliveryAddress}</p>
                <p className="font-bold text-[#ff6b35] text-base mt-2">{successOrder.totalAmount?.toLocaleString('vi-VN')}₫</p>
              </div>
            </div>
            <div className="space-y-3">
              <Link href={`/orders/${successOrder.id}`} className="block w-full bg-[#ff6b35] text-white py-3.5 rounded-xl font-semibold hover:bg-orange-600 transition">Theo dõi đơn hàng →</Link>
              <Link href="/dashboard" className="block w-full bg-gray-100 text-gray-700 py-3.5 rounded-xl font-semibold hover:bg-gray-200 transition">← Về trang chủ</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const cartCount = items.reduce((sum, i) => sum + i.quantity, 0);

  // ─── MAIN CHECKOUT FORM ───────────────────────────
  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Navbar */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/cart" className="text-gray-400 hover:text-[#ff6b35] text-lg transition">←</Link>
            <h1 className="text-lg font-bold text-[#1a1a2e]">Thanh toán</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/cart" className="relative text-xl hover:scale-110 transition-transform">
              🛒
              {cartCount > 0 && <span className="absolute -top-1.5 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{cartCount}</span>}
            </Link>
            <div className="w-9 h-9 bg-[#ff6b35] rounded-full flex items-center justify-center text-white font-bold text-sm">
              {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* LEFT */}
          <div className="lg:col-span-2 space-y-6">
            {error && <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-2xl text-sm flex items-start gap-3"><span className="text-lg shrink-0">⚠️</span><span>{error}</span></div>}

            {/* ─── 1. ĐỊA CHỈ ─── */}
            <section className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-[#1a1a2e] mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-[#fff7ed] rounded-xl flex items-center justify-center text-lg">📍</span>Địa chỉ giao hàng
              </h2>
              {profileLoading ? (
                <div className="animate-pulse space-y-3"><div className="h-12 bg-gray-100 rounded-xl" /><div className="h-[200px] bg-gray-100 rounded-xl" /></div>
              ) : (
                <>
                  <button type="button" onClick={detectMyLocation} disabled={fetchingLocation} className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-dashed border-blue-200 bg-blue-50/50 hover:bg-blue-50 transition mb-4 text-left">
                    <span className="text-2xl">📍</span>
                    <div className="flex-1"><p className="text-sm font-semibold text-blue-700">{fetchingLocation ? 'Đang xác định...' : 'Sử dụng vị trí hiện tại'}</p><p className="text-xs text-blue-500">Tự động qua GPS</p></div>
                    {fetchingLocation && <span className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                  </button>
                  {addresses.length > 0 && !useCustomAddress && (
                    <div className="space-y-2 mb-4">
                      {addresses.map(addr => { const t = ADDRESS_TYPE_LABELS[addr.type] || ADDRESS_TYPE_LABELS.OTHER; return (
                        <label key={addr.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selectedAddressId === addr.id ? 'border-[#ff6b35] bg-[#fff7ed] ring-2 ring-orange-200' : 'border-gray-100 hover:border-gray-300'}`}>
                          <input type="radio" name="address" checked={selectedAddressId === addr.id} onChange={() => handleAddressSelect(addr)} className="mt-0.5 accent-[#ff6b35]" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-gray-800">{t.icon} {t.label}</span>
                              {addr.isDefault && <span className="text-[10px] bg-orange-100 text-[#ff6b35] px-2 py-0.5 rounded-full font-semibold">Mặc định</span>}
                            </div>
                            <p className="text-sm text-gray-500 truncate">{addr.address}</p>
                          </div>
                        </label>
                      )})}
                    </div>
                  )}
                  <button type="button" onClick={() => { setUseCustomAddress(!useCustomAddress); if (!useCustomAddress) { setSelectedAddressId(null); setCustomAddress(''); } else { const da = addresses.find(a => a.isDefault); if (da) handleAddressSelect(da); } }} className="text-sm text-[#ff6b35] hover:text-orange-600 font-semibold mb-3 inline-block">
                    {useCustomAddress ? '← Chọn địa chỉ đã lưu' : '+ Nhập địa chỉ mới'}
                  </button>
                  <div className="relative mb-3" ref={suggestionRef}>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                      <input type="text" value={useCustomAddress ? customAddress : getSelectedAddressLabel()} onChange={e => handleCustomAddressChange(e.target.value)} placeholder="Nhập địa chỉ giao hàng..." className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-11 pr-4 py-3 text-sm focus:bg-white focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none transition" />
                    </div>
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-100 rounded-2xl shadow-lg max-h-60 overflow-y-auto">
                        {suggestions.map((s, i) => (
                          <button key={i} type="button" onClick={() => selectSuggestion(s)} className="w-full text-left px-4 py-3 text-sm hover:bg-orange-50 border-b border-gray-50 last:border-b-0 transition"><p className="text-gray-800 line-clamp-2">{s.display_name}</p></button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mb-3">👆 Kéo thả điểm trên bản đồ để điều chỉnh</p>
                  <div className="rounded-2xl overflow-hidden border border-gray-100">
                    <CheckoutMap locations={[{ latitude: lat, longitude: lng, label: '📍 Giao hàng', address: useCustomAddress ? customAddress : getSelectedAddress()?.address || '' }]} interactive height="260px" onLocationSelect={(nl, ng) => { setLat(nl); setLng(ng); }} />
                  </div>
                </>
              )}
            </section>

            {/* ─── 2. THANH TOÁN + STRIPE CARD ─── */}
            <section className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-[#1a1a2e] mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-[#fff7ed] rounded-xl flex items-center justify-center text-lg">💳</span>Phương thức thanh toán
              </h2>

              <div className="space-y-2.5">
                {/* Credit Card */}
                <label className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${isStripe ? 'border-purple-400 bg-purple-50/50 ring-2 ring-purple-200' : 'border-gray-100 hover:border-gray-300'}`}>
                  <input type="radio" name="payment" value="CREDIT_CARD" checked={isStripe} onChange={e => setPaymentMethod(e.target.value)} className="accent-purple-600" />
                  <div className="flex-1"><p className="text-sm font-semibold text-gray-800">💳 Thẻ tín dụng / Ghi nợ</p><p className="text-xs text-gray-400 mt-0.5">Visa, Mastercard, JCB - Bảo mật Stripe</p></div>
                  <div className="hidden sm:flex items-center gap-1.5">
                    <span className="text-xs bg-white border px-2 py-1 rounded font-medium text-gray-500">Visa</span>
                    <span className="text-xs bg-white border px-2 py-1 rounded font-medium text-gray-500">MC</span>
                    <span className="text-xs bg-white border px-2 py-1 rounded font-medium text-gray-500">JCB</span>
                    <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded font-semibold">🔒 3DS</span>
                  </div>
                </label>

                {/* COD */}
                <label className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                  !merchantCodAccepted
                    ? 'border-gray-100 cursor-not-allowed opacity-60'
                    : !isStripe
                      ? 'border-green-400 bg-green-50/50 ring-2 ring-green-200'
                      : 'border-gray-100 hover:border-gray-300'
                }`}>
                  <input
                    type="radio"
                    name="payment"
                    value="CASH"
                    checked={!isStripe}
                    onChange={e => {
                      if (merchantCodAccepted) setPaymentMethod(e.target.value);
                    }}
                    disabled={!merchantCodAccepted}
                    className="accent-green-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">💵 Tiền mặt (COD)</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {merchantCodAccepted
                        ? 'Thanh toán khi nhận hàng'
                        : '⚠️ Nhà hàng không hỗ trợ COD'}
                    </p>
                  </div>
                </label>

                {/* E-Wallet disabled */}
                <label className="flex items-center gap-4 p-4 rounded-xl border border-gray-100 cursor-not-allowed opacity-60">
                  <input type="radio" name="payment" disabled className="accent-blue-600" />
                  <div className="flex-1"><p className="text-sm font-semibold text-gray-800">📱 Ví điện tử</p><p className="text-xs text-gray-400 mt-0.5">Sắp ra mắt</p></div>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Sắp có</span>
                </label>
              </div>

              {/* Saved cards */}
              {paymentMethods.filter(pm => pm.type === 'CREDIT_CARD' || pm.type === 'DEBIT_CARD').length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Thẻ đã lưu</p>
                  <div className="space-y-2">
                    {paymentMethods.filter(pm => pm.type === 'CREDIT_CARD' || pm.type === 'DEBIT_CARD').map(pm => (
                      <label key={pm.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 cursor-pointer hover:border-gray-300 transition">
                        <input type="radio" name="payment_saved" value={pm.type} checked={paymentMethod === pm.type} onChange={e => setPaymentMethod(e.target.value)} className="accent-[#ff6b35]" />
                        <span className="text-sm text-gray-700">💳 {pm.provider} (••••{pm.lastFourDigits})</span>
                        {pm.isDefault && <span className="text-[10px] bg-orange-100 text-[#ff6b35] px-2 py-0.5 rounded-full font-semibold ml-auto">Mặc định</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* ═════════ INLINE STRIPE CARD FIELDS ═════════ */}
              {isStripe && (
                <StripeCardFields
                  cardBrand={cardBrand} cardComplete={cardComplete} setCardComplete={setCardComplete}
                  cardError={cardError} setCardError={setCardError} setCardBrand={setCardBrand}
                  expiryComplete={expiryComplete} setExpiryComplete={setExpiryComplete}
                  expiryError={expiryError} setExpiryError={setExpiryError}
                  cvcComplete={cvcComplete} setCvcComplete={setCvcComplete}
                  cvcError={cvcError} setCvcError={setCvcError}
                />
              )}
              {stripeError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm flex items-start gap-2"><span className="shrink-0">⚠️</span><span>{stripeError}</span></div>
              )}
            </section>

            {/* ─── 3. PROMO ─── */}
            <section className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-[#1a1a2e] mb-4 flex items-center gap-2"><span className="w-8 h-8 bg-[#fff7ed] rounded-xl flex items-center justify-center text-lg">🏷️</span>Mã khuyến mãi</h2>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">🏷️</span>
                  <input type="text" value={promoCode} onChange={e => { setPromoCode(e.target.value); setPromoApplied(false); setDiscount(0); }} onKeyDown={e => { if (e.key === 'Enter') applyPromo(); }} placeholder="Nhập mã..." className="w-full bg-gray-50 rounded-xl pl-11 pr-4 py-3 text-sm border border-gray-200 focus:bg-white focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none transition" />
                </div>
                <button onClick={applyPromo} className="bg-[#ff6b35] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-orange-600 transition whitespace-nowrap">Áp dụng</button>
              </div>
              {promoApplied && discount > 0 && <div className="mt-3 bg-green-50 border border-green-200 text-green-700 px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"><span>🎉</span>Đã áp dụng! Giảm {discount.toLocaleString('vi-VN')}₫</div>}
              <p className="text-xs text-gray-400 mt-3">💡 Thử: <button onClick={() => { setPromoCode('PROMO10'); applyPromo(); }} className="text-[#ff6b35] hover:underline font-medium">PROMO10</button> (10%) / <button onClick={() => { setPromoCode('PROMO20'); applyPromo(); }} className="text-[#ff6b35] hover:underline font-medium">PROMO20</button> (20k)</p>
            </section>

            {/* ─── NOTES ─── */}
            <section className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
              <h2 className="text-lg font-bold text-[#1a1a2e] mb-4 flex items-center gap-2"><span className="w-8 h-8 bg-[#fff7ed] rounded-xl flex items-center justify-center text-lg">📝</span>Ghi chú</h2>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú cho đơn hàng..." className="w-full bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 text-sm focus:bg-white focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none resize-none transition" rows={2} />
            </section>
          </div>

          {/* RIGHT: Summary + Place Order */}
          <div>
            <div className="sticky top-20 space-y-4">
              <section className="bg-white rounded-2xl shadow-sm p-5 sm:p-6">
                <h2 className="text-lg font-bold text-[#1a1a2e] mb-4 flex items-center gap-2"><span className="w-8 h-8 bg-[#fff7ed] rounded-xl flex items-center justify-center text-lg">📋</span>Tóm tắt</h2>
                <div className="mb-4 pb-4 border-b border-gray-100">
                  <p className="font-semibold text-gray-800 mb-3">🏪 {merchantName}</p>
                  <div className="space-y-2">
                    {items.map(i => (
                      <div key={i.menuItem.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 flex items-center gap-2"><span className="inline-flex items-center justify-center w-5 h-5 bg-[#fff7ed] text-[#ff6b35] rounded-full text-xs font-bold">{i.quantity}</span>{i.menuItem.name}</span>
                        <span className="text-gray-600 font-medium">{(i.menuItem.price * i.quantity).toLocaleString('vi-VN')}₫</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Tạm tính</span><span className="font-medium">{subtotal.toLocaleString('vi-VN')}₫</span></div>
                  <div className="flex justify-between text-gray-600"><span>Phí giao hàng</span><span className="font-medium">{deliveryFee.toLocaleString('vi-VN')}₫</span></div>
                  <div className="flex justify-between text-gray-600"><span>Phí dịch vụ (2%)</span><span className="font-medium">{serviceFee.toLocaleString('vi-VN')}₫</span></div>
                  {discount > 0 && <div className="flex justify-between text-green-600 font-semibold"><span>Giảm giá</span><span>-{discount.toLocaleString('vi-VN')}₫</span></div>}
                </div>
                <div className="mt-4 pt-4 border-t-2 border-gray-100 flex justify-between items-center">
                  <span className="text-base font-bold text-[#1a1a2e]">Tổng cộng</span>
                  <span className="text-xl font-extrabold text-[#ff6b35]">{total.toLocaleString('vi-VN')}₫</span>
                </div>
              </section>

              <button onClick={handlePlaceOrder} disabled={loading || profileLoading} className="w-full bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] text-white py-4 rounded-2xl font-bold text-base hover:shadow-lg hover:shadow-orange-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2">
                {loading ? <><span className="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />Đang xử lý...</> : profileLoading ? <><span className="inline-block w-5 h-5 border-2 border-white/50 border-t-transparent rounded-full animate-spin" />Đang tải...</> : <><span>🛵</span>Đặt hàng • {total.toLocaleString('vi-VN')}₫</>}
              </button>
              <p className="text-center text-xs text-gray-400">Bằng cách đặt hàng, bạn đồng ý với điều khoản của MyThFood</p>
              {dynamicFee && (
                <div className="mt-2 p-3 bg-gray-50 rounded-xl text-xs text-gray-500 space-y-1">
                  <p className="font-semibold text-gray-600 mb-1">🚚 Chi tiết phí giao hàng:</p>
                  <div className="flex justify-between"><span>📏 Khoảng cách</span><span>{dynamicFee.distanceKm} km</span></div>
                  <div className="flex justify-between"><span>💰 Phí cơ bản</span><span>{dynamicFee.baseFee.toLocaleString('vi-VN')}₫</span></div>
                  <div className="flex justify-between"><span>📐 Phí khoảng cách</span><span>{dynamicFee.distanceFee.toLocaleString('vi-VN')}₫</span></div>
                  {dynamicFee.rushHourSurcharge > 0 && (
                    <div className="flex justify-between text-orange-500"><span>⏰ Phụ thu giờ cao điểm (x{dynamicFee.breakdown.rushHourMultiplier})</span><span>+{dynamicFee.rushHourSurcharge.toLocaleString('vi-VN')}₫</span></div>
                  )}
                  {dynamicFee.weatherSurcharge > 0 && (
                    <div className="flex justify-between text-blue-500"><span>🌧️ Phụ thu thời tiết (x{dynamicFee.breakdown.weatherMultiplier})</span><span>+{dynamicFee.weatherSurcharge.toLocaleString('vi-VN')}₫</span></div>
                  )}
                  <div className="flex justify-between font-bold text-[#ff6b35] pt-1 border-t"><span>Tổng phí ship</span><span>{dynamicFee.totalFee.toLocaleString('vi-VN')}₫</span></div>
                </div>
              )}
              <div className="flex items-center gap-2 justify-center text-xs text-gray-400 mt-2">
                <span>🔒</span><span>Bảo mật bởi Stripe • PCI DSS Level 1</span>
              </div>

              {/* DEBUG INFO */}
              <div className="mt-2 p-3 bg-gray-100 rounded-xl text-xs text-gray-500 font-mono space-y-0.5">
                <p>profileLoading: <span className={profileLoading ? 'text-red-500 font-bold' : 'text-green-500'}>{String(profileLoading)}</span></p>
                <p>consumerId: <span className={consumerId ? 'text-green-500' : 'text-red-500'}>{consumerId ? '✅ ' + consumerId.slice(0, 8) : '❌ null'}</span></p>
                <p>merchantId: <span className={merchantId ? 'text-green-500' : 'text-red-500'}>{merchantId ? '✅ ' + merchantId.slice(0, 8) : '❌ null'}</span></p>
                <p>user: <span className={user ? 'text-green-500' : 'text-red-500'}>{user ? '✅ ' + user.fullName : '❌ null'}</span></p>
                <p>items: {items.length} món | total: {total.toLocaleString('vi-VN')}₫</p>
                <p>Button: {loading || profileLoading ? <span className="text-red-500 font-bold">🔴 DISABLED (loading={String(loading)}, profileLoading={String(profileLoading)})</span> : <span className="text-green-500 font-bold">🟢 ENABLED</span>}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="h-6" />
      </main>

      {/* Bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🏠</span><span>Trang chủ</span></Link>
        <Link href="/restaurants" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">🔍</span><span>Tìm kiếm</span></Link>
        <Link href="/cart" className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline relative"><span className="text-[22px]">🛒</span><span>Giỏ hàng</span>{cartCount > 0 && <span className="absolute -top-1 -right-2 bg-[#ff6b35] text-white text-[10px] font-bold w-[18px] h-[18px] rounded-full flex items-center justify-center">{cartCount}</span>}</Link>
        <Link href="/orders" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">📦</span><span>Đơn hàng</span></Link>
        <Link href="/dashboard" className="flex flex-col items-center text-[10px] text-gray-400 no-underline"><span className="text-[22px]">👤</span><span>Tài khoản</span></Link>
      </nav>
      <div className="lg:hidden h-20" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// WRAPPER with Elements provider
// ═══════════════════════════════════════════════════════════════
export default function CheckoutPage() {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#f97316',
            colorBackground: '#ffffff',
            colorText: '#1f2937',
            colorDanger: '#ef4444',
            fontFamily: 'ui-sans-serif, system-ui, sans-serif',
            borderRadius: '12px',
          },
        },
      }}
    >
      <CheckoutContent />
    </Elements>
  );
}