'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@mythfood/frontend-shared';

const highlights = [
  { icon: '🛵', title: 'Giao hàng nhanh', desc: 'Giao trong 30 phút, theo dõi real-time' },
  { icon: '🍜', title: 'Đa dạng món ngon', desc: 'Hàng trăm nhà hàng, nghìn món ăn' },
  { icon: '💰', title: 'Giá tốt mỗi ngày', desc: 'Flash sale, khuyến mãi hấp dẫn' },
  { icon: '⭐', title: 'Chất lượng đảm bảo', desc: 'Nhà hàng được kiểm duyệt kỹ' },
];

const categories = [
  { icon: '🍜', label: 'Món chính' },
  { icon: '🥤', label: 'Đồ uống' },
  { icon: '🍰', label: 'Tráng miệng' },
  { icon: '🥗', label: 'Món ăn kèm' },
  { icon: '🍱', label: 'Combo' },
  { icon: '🌶️', label: 'Đặc sắc' },
];

const steps = [
  { icon: '📱', title: 'Tải app hoặc truy cập web', desc: 'Có mặt trên iOS, Android và Web' },
  { icon: '📍', title: 'Chọn địa chỉ giao hàng', desc: 'Nhập địa chỉ hoặc dùng GPS' },
  { icon: '🍽️', title: 'Chọn món yêu thích', desc: 'Duyệt menu từ hàng trăm nhà hàng' },
  { icon: '🛵', title: 'Nhận món tận nơi', desc: 'Giao hàng nhanh chóng, tươi ngon' },
];

export default function LandingPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  return (
    <div className="min-h-screen bg-white">
      {/* ===== NAVBAR ===== */}
      <nav className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/" className="text-2xl font-extrabold text-[#ff6b35]">
            MyTh<span className="text-[#1a1a2e]">Food</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm font-medium text-gray-600 hover:text-[#ff6b35] transition">
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className="bg-[#ff6b35] text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-orange-600 transition shadow-md"
            >
              Đăng ký
            </Link>
          </div>
        </div>
      </nav>

      {/* ===== HERO ===== */}
      <section className="bg-gradient-to-br from-[#fff7ed] via-white to-[#fff0e6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-[#1a1a2e] leading-tight">
                Đặt đồ ăn <span className="text-[#ff6b35]">nhanh chóng</span>,
                <br />giao tận nơi tươi ngon
              </h1>
              <p className="mt-6 text-lg text-gray-500 max-w-xl mx-auto md:mx-0">
                Hàng trăm nhà hàng, nghìn món ngon. Giao hàng chỉ trong 30 phút. 
                Theo dõi đơn hàng real-time. Giảm 50% cho đơn đầu tiên!
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
                <Link
                  href="/register"
                  className="bg-[#ff6b35] text-white px-8 py-3.5 rounded-full font-bold text-base hover:bg-orange-600 transition shadow-lg shadow-orange-300 text-center"
                >
                  🎉 Đăng ký - Nhận ưu đãi 50%
                </Link>
                <Link
                  href="/login"
                  className="border-2 border-[#ff6b35] text-[#ff6b35] px-8 py-3.5 rounded-full font-bold text-base hover:bg-orange-50 transition text-center"
                >
                  Đăng nhập
                </Link>
              </div>
              <div className="mt-6 flex items-center gap-6 justify-center md:justify-start text-sm text-gray-400">
                <span>⭐ 4.8 (2,000+ đánh giá)</span>
                <span>🛵 500+ tài xế</span>
                <span>🏪 300+ nhà hàng</span>
              </div>
            </div>
            <div className="flex-1 flex justify-center">
              <div className="w-72 h-72 md:w-96 md:h-96 bg-gradient-to-br from-[#ff6b35] to-[#ff8f65] rounded-[40px] flex items-center justify-center shadow-2xl shadow-orange-300">
                <span className="text-8xl md:text-9xl">🍜</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== HIGHLIGHTS ===== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a1a2e]">
              ✨ Tại sao chọn <span className="text-[#ff6b35]">MyThFood</span>?
            </h2>
            <p className="mt-3 text-gray-500">Nền tảng giao đồ ăn hàng đầu Việt Nam</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {highlights.map((item) => (
              <div
                key={item.title}
                className="bg-[#fafafa] rounded-2xl p-6 text-center hover:-translate-y-1 hover:shadow-lg transition-all border border-gray-100"
              >
                <div className="text-4xl mb-3">{item.icon}</div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CATEGORIES ===== */}
      <section className="py-16 md:py-20 bg-[#fff7ed]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a1a2e]">
              🍽️ Danh mục món ăn
            </h2>
            <p className="mt-3 text-gray-500">Khám phá hàng nghìn món ăn đa dạng</p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {categories.map((cat) => (
              <div
                key={cat.label}
                className="bg-white rounded-2xl px-6 py-4 text-center shadow-sm hover:shadow-md transition-all cursor-pointer min-w-[110px] border border-gray-100"
              >
                <div className="text-3xl mb-2">{cat.icon}</div>
                <div className="text-sm font-semibold text-gray-700">{cat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== HOW IT WORKS ===== */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-extrabold text-[#1a1a2e]">
              📲 Cách đặt món
            </h2>
            <p className="mt-3 text-gray-500">Chỉ 4 bước đơn giản để có món ngon</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <div key={step.title} className="text-center relative">
                <div className="w-16 h-16 mx-auto bg-[#fff7ed] rounded-2xl flex items-center justify-center text-2xl mb-4">
                  {step.icon}
                </div>
                <div className="absolute top-2.5 left-[60%] hidden lg:block">
                  {idx < steps.length - 1 && (
                    <span className="text-2xl text-gray-300">→</span>
                  )}
                </div>
                <h3 className="font-bold mb-1">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-[#1a1a2e] to-[#2d2d44]">
        <div className="max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-4">
            🛵 Sẵn sàng đặt món chưa?
          </h2>
          <p className="text-lg text-white/60 mb-8">
            Tạo tài khoản miễn phí và nhận ngay <strong className="text-white">ưu đãi 50%</strong> cho đơn hàng đầu tiên!
          </p>
          <Link
            href="/register"
            className="inline-block bg-[#ff6b35] text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-orange-600 transition shadow-xl shadow-orange-500/30"
          >
            🎉 Đăng ký ngay - Miễn phí
          </Link>
          <p className="mt-4 text-sm text-white/40">
            Đã có tài khoản?{' '}
            <Link href="/login" className="text-[#ff6b35] hover:underline font-medium">
              Đăng nhập
            </Link>
          </p>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-[#1a1a2e] text-white/50 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm">
          <p className="mb-1">
            <span className="text-white font-bold">MyTh<span className="text-[#ff6b35]">Food</span></span> - Nền tảng giao đồ ăn hàng đầu Việt Nam
          </p>
          <p>© 2026 MyThFood. Tất cả quyền được bảo lưu.</p>
        </div>
      </footer>
    </div>
  );
}