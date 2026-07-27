import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@mythfood/frontend-shared';

const inter = Inter({ subsets: ['latin', 'vietnamese'] });
export const metadata: Metadata = { title: 'MyThFood Admin Portal', description: 'Admin Portal' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="vi"><body className={inter.className}><AuthProvider>{children}</AuthProvider></body></html>;
}
