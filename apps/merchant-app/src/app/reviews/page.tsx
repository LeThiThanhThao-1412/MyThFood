"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";
import { merchantApi, reviewApi } from "@mythfood/api-client";

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (diff < 1) return "Vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const hours = Math.floor(diff / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export default function MerchantReviewsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [merchant, setMerchant] = useState<any>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [average, setAverage] = useState(0);
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [replying, setReplying] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    if (!canAccessApp(user?.roles, "MERCHANT")) {
      clearAuth();
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m =
          (res.items || []).find((m2: any) => m2.userId === user?.id) || null;
        setMerchant(m);
        if (m?.id) {
          const r: any = await reviewApi.getByMerchant(m.id);
          setReviews(Array.isArray(r?.data) ? r.data : []);
          setAverage(Number(r?.averageRating ?? 0));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router, clearAuth]);

  async function submitReply(reviewId: string) {
    const text = (replyText[reviewId] || "").trim();
    if (!text) return;
    setReplying(reviewId);
    try {
      await reviewApi.reply(reviewId, { reply: text });
      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, merchantReply: text } : r,
        ),
      );
      setReplyText((p) => ({ ...p, [reviewId]: "" }));
    } catch {
      /* ignore */
    } finally {
      setReplying(null);
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
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0">
      <TopNav merchantName={merchant?.name} isOpen={merchant?.isOpen} />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
            ⭐ Đánh giá
          </h1>
          <span className="text-sm font-semibold text-[#ff6b35]">
            ⭐ {average.toFixed(1)} · {reviews.length} đánh giá
          </span>
        </div>

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
                  <span className="text-yellow-500">
                    {"⭐".repeat(Math.max(0, Math.min(5, r.rating)))}
                    <span className="text-gray-300">
                      {"⭐".repeat(Math.max(0, 5 - r.rating))}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400">
                    {timeAgo(r.createdAt)}
                  </span>
                </div>
                {r.comment && (
                  <p className="text-sm text-gray-700">{r.comment}</p>
                )}
                {r.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {r.tags.map((t: string, i: number) => (
                      <span
                        key={i}
                        className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {r.merchantReply ? (
                  <div className="mt-3 bg-[#fff7ed] rounded-xl p-3 text-sm">
                    <p className="font-semibold text-[#ff6b35] text-xs mb-1">
                      🏪 Phản hồi của bạn:
                    </p>
                    <p className="text-gray-700">{r.merchantReply}</p>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={replyText[r.id] || ""}
                      onChange={(e) =>
                        setReplyText((p) => ({ ...p, [r.id]: e.target.value }))
                      }
                      placeholder="Phản hồi đánh giá này..."
                      className="flex-1 border rounded-xl px-3 py-2 text-sm outline-none focus:border-[#ff6b35]"
                    />
                    <button
                      onClick={() => submitReply(r.id)}
                      disabled={replying === r.id}
                      className="bg-[#ff6b35] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 transition disabled:opacity-50"
                    >
                      Gửi
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
