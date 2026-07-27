'use client';

import Link from 'next/link';
import { useAuthStore } from '@mythfood/frontend-shared';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DriverLandingPage() {
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
          <Link href="/" className="text-2xl font-bold text-green-600">
            🛵 MyThFood Driver
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-green-600 font-medium px-4 py-2 rounded-lg hover:bg-green-50 transition"
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-br from-green-600 to-green-800 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Trở thành tài xế MyThFood
          </h1>
          <p className="text-xl text-green-100 mb-10 max-w-2xl mx-auto">
            Kiếm tiền linh hoạt, làm việc tự do, thu nhập hấp dẫn. Tham gia đội ngũ tài xế MyThFood ngay hôm nay!
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="bg-white text-green-600 px-8 py-4 rounded-xl font-bold text-lg hover:bg-green-50 transition shadow-lg"
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
          Lợi ích khi làm tài xế MyThFood
        </h2>
        <p className="text-gray-500 text-center mb-16 max-w-xl mx-auto">
          Tự do - Thu nhập tốt - Hỗ trợ 24/7
        </p>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              icon: '💰',
              title: 'Thu nhập hấp dẫn',
              desc: 'Nhận 80% phí giao hàng mỗi đơn. Thu nhập trung bình 15-20 triệu/tháng với lịch làm linh hoạt.',
            },
            {
              icon: '🕐',
              title: 'Thời gian linh hoạt',
              desc: 'Làm việc bất cứ khi nào bạn muốn. Online/Offline dễ dàng chỉ với một chạm.',
            },
            {
              icon: '🛡️',
              title: 'Hỗ trợ đầy đủ',
              desc: 'Bảo hiểm tai nạn cho mọi tài xế. Hỗ trợ 24/7 qua hotline và app.',
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
      <section className="bg-green-50 py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            {[
              { num: '50,000+', label: 'Tài xế đang hoạt động' },
              { num: '20M₫', label: 'Thu nhập trung bình/tháng' },
              { num: '24/7', label: 'Hỗ trợ trực tuyến' },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-4xl font-bold text-green-600 mb-2">{s.num}</p>
                <p className="text-gray-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 max-w-6xl mx-auto px-4 text-center">
        <h2 className="text-3xl font-bold mb-4">Bắt đầu kiếm tiền ngay hôm nay</h2>
        <p className="text-gray-500 mb-8">Đăng ký trong 5 phút và bắt đầu nhận đơn</p>
        <Link
          href="/register"
          className="bg-green-600 text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition inline-block"
        >
          Đăng ký làm tài xế →
        </Link>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-400">
          <p className="mb-2">© 2026 MyThFood Driver. Tất cả quyền được bảo lưu.</p>
          <p>Nền tảng giao đồ ăn hàng đầu Việt Nam</p>
        </div>
      </footer>
    </div>
  );
}