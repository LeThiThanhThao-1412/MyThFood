'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, driverApi } from '@mythfood/api-client';
import { useAuth } from '@mythfood/frontend-shared';

export default function DriverRegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<'account' | 'driver' | 'done'>('account');
  const [account, setAccount] = useState({ phone: '', name: '', email: '', password: '' });
  const [driver, setDriver] = useState({
    phoneNumber: '', email: '', vehicleType: 'MOTORBIKE' as string,
    vehicleRegistrationNumber: '', idCardNumber: '',
    driverLicenseNumber: '', insuranceNumber: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState('');

  async function createAccount(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const res = await authApi.register({
        phoneNumber: account.phone, fullName: account.name,
        email: account.email, password: account.password, roles: ['DRIVER'],
      });
      const uid = (res as any).data?.user?.id || (res as any).data?.id || (res as any).id || '';
      if (!uid) throw new Error('Không lấy được user ID');
      setUserId(uid);
      await login({ phoneNumber: account.phone, password: account.password });
      setStep('driver');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Đăng ký thất bại');
    } finally { setLoading(false); }
  }

  async function createDriver(e: React.FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await (driverApi as any).register({
        userId, fullName: account.name,
        phoneNumber: driver.phoneNumber, email: driver.email || account.email,
        vehicleType: driver.vehicleType,
        vehicleRegistrationNumber: driver.vehicleRegistrationNumber,
        idCardNumber: driver.idCardNumber,
        driverLicenseNumber: driver.driverLicenseNumber,
        insuranceNumber: driver.insuranceNumber,
      });
      setStep('done');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Tạo hồ sơ tài xế thất bại');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        {step === 'account' && (
          <>
            <h1 className="text-2xl font-bold text-green-600 text-center mb-2">🛵 Đăng ký tài xế</h1>
            <p className="text-gray-500 text-center mb-6">Bước 1/2: Tạo tài khoản</p>
            <form onSubmit={createAccount} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Họ tên</label>
                <input value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} placeholder="Nguyễn Văn A" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                <input value={account.phone} onChange={e=>setAccount({...account,phone:e.target.value})} placeholder="+84901234567" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={account.email} onChange={e=>setAccount({...account,email:e.target.value})} placeholder="email@example.com" type="email" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu</label>
                <input type="password" value={account.password} onChange={e=>setAccount({...account,password:e.target.value})} placeholder="Ít nhất 6 ký tự" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required minLength={6} />
              </div>
              <button disabled={loading} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition">
                {loading ? 'Đang xử lý...' : 'Tiếp tục →'}
              </button>
              <p className="text-center text-sm text-gray-500">Đã có tài khoản? <a href="/login" className="text-green-500">Đăng nhập</a></p>
            </form>
          </>
        )}

        {step === 'driver' && (
          <>
            <h1 className="text-2xl font-bold text-green-600 text-center mb-2">🛵 Thông tin tài xế</h1>
            <p className="text-gray-500 text-center mb-6">Bước 2/2: Đăng ký hồ sơ</p>
            <form onSubmit={createDriver} className="space-y-4">
              {error && <div className="bg-red-50 text-red-600 p-3 rounded text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SĐT liên lạc</label>
                <input value={driver.phoneNumber} onChange={e=>setDriver({...driver,phoneNumber:e.target.value})} placeholder="+84901234567" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input value={driver.email} onChange={e=>setDriver({...driver,email:e.target.value})} placeholder="email@example.com" type="email" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại xe</label>
                <select value={driver.vehicleType} onChange={e=>setDriver({...driver,vehicleType:e.target.value})} className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none">
                  <option value="MOTORBIKE">Xe máy</option>
                  <option value="CAR">Ô tô</option>
                  <option value="BICYCLE">Xe đạp</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biển số xe</label>
                <input value={driver.vehicleRegistrationNumber} onChange={e=>setDriver({...driver,vehicleRegistrationNumber:e.target.value})} placeholder="59A-12345" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số CMND/CCCD</label>
                <input value={driver.idCardNumber} onChange={e=>setDriver({...driver,idCardNumber:e.target.value})} placeholder="079201234567" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số GPLX</label>
                <input value={driver.driverLicenseNumber} onChange={e=>setDriver({...driver,driverLicenseNumber:e.target.value})} placeholder="DL123456789" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Số bảo hiểm</label>
                <input value={driver.insuranceNumber} onChange={e=>setDriver({...driver,insuranceNumber:e.target.value})} placeholder="INS-2024-98765" className="w-full rounded-lg border px-4 py-3 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none" required />
              </div>
              <button disabled={loading} className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 transition">
                {loading ? 'Đang xử lý...' : 'Đăng ký tài xế'}
              </button>
            </form>
          </>
        )}

        {step === 'done' && (
          <div className="text-center py-8">
            <p className="text-5xl mb-4">🎉</p>
            <h2 className="text-xl font-bold text-green-600 mb-2">Đăng ký thành công!</h2>
            <p className="text-gray-500 mb-4">Hồ sơ tài xế của bạn đang chờ Admin duyệt.</p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 text-sm text-yellow-800">
              <p className="font-medium mb-1">⏳ Trạng thái: INACTIVE</p>
              <p>Admin sẽ duyệt hồ sơ của bạn trong vòng 24-48h. Bạn có thể đăng nhập để theo dõi trạng thái.</p>
            </div>
            <button onClick={()=>router.push('/dashboard')} className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition">
              Về Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}