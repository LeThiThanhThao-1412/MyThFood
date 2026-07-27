'use client';

import { useState, FormEvent, useEffect } from 'react';
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

interface StripeCardFormProps {
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (error: string) => void;
  onProcessing: (processing: boolean) => void;
}

const ELEMENT_STYLE = {
  base: {
    fontSize: '15px',
    color: '#1f2937',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
    '::placeholder': { color: '#9ca3af' },
  },
  invalid: {
    color: '#ef4444',
    iconColor: '#ef4444',
  },
};

function detectCardBrand(brand: string): { icon: string; label: string } | null {
  const map: Record<string, { icon: string; label: string }> = {
    visa: { icon: '💳', label: 'Visa' },
    mastercard: { icon: '💳', label: 'Mastercard' },
    amex: { icon: '💳', label: 'Amex' },
    discover: { icon: '💳', label: 'Discover' },
    jcb: { icon: '💳', label: 'JCB' },
    unionpay: { icon: '💳', label: 'UnionPay' },
    diners: { icon: '💳', label: 'Diners' },
    unknown: { icon: '💳', label: 'Thẻ' },
  };
  return map[brand.toLowerCase()] || map.unknown;
}

export default function StripeCardForm({
  amount,
  onSuccess,
  onError,
  onProcessing,
}: StripeCardFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  // Card brand detection
  const [cardBrand, setCardBrand] = useState<{ icon: string; label: string } | null>(null);
  const [cardComplete, setCardComplete] = useState(false);
  const [expiryComplete, setExpiryComplete] = useState(false);
  const [cvcComplete, setCvcComplete] = useState(false);

  // Field-level errors
  const [cardError, setCardError] = useState('');
  const [expiryError, setExpiryError] = useState('');
  const [cvcError, setCvcError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!stripe || !elements) {
      setPaymentError('Stripe chưa được tải. Vui lòng thử lại.');
      return;
    }

    setIsProcessing(true);
    onProcessing(true);

    try {
      const cardElement = elements.getElement(CardNumberElement);
      if (!cardElement) {
        setPaymentError('Vui lòng nhập thông tin thẻ.');
        setIsProcessing(false);
        onProcessing(false);
        return;
      }

      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        elements.getElement('card') as any,
        {
          payment_method: {
            card: cardElement,
          },
        },
      );

      if (stripeError) {
        setPaymentError(stripeError.message || 'Thanh toán thất bại.');
        onError(stripeError.message || 'Thanh toán thất bại.');
      } else if (paymentIntent?.status === 'succeeded') {
        onSuccess(paymentIntent.id);
      } else if (paymentIntent?.status === 'requires_capture') {
        onSuccess(paymentIntent.id);
      } else {
        onSuccess(paymentIntent?.id || 'pending');
      }
    } catch (err: any) {
      const msg = err.message || 'Lỗi thanh toán không xác định';
      setPaymentError(msg);
      onError(msg);
    } finally {
      setIsProcessing(false);
      onProcessing(false);
    }
  }

  const allFieldsValid = cardComplete && expiryComplete && cvcComplete;

  return (
    <form onSubmit={handleSubmit}>
      {/* ===== Card Number ===== */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
          Số thẻ
        </label>
        <div className={`relative rounded-xl border bg-gray-50 px-4 py-3.5 transition-all ${
          cardError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus-within:border-[#ff6b35] focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-200'
        }`}>
          <CardNumberElement
            options={{
              style: ELEMENT_STYLE,
              placeholder: '1234 5678 9012 3456',
              showIcon: true,
            }}
            onChange={(event: StripeCardNumberElementChangeEvent) => {
              setCardComplete(event.complete);
              setCardError(event.error?.message || '');
              if (event.brand) {
                setCardBrand(detectCardBrand(event.brand));
              } else {
                setCardBrand(null);
              }
            }}
          />
          {/* Card type indicator */}
          {cardBrand && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">
              {cardBrand.label}
            </span>
          )}
        </div>
        {cardError && (
          <p className="text-xs text-red-500 mt-1 ml-1">{cardError}</p>
        )}
      </div>

      {/* ===== Expiry + CVC Row ===== */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Expiry */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
            Hết hạn (MM/YY)
          </label>
          <div className={`rounded-xl border bg-gray-50 px-4 py-3.5 transition-all ${
            expiryError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus-within:border-[#ff6b35] focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-200'
          }`}>
            <CardExpiryElement
              options={{
                style: ELEMENT_STYLE,
                placeholder: 'MM / YY',
              }}
              onChange={(event: StripeCardExpiryElementChangeEvent) => {
                setExpiryComplete(event.complete);
                setExpiryError(event.error?.message || '');
              }}
            />
          </div>
          {expiryError && (
            <p className="text-xs text-red-500 mt-1 ml-1">{expiryError}</p>
          )}
        </div>

        {/* CVC */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
            Mã CVC
          </label>
          <div className={`rounded-xl border bg-gray-50 px-4 py-3.5 transition-all ${
            cvcError ? 'border-red-300 bg-red-50' : 'border-gray-200 focus-within:border-[#ff6b35] focus-within:bg-white focus-within:ring-2 focus-within:ring-orange-200'
          }`}>
            <CardCvcElement
              options={{
                style: ELEMENT_STYLE,
                placeholder: '123',
              }}
              onChange={(event: StripeCardCvcElementChangeEvent) => {
                setCvcComplete(event.complete);
                setCvcError(event.error?.message || '');
              }}
            />
          </div>
          {cvcError && (
            <p className="text-xs text-red-500 mt-1 ml-1">{cvcError}</p>
          )}
        </div>
      </div>

      {/* ===== Card Holder Name (Optional) ===== */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-gray-600 mb-1.5 ml-1">
          Tên chủ thẻ <span className="text-gray-400 font-normal">(không bắt buộc)</span>
        </label>
        <input
          type="text"
          placeholder="NGUYEN VAN A"
          className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3.5 text-sm focus:bg-white focus:border-[#ff6b35] focus:ring-2 focus:ring-orange-200 outline-none transition uppercase"
          maxLength={50}
        />
      </div>

      {/* ===== Card brand badges ===== */}
      <div className="flex items-center gap-2 mb-4 justify-center">
        {['Visa', 'Mastercard', 'Amex', 'JCB'].map(b => (
          <span
            key={b}
            className={`text-xs px-2 py-1 rounded-md font-medium border transition-colors ${
              cardBrand?.label === b
                ? 'bg-[#fff7ed] border-[#ff6b35] text-[#ff6b35]'
                : 'bg-transparent border-gray-200 text-gray-400'
            }`}
          >
            {b}
          </span>
        ))}
        <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-md font-semibold border border-green-200">
          🔒 3D Secure
        </span>
      </div>

      {/* ===== Payment error ===== */}
      {paymentError && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm mb-4 flex items-start gap-2">
          <span className="shrink-0">⚠️</span>
          <span>{paymentError}</span>
        </div>
      )}

      {/* ===== Security footer ===== */}
      <div className="flex items-center gap-2 mb-4 text-xs text-gray-400 justify-center">
        <span>🔒</span>
        <span>Thanh toán được bảo mật bởi Stripe • PCI DSS Level 1</span>
      </div>

      {/* ===== Submit Button ===== */}
      <button
        type="submit"
        disabled={!stripe || isProcessing || !allFieldsValid}
        className="w-full bg-gradient-to-r from-[#ff6b35] to-[#ff8f65] text-white py-3.5 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-orange-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
      >
        {isProcessing ? (
          <>
            <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Đang xử lý thanh toán...
          </>
        ) : (
          `Thanh toán ${(amount || 0).toLocaleString('vi-VN')}₫`
        )}
      </button>

      {/* Validation hint */}
      {!allFieldsValid && !isProcessing && (
        <p className="text-xs text-gray-400 text-center mt-2">
          Vui lòng điền đầy đủ và chính xác thông tin thẻ
        </p>
      )}
    </form>
  );
}