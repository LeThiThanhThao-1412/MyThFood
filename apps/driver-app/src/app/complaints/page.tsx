"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolutionApi } from "@mythfood/api-client";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";

const STATUS_BADGE: Record<string, string> = {
  OPEN: "bg-gray-100 text-gray-600",
  UNDER_REVIEW: "bg-blue-100 text-blue-700",
  WAITING_EVIDENCE: "bg-amber-100 text-amber-700",
  RESOLVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  WITHDRAWN: "bg-gray-100 text-gray-500",
  ESCALATED: "bg-purple-100 text-purple-700",
  CLOSED: "bg-gray-200 text-gray-500",
};

const SEVERITY_BADGE: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const PENALTY_LABEL: Record<string, string> = {
  WARNING: "⚠️ Cảnh cáo",
  FINE: "💰 Phạt tiền",
  COMPENSATION: "🤝 Bồi thường",
  SUSPEND: "⏸️ Tạm khóa",
  BAN: "🚫 Khóa vĩnh viễn",
  REPUTATION_DEDUCTION: "⭐ Trừ điểm",
  RESTRICT_ACTIVITY: "🔒 Hạn chế hoạt động",
};

const CATEGORY_LABEL: Record<string, string> = {
  ORDER_QUALITY: "Chất lượng món",
  MISSING_ITEM: "Thiếu món",
  WRONG_ITEM: "Sai món",
  FOOD_SAFETY: "An toàn thực phẩm",
  DELIVERY_LATE: "Giao trễ",
  NOT_RECEIVED: "Chưa nhận hàng",
  DRIVER_BEHAVIOR: "Thái độ tài xế",
  MERCHANT_BEHAVIOR: "Thái độ nhà hàng",
  DAMAGED_ITEM: "Hàng hư hỏng",
  UNAUTHORIZED_CANCEL: "Hủy đơn trái phép",
  FAKE_DELIVERY: "Giả giao hàng",
  REFUND_ABUSE: "Lạm dụng hoàn tiền",
  PROMO_ABUSE: "Lạm dụng KM",
  OTHER: "Khác",
};

const ACTOR_LABEL: Record<string, string> = {
  CONSUMER: "Khách",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  ADMIN: "Admin",
  SYSTEM: "Hệ thống",
};

