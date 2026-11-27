"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi, merchantApi, resolutionApi } from "@mythfood/api-client";
import {
  useAuthStore,
  getAccountBlockFromProfile,
  storeAccountBlock,
} from "@mythfood/frontend-shared";
import TopNav from "./TopNav";
import MerchantLockScreen from "./MerchantLockScreen";
import type { MerchantLockWarning } from "./MerchantLockScreen";

type MerchantInfo = {
  id?: string;
  name?: string;
  isOpen?: boolean;
  status?: string;
};

type AccountProfile = {
  status?: string | null;
  suspendedUntil?: string | null;
  suspendReason?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
  rejectionDeleteAt?: string | null;
};

type MerchantWarning = MerchantLockWarning & {
  level?: string;
  createdAt?: string;
};

/** Chu kỳ kiểm tra lại trạng thái khóa/cảnh báo (ms). */
const STATUS_POLL_INTERVAL_MS = 60_000;

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
  const [info, setInfo] = useState<MerchantInfo>({});
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const logout = useCallback(() => {
    clearAuth();
    router.replace("/");
  }, [clearAuth, router]);

  const loadStatus = useCallback(
    async (showSpinner = false) => {
      if (!user?.id) return;
      if (showSpinner) setRefreshing(true);
      try {
        const [mRes, meRes] = await Promise.all([
          merchantApi.getByUserId(user.id).catch(() => null),
          authApi.me().catch(() => null),
        ]);
        const merchant: any = (mRes as any)?.data ?? mRes;
        const profile: any = (meRes as any)?.data ?? meRes;

        // Hồ sơ bị từ chối trong khi vẫn còn token cũ → buộc đăng xuất kèm lý do.
        if (merchant?.status === "REJECTED" || profile?.status === "REJECTED") {
          const block = getAccountBlockFromProfile({
            status: "REJECTED",
            rejectedAt: merchant?.rejectedAt ?? profile?.rejectedAt,
            rejectReason: merchant?.rejectReason ?? profile?.rejectReason,
            rejectionDeleteAt: profile?.rejectionDeleteAt,
          });
          if (block) {
            storeAccountBlock(block);
            clearAuth();
            router.replace("/login");
            return;
          }
        }

        setInfo({
          id: merchant?.id,
          name: merchant?.name,
          isOpen: merchant?.isOpen,
          status: merchant?.status,
        });
        setAccount(profile);

        // Lấy cảnh báo khiếu nại (gồm cả cảnh báo LOCK để hiển thị ở màn hình khóa).
        if (
          merchant?.id &&
          (merchant.status === "APPROVED" || merchant.status === "SUSPENDED")
        ) {
          try {
            const healthRes: any = await resolutionApi.getMerchantHealth(
              merchant.id,
            );
            setHealth((healthRes as any)?.data ?? healthRes ?? null);
          } catch {
            // resolution-service không phản hồi → không chặn portal.
          }
        } else {
          setHealth(null);
        }
      } catch {
        // Header vẫn hiển thị bình thường khi chưa lấy được thông tin.
      } finally {
        if (showSpinner) setRefreshing(false);
      }
    },
    [user?.id, clearAuth, router],
  );

  useEffect(() => {
    if (!user?.id) return;
    void loadStatus();

    // Tự phát hiện khóa/mở khóa/cảnh báo mới mà không cần tải lại trang.
    const interval = setInterval(() => {
      void loadStatus();
    }, STATUS_POLL_INTERVAL_MS);
    const onFocus = () => void loadStatus();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void loadStatus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user?.id, loadStatus]);

  /** Nhà hàng đã đọc cảnh báo ⇒ ẩn ngay, backend ghi dismissedAt. */
  async function dismissWarning(warningId: string) {
    if (!info.id) return;
    setDismissingId(warningId);
    try {
      await resolutionApi.dismissMerchantWarning(warningId, info.id);
      setHealth((prev: any) =>
        prev
          ? {
              ...prev,
              warnings: (prev.warnings || []).filter(
                (w: any) => w.id !== warningId,
              ),
            }
          : prev,
      );
    } catch {
      // Giữ cảnh báo nếu API lỗi.
    } finally {
      setDismissingId(null);
    }
  }

  const warnings: MerchantWarning[] = Array.isArray(health?.warnings)
    ? health.warnings
    : [];
  const activeWarnings = warnings.filter((w) => w.level !== "LOCK");
  const lockWarning = warnings.find((w) => w.level === "LOCK") ?? null;

  const identityBlock = account ? getAccountBlockFromProfile(account) : null;
  const accountLocked =
    identityBlock?.code === "ACCOUNT_SUSPENDED" ||
    identityBlock?.code === "ACCOUNT_BANNED";
  const merchantLocked = info.status === "SUSPENDED";
  const locked = merchantLocked || accountLocked;
  const permanent = accountLocked && identityBlock?.permanent === true;

  /**
   * Identity-service là nguồn chính xác về thời hạn khóa. Khi đồng bộ sang
   * merchant-service thất bại (best-effort), ước tính thời hạn từ cảnh báo LOCK
   * để không hiển thị nhầm là khóa vĩnh viễn.
   */
  const lockDays = Number(health?.thresholds?.lockDays ?? 30);
  const warningUntil =
    lockWarning?.createdAt && Number.isFinite(lockDays)
      ? new Date(
          new Date(lockWarning.createdAt).getTime() + lockDays * 86_400_000,
        ).toISOString()
      : null;
  const suspendedUntil = accountLocked
    ? (identityBlock?.suspendedUntil ?? null)
    : warningUntil;
  const lockReason =
    identityBlock?.reason ??
    account?.suspendReason ??
    lockWarning?.message ??
    null;

  if (locked) {
    return (
      <MerchantLockScreen
        merchantName={info.name}
        reason={lockReason}
        suspendedUntil={suspendedUntil}
        permanent={permanent}
        warning={lockWarning}
        onLogout={logout}
        onRefresh={() => void loadStatus(true)}
        refreshing={refreshing}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col">
      <TopNav merchantName={info.name} isOpen={info.isOpen} />

      <main
        className={`flex-1 w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 ${contentClassName}`}
      >
        {/* Cảnh báo tỉ lệ khiếu nại hiển thị trên mọi trang của Merchant Portal. */}
        {activeWarnings.length > 0 && (
          <div className="space-y-3 mb-6">
            {activeWarnings.map((w) => (
              <div
                key={w.id}
                className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 text-amber-800 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none">⚠️</span>
                  <div>
                    <p className="font-bold">{w.title}</p>
                    <p className="text-sm mt-1">{w.message}</p>
                    <p className="text-xs mt-1 opacity-70">
                      Đơn: {w.totalOrders ?? "—"} · Đơn hủy:{" "}
                      {w.cancelledOrders ?? "—"} · Khiếu nại hợp lệ:{" "}
                      {w.validComplaints ?? 0}/{w.totalComplaints ?? 0}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => w.id && dismissWarning(w.id)}
                  disabled={!w.id || dismissingId === w.id}
                  className="shrink-0 bg-white border border-amber-300 text-amber-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-amber-100 transition disabled:opacity-50"
                >
                  {dismissingId === w.id ? "Đang lưu..." : "Đã hiểu"}
                </button>
              </div>
            ))}
          </div>
        )}

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
