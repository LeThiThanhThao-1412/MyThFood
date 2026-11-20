"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { merchantApi } from "@mythfood/api-client";
import {
  useAuthStore,
  getAccountBlockFromProfile,
  storeAccountBlock,
} from "@mythfood/frontend-shared";
import TopNav from "./TopNav";

/**
 * Khung giao diện dùng chung cho toàn bộ trang merchant:
 *  - Header (TopNav) đồng nhất (tự lấy tên + trạng thái mở cửa).
 *  - Main căn giữa theo max-width chuẩn, padding responsive.
 *  - Footer đồng nhất.
 */
export default function MerchantShell({
  children,
  contentClassName = "max-w-[1600px]",
}: {
  children: React.ReactNode;
  /** Override max-width cho các trang hẹp (VD: max-w-2xl, max-w-3xl). */
  contentClassName?: string;
}) {
  const { user, clearAuth } = useAuthStore();
  const router = useRouter();
  const [info, setInfo] = useState<{ name?: string; isOpen?: boolean }>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const m: any = await merchantApi.getByUserId(user.id);
        if (cancelled || !m) return;

        // Nếu hồ sơ nhà hàng đã bị từ chối trong khi vẫn còn token cũ,
        // buộc đăng xuất và chuyển về trang login kèm thông báo.
        if (m.status === "REJECTED") {
          const block = getAccountBlockFromProfile({
            status: "REJECTED",
            rejectedAt: m.rejectedAt,
            rejectReason: m.rejectReason,
          });
          if (block) {
            storeAccountBlock(block);
            clearAuth();
            router.replace("/login");
            return;
          }
        }

        setInfo({ name: m.name, isOpen: m.isOpen });
      } catch {
        // Header vẫn hiển thị bình thường khi chưa lấy được thông tin.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, clearAuth, router]);

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      <TopNav merchantName={info.name} isOpen={info.isOpen} />

      <main
        className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 ${contentClassName}`}
      >
        {children}
      </main>

      <footer className="bg-[#1a1a2e] text-white/60 py-6 mt-auto">
        <div className="max-w-[1600px] mx-auto px-4 text-center text-xs">
          © {new Date().getFullYear()} MyThFood Merchant · Nền tảng giao đồ ăn
          hàng đầu Việt Nam
        </div>
      </footer>
    </div>
  );
}
