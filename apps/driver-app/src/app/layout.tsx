import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@mythfood/frontend-shared";
import DriverLocationTracker from "@/components/DriverLocationTracker";

const inter = Inter({ subsets: ["latin", "vietnamese"] });
export const metadata: Metadata = {
  title: "MyThFood Driver",
  description: "Driver App",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className={inter.className}>
        <AuthProvider>
          <DriverLocationTracker />
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
