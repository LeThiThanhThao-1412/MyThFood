"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { driverApi, reviewApi } from "@mythfood/api-client";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";
import DriverShell from "@/components/DriverShell";

const PAGE_SIZE = 20;

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "Vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

function Stars({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span className="text-yellow-500">
      {"★".repeat(filled)}
      <span className="text-gray-300">{"☆".repeat(5 - filled)}</span>
    </span>
  );
}

export default function DriverReviewsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();

  const [driverId, setDriverId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [average, setAverage] = useState(0);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!canAccessApp(user?.roles, "DRIVER")) {
      clearAuth();
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const dRes: any = await driverApi.getByUserId(user?.id || "");
        const d = dRes?.data ?? dRes;
        if (!d?.id) {
          setError("Chưa tìm thấy hồ sơ tài xế");
          return;
        }
        setDriverId(d.id);
        const r: any = await reviewApi.getByDriver(d.id, {
          skip: 0,
          take: PAGE_SIZE,
        });
        setReviews(Array.isArray(r?.data) ? r.data : []);
        setTotal(Number(r?.total ?? 0));
        setAverage(Number(r?.averageRating ?? 0));
        setDistribution(r?.distribution ?? {});
      } catch {
        setError("Không tải được đánh giá. Vui lòng thử lại sau.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router, clearAuth]);

  async function loadMore() {
    if (!driverId || loadingMore) return;
    setLoadingMore(true);
    try {
      const r: any = await reviewApi.getByDriver(driverId, {
        skip: reviews.length,
        take: PAGE_SIZE,
      });
      const next = Array.isArray(r?.data) ? r.data : [];
      setReviews((prev) => [...prev, ...next]);
      setTotal(Number(r?.total ?? reviews.length + next.length));
      setAverage(Number(r?.averageRating ?? average));
      if (r?.distribution) setDistribution(r.distribution);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <DriverShell
      title="⭐ Đánh giá của tôi"
      backHref="/dashboard"
      contentClassName="max-w-3xl"
    >
      {/* Tổng quan điểm đánh giá */}
      <div className="bg-white rounded-2xl shadow-sm p-5">
        <div className="flex items-center gap-5">
          <div className="text-center shrink-0">
            <p className="text-4xl font-extrabold text-[#1a1a2e]">
              {total > 0 ? average.toFixed(1) : "—"}
            </p>
            <Stars value={average} />
            <p className="text-xs text-gray-400 mt-1">{total} đánh giá</p>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = Number(distribution?.[String(star)] ?? 0);
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-8">{star} ★</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#ff6b35] rounded-full"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-6 text-right">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 rounded-xl p-3 text-sm">
          {error}
        </div>
      )}

      {/* Danh sách đánh giá */}
      {reviews.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-400">Chưa có đánh giá nào</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r: any) => (
            <div key={r.id} className="bg-white rounded-2xl shadow-sm p-4">
              <div className="flex items-center justify-between mb-2">
                <Stars value={Number(r.driverRating ?? 0)} />
                <span className="text-xs text-gray-400">
                  {timeAgo(r.createdAt)}
                </span>
              </div>
              {r.driverComment ? (
                <p className="text-sm text-gray-700 whitespace-pre-line">
                  {r.driverComment}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">
                  Khách không để lại nhận xét
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-2">
                Đơn #{String(r.orderId || "").slice(0, 8)}
              </p>
            </div>
          ))}

          {reviews.length < total && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full bg-white rounded-2xl shadow-sm p-3 text-sm font-semibold text-[#ff6b35] hover:bg-orange-50 transition disabled:opacity-50"
            >
              {loadingMore
                ? "Đang tải..."
                : `Xem thêm (${total - reviews.length})`}
            </button>
          )}
        </div>
      )}
    </DriverShell>
  );
}
