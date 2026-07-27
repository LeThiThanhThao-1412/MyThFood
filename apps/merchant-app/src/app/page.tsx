'use client';

import Link from 'next/link';
import { useAuthStore } from '@mythfood/frontend-shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MerchantLandingPage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.push('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm py-4 px-4 border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            🍜 MyThFood Partner
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-blue-600 font-medium px-4 py-2 rounded-lg hover:bg-blue-50 transition"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Kết nối với hàng nghìn khách hàng
          </h1>
          <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
            Tăng doanh thu, quản lý nhà hàng hiệu quả với nền tảng giao đồ ăn hàng đầu Việt Nam. Tiếp cận hàng triệu khách hàng mỗi ngày.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition shadow-lg"
            >
              🚀 Đăng ký ngay
            </Link>
            <Link
              href="/login"
              className="border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition"
            >
              Đăng nhập
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 max-w-6xl mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-4">
          Tại sao chọn MyThFood Partner?
        </h2>
        <p className="text-gray-500 text-center mb-16 max-w-xl mx-auto">
          Nền tảng toàn diện giúp nhà hàng của bạn phát triển vượt bậc
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: '📈',
              title: 'Tăng doanh thu',
              desc: 'Tiếp cận hàng triệu khách hàng mới mỗi ngày. Tăng đơn hàng lên đến 300% với nền tảng giao đồ ăn số 1.',
            },
            {
              icon: '📋',
              title: 'Quản lý dễ dàng',
              desc: 'Thêm, sửa, xóa món ăn chỉ với vài cú click. Cập nhật giá realtime. Quản lý đơn hàng tập trung.',
            },
            {
              icon: '📊',
              title: 'Báo cáo chi tiết',
              desc: 'Theo dõi doanh thu, đơn hàng theo ngày/tuần/tháng. Phân tích xu hướng khách hàng thông minh.',
            },
          ].map((f, i) => (
            <div
              key={i}
              className="bg-white border rounded-xl p-8 hover:shadow-lg transition text-center"
            >
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-semibold mb-3">{f.title}</h3>
              <p className="text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats */}
      <section className="bg-blue-50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { num: '10,000+', label: 'Nhà hàng đối tác' },
              { num: '1M+', label: 'Lượt đặt mỗi tháng' },
              { num: '24/7', label: 'Hỗ trợ kỹ thuật' },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-4xl font-bold text-blue-600 mb-2">{s.num}</p>
                <p className="text-gray-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 max-w-6xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">Bắt đầu ngay hôm nay</h2>
        <p className="text-gray-500 mb-8">Đăng ký trong 5 phút và bắt đầu nhận đơn hàng</p>
        <Link
          href="/register"
          className="bg-blue-600 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition inline-block"
        >
          Đăng ký làm đối tác →
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-400">
          <p className="mb-2">© 2026 MyThFood Partner. Tất cả quyền được bảo lưu.</p>
          <p>Nền tảng giao đồ ăn hàng đầu Việt Nam</p>
        </div>
      </footer>
    </div>
  );
}