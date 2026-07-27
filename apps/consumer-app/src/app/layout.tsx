import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@mythfood/frontend-shared';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });

export const metadata: Metadata = {
  title: 'MyThFood - Giao đồ ăn nhanh chóng',
  description: 'Nền tảng giao đồ ăn hàng đầu Việt Nam',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={inter.className}><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}