function timeAgo(s?: string): string {
  if (!s) return "-";
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (d < 1) return "Vừa xong";
  if (d < 60) return `${d} phút trước`;
  const h = Math.floor(d / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export default function ComplaintsPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [tab, setTab] = useState<"cases" | "penalties">("cases");
  const [cases, setCases] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [timeline, setTimeline] = useState<Record<string, any[]>>({});
  const [form, setForm] = useState({
    type: "COMPLAINT",
    category: "ORDER_QUALITY",
    orderId: "",
    respondentType: "MERCHANT",
    respondentId: "",
    subject: "",
    description: "",
  });

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  async function load() {
    try {
      const r: any = await resolutionApi.listCases({
        actorId: user?.id,
        take: 100,
      });
      setCases(r?.data || []);
    } catch {
      /* ignore */
    }
    try {
      const p: any = await resolutionApi.listPenalties({
        targetId: user?.id,
        take: 100,
      });
      setPenalties(p?.data || []);
    } catch {
      /* ignore */
    }
  }

  async function toggleTimeline(id: string) {
    if (timeline[id]) return;
    try {
      const t: any = await resolutionApi.getTimeline(id);
      setTimeline((prev) => ({ ...prev, [id]: t?.data || [] }));
    } catch {
      setTimeline((prev) => ({ ...prev, [id]: [] }));
    }
  }

  async function createComplaint() {
    if (!form.subject.trim() || !form.description.trim()) {
      setMsg("❌ Vui lòng nhập tiêu đề và mô tả");
      return;
    }
    setMsg("");
    try {
      await resolutionApi.createCase({
        type: form.type,
        category: form.category,
        orderId: form.orderId || undefined,
        respondentId: form.respondentId || user?.id || "unknown",
        respondentType: form.respondentType,
        subject: form.subject,
        description: form.description,
      });
      setMsg("✅ Đã gửi khiếu nại");
      setShowForm(false);
      setForm({
        type: "COMPLAINT",
        category: "ORDER_QUALITY",
        orderId: "",
        respondentType: "MERCHANT",
        respondentId: "",
        subject: "",
        description: "",
      });
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Gửi thất bại"}`);
    }
  }

  async function withdrawCase(id: string) {
    try {
      await resolutionApi.withdraw(id);
      setMsg("✅ Đã rút khiếu nại");
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Rút thất bại"}`);
    }
  }

  async function appeal(p: any) {
    try {
      await resolutionApi.appealPenalty(p.id, {
        reason: "Kháng nghị quyết định xử phạt",
      });
      setMsg("✅ Đã gửi kháng nghị");
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Kháng nghị thất bại"}`);
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-3xl mx-auto pb-24">
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-gray-600"
          >
            ←
          </button>
          <h1 className="text-lg font-bold text-[#1a1a2e]">
            🛡️ Trợ giúp & Khiếu nại
          </h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
        >
          + Khiếu nại
        </button>
      </header>

      <div className="px-4 py-4 space-y-4">
        {msg && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-3 text-sm font-medium">
            {msg}
          </div>
        )}

        <div className="flex gap-2">
          {(["cases", "penalties"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === t ? "bg-[#ff6b35] text-white" : "bg-white text-gray-600"}`}
            >
              {t === "cases"
                ? `Khiếu nại (${cases.length})`
                : `Hình phạt (${penalties.length})`}
            </button>
          ))}
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
            <p className="font-semibold text-[#1a1a2e]">Gửi khiếu nại mới</p>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={form.type}
                onChange={(e) =>
                  setForm((f) => ({ ...f, type: e.target.value }))
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="COMPLAINT">Khiếu nại</option>
                <option value="FRAUD_REPORT">Báo gian lận</option>
              </select>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({ ...f, category: e.target.value }))
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                {Object.keys(CATEGORY_LABEL).map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABEL[k]}
                  </option>
                ))}
              </select>
              <select
                value={form.respondentType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, respondentType: e.target.value }))
                }
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="MERCHANT">Nhà hàng</option>
                <option value="DRIVER">Tài xế</option>
                <option value="CONSUMER">Khách hàng</option>
              </select>
              <input
                value={form.respondentId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, respondentId: e.target.value }))
                }
                placeholder="ID bên bị khiếu nại"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              />
              <input
                value={form.orderId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, orderId: e.target.value }))
                }
                placeholder="Mã đơn (tùy chọn)"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm col-span-2"
              />
              <input
                value={form.subject}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subject: e.target.value }))
                }
                placeholder="Tiêu đề"
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm col-span-2"
              />
            </div>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder="Mô tả chi tiết vấn đề"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            />
            <button
              onClick={createComplaint}
              className="w-full px-4 py-2 rounded-xl text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
            >
              Gửi khiếu nại
            </button>
          </div>
        )}

        {tab === "cases" && (
          <div className="space-y-3">
            {cases.map((c: any) => (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-800 truncate">
                      {c.subject}
                    </p>
                    <p className="text-xs text-gray-400">
                      {c.caseNumber} ·{" "}
                      {CATEGORY_LABEL[c.category] || c.category} ·{" "}
                      {ACTOR_LABEL[c.reporterType] || c.reporterType} →{" "}
                      {ACTOR_LABEL[c.respondentType] || c.respondentType}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[c.status] || "bg-gray-100 text-gray-600"}`}
                  >
                    {c.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SEVERITY_BADGE[c.severity] || "bg-gray-100"}`}
                  >
                    {c.severity}
                  </span>
                  <span className="text-xs text-gray-400">
                    {timeAgo(c.createdAt)}
                  </span>
                  {c.verdict && (
                    <span className="text-xs text-gray-500">· {c.verdict}</span>
                  )}
                  {(c.status === "OPEN" ||
                    c.status === "UNDER_REVIEW" ||
                    c.status === "WAITING_EVIDENCE") &&
                    c.reporterId === user?.id && (
                      <button
                        onClick={() => withdrawCase(c.id)}
                        className="ml-auto text-xs text-red-500 hover:underline"
                      >
                        Rút lại
                      </button>
                    )}
                </div>
                {timeline[c.id] && (
                  <div className="mt-2 border-t border-gray-50 pt-2 space-y-1">
                    {timeline[c.id]?.map((t: any, i: number) => (
                      <p key={i} className="text-xs text-gray-500">
                        • {t.toStatus} {t.note ? `— ${t.note}` : ""} ·{" "}
                        {timeAgo(t.createdAt)}
                      </p>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => toggleTimeline(c.id)}
                  className="mt-2 text-xs text-[#ff6b35] hover:underline"
                >
                  {timeline[c.id] ? "Ẩn" : "Xem"} tiến trình
                </button>
              </div>
            ))}
            {cases.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-10">
                Chưa có khiếu nại nào
              </p>
            )}
          </div>
        )}

        {tab === "penalties" && (
          <div className="space-y-3">
            {penalties.map((p: any) => (
              <div
                key={p.id}
                className="bg-white rounded-2xl shadow-sm p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="font-semibold text-gray-800">
                    {PENALTY_LABEL[p.type] || p.type}
                  </p>
                  <p className="text-xs text-gray-400">{p.reason}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500">{p.status}</span>
                  {p.status === "EXECUTED" && (
                    <button
                      onClick={() => appeal(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 hover:bg-amber-100"
                    >
                      Kháng nghị
                    </button>
                  )}
                </div>
              </div>
            ))}
            {penalties.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-10">
                Không có hình phạt nào
              </p>
            )}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 z-[100]">
        <Link
          href="/"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">🏠</span>
          <span>Trang chủ</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📦</span>
          <span>Đơn hàng</span>
        </Link>
        <Link
          href="/complaints"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">🛡️</span>
          <span>Khiếu nại</span>
        </Link>
        <Link
          href="/profile"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">👤</span>
          <span>Tôi</span>
        </Link>
      </nav>
    </div>
  );
}
