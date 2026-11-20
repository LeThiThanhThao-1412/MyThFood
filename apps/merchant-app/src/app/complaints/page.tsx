"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  resolutionApi,
  uploadApi,
  merchantApi,
  orderApi,
  driverApi,
  consumerApi,
} from "@mythfood/api-client";
import { useAuthStore, canAccessApp } from "@mythfood/frontend-shared";
import MerchantShell from "@/components/MerchantShell";

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
  FAKE_REVIEW: "Đánh giá giả",
  MULTI_ACCOUNT: "Đa tài khoản",
  CHARGEBACK_FRAUD: "Gian lận hoàn tiền",
  OTHER: "Khác",
};

const REASONS_BY_PARTY: Record<string, string[]> = {
  MERCHANT: [
    "ORDER_QUALITY",
    "MISSING_ITEM",
    "WRONG_ITEM",
    "FOOD_SAFETY",
    "MERCHANT_BEHAVIOR",
    "DAMAGED_ITEM",
  ],
  DRIVER: [
    "DELIVERY_LATE",
    "NOT_RECEIVED",
    "DRIVER_BEHAVIOR",
    "DAMAGED_ITEM",
    "UNAUTHORIZED_CANCEL",
  ],
  CONSUMER: [
    "REFUND_ABUSE",
    "PROMO_ABUSE",
    "FAKE_REVIEW",
    "MULTI_ACCOUNT",
    "CHARGEBACK_FRAUD",
  ],
};

const ACTOR_LABEL: Record<string, string> = {
  CONSUMER: "Khách",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  ADMIN: "Admin",
  SYSTEM: "Hệ thống",
};

const VERDICT_LABEL: Record<string, string> = {
  VALID: "✅ Hợp lệ",
  INVALID: "❌ Không hợp lệ",
  INCONCLUSIVE: "❓ Chưa đủ căn cứ",
};

const FAULT_PARTY_LABEL: Record<string, string> = {
  CUSTOMER: "Khách hàng",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  SYSTEM: "Hệ thống",
  INCONCLUSIVE: "Không xác định",
};

/**
 * Trạng thái còn cho phép hai bên bổ sung bằng chứng / phản hồi.
 *
 * `UNDER_REVIEW` và `WAITING_EVIDENCE` là trạng thái phổ biến nhất sau khi AI
 * phân tích hoặc admin yêu cầu bổ sung; trước đây nhà hàng chỉ thấy nút "Phản
 * hồi" khi vụ việc còn `OPEN` nên gần như không bao giờ có chỗ gửi ảnh.
 */
const ACTIVE_STATUSES = ["OPEN", "UNDER_REVIEW", "WAITING_EVIDENCE"];

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
  const searchParams = useSearchParams();
  const orderIdParam = searchParams?.get("orderId") ?? "";
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [tab, setTab] = useState<"cases" | "penalties">("cases");
  const [cases, setCases] = useState<any[]>([]);
  const [penalties, setPenalties] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [timeline, setTimeline] = useState<Record<string, any[]>>({});
  const [form, setForm] = useState({
    type: "COMPLAINT",
    category: "DELIVERY_LATE",
    orderId: "",
    respondentType: "DRIVER",
    respondentId: "",
    subject: "",
    description: "",
  });
  const [profileId, setProfileId] = useState("");
  const [linkedOrder, setLinkedOrder] = useState<any>(null);
  const [partyNames, setPartyNames] = useState<Record<string, string>>({});
  const [selectedCase, setSelectedCase] = useState<any>(null);
  const [casePenalties, setCasePenalties] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    merchantApi
      .getByUserId(user.id)
      .then((res: any) => {
        const m = res?.data ?? res;
        if (m?.id) setProfileId(m.id);
      })
      .catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (orderIdParam) {
      setShowForm(true);
      linkOrder(orderIdParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderIdParam]);

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user, profileId]);

  async function load() {
    try {
      // Merchant profile id và auth user id có thể khác nhau; case cũ (tạo khi
      // backend fallback về userId) sẽ không khớp filter nếu chỉ query profileId.
      const actorIds = Array.from(
        new Set([profileId, user?.id].filter((x): x is string => !!x)),
      );
      const results = await Promise.all(
        actorIds.map((actorId) =>
          resolutionApi
            .listCases({ actorId, take: 100 })
            .then((r: any) => (Array.isArray(r?.data) ? r.data : []))
            .catch(() => [] as any[]),
        ),
      );
      const merged: any[] = [];
      const seen = new Set<string>();
      for (const list of results) {
        for (const c of list) {
          if (!c?.id || seen.has(c.id)) continue;
          seen.add(c.id);
          merged.push(c);
        }
      }
      merged.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      setCases(merged);
    } catch {
      /* ignore */
    }
    try {
      const p: any = await resolutionApi.listPenalties({
        targetId: profileId || user?.id,
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

  async function openCaseDetail(c: any) {
    setSelectedCase(c);
    setCasePenalties([]);
    // Ảnh đang chờ gửi của vụ việc trước không được mang sang vụ việc khác.
    setExtraEvidence([]);
    try {
      const ids: string[] = c.penaltyIds || [];
      if (ids.length) {
        const ps = await Promise.all(
          ids.map((pid: string) =>
            resolutionApi
              .getPenalty(pid)
              .then((r: any) => r?.data)
              .catch(() => null),
          ),
        );
        setCasePenalties(ps.filter(Boolean));
      }
    } catch {
      /* ignore */
    }
  }

  async function resolvePartyNames(order: any) {
    if (!order) return;
    const names: Record<string, string> = {};
    const unwrap = (r: any) =>
      r && r.data && typeof r.data === "object" ? r.data : r;
    try {
      if (order.driverId) {
        const d: any = unwrap(await driverApi.getPublicProfile(order.driverId));
        if (d?.fullName) names.DRIVER = d.fullName;
      }
    } catch {}
    try {
      if (order.consumerId) {
        const c: any = unwrap(await consumerApi.getContact(order.consumerId));
        if (c?.fullName) names.CONSUMER = c.fullName;
      }
    } catch {}
    setPartyNames(names);
  }

  async function linkOrder(orderId: string) {
    if (!orderId) return;
    try {
      const o: any = await orderApi.getById(orderId);
      setLinkedOrder(o);
      setForm((f) => ({
        ...f,
        orderId,
        respondentType: "DRIVER",
        category: REASONS_BY_PARTY.DRIVER[0],
        respondentId: o?.driverId || "",
      }));
      resolvePartyNames(o);
    } catch {
      setMsg("❌ Không tìm thấy đơn");
    }
  }

  function onRespondentTypeChange(rt: string) {
    const reasons = REASONS_BY_PARTY[rt] || [];
    setForm((f) => ({
      ...f,
      respondentType: rt,
      category: reasons[0] || f.category,
      respondentId:
        rt === "MERCHANT"
          ? linkedOrder?.merchantId || ""
          : rt === "DRIVER"
            ? linkedOrder?.driverId || ""
            : rt === "CONSUMER"
              ? linkedOrder?.consumerId || ""
              : f.respondentId,
    }));
  }

  async function createComplaint() {
    if (!form.subject.trim() || !form.description.trim()) {
      setMsg("❌ Vui lòng nhập tiêu đề và mô tả");
      return;
    }
    if (!form.respondentId) {
      setMsg("❌ Nhập mã đơn để xác định bên bị khiếu nại");
      return;
    }
    setMsg("");
    try {
      await resolutionApi.createCase({
        type: form.type,
        category: form.category,
        orderId: form.orderId || undefined,
        // Gửi merchantId (id hồ sơ) thay vì để backend fallback về userId —
        // trang này lọc theo merchantId nên nếu lưu userId sẽ không thấy case.
        reporterId: profileId || user?.id || undefined,
        respondentId: form.respondentId || user?.id || "unknown",
        respondentType: form.respondentType,
        subject: form.subject,
        description: form.description,
      });
      setMsg("✅ Đã gửi khiếu nại");
      setShowForm(false);
      setForm({
        type: "COMPLAINT",
        category: "DELIVERY_LATE",
        orderId: "",
        respondentType: "DRIVER",
        respondentId: "",
        subject: "",
        description: "",
      });
      setPartyNames({});
      setLinkedOrder(null);
      await load();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Gửi thất bại"}`);
    }
  }

  const [respondingCaseId, setRespondingCaseId] = useState<string | null>(null);
  const [respondText, setRespondText] = useState("");
  const [respondEvidence, setRespondEvidence] = useState<string[]>([]);
  const [respondBusy, setRespondBusy] = useState(false);
  /** Ảnh minh chứng gửi bổ sung — không cần kèm văn bản phản hồi. */
  const [extraEvidence, setExtraEvidence] = useState<string[]>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);

  async function uploadRespondEvidence(e: any) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    try {
      for (const file of files) {
        const res: any = await uploadApi.uploadImage(file, "complaints");
        const url = res?.data?.url || res?.url;
        if (url) setRespondEvidence((prev) => [...prev, url]);
      }
    } catch {
      setMsg("❌ Tải ảnh thất bại");
    } finally {
      e.target.value = "";
    }
  }

  async function respondCase(id: string) {
    if (!respondText.trim()) {
      setMsg("❌ Vui lòng nhập nội dung phản hồi");
      return;
    }
    setRespondBusy(true);
    setMsg("");
    try {
      await resolutionApi.respond(id, {
        text: respondText.trim(),
        evidence: respondEvidence.length ? respondEvidence : undefined,
        actorId: profileId,
      });
      setMsg("✅ Đã gửi phản hồi, chờ admin xử lý");
      setRespondingCaseId(null);
      setRespondText("");
      setRespondEvidence([]);
      setSelectedCase(null);
      await load();
    } catch (err: any) {
      setMsg(`❌ ${err?.message || "Không thể gửi phản hồi"}`);
    } finally {
      setRespondBusy(false);
    }
  }

  async function uploadExtraEvidence(e: any) {
    const files = Array.from(e.target.files || []) as File[];
    if (!files.length) return;
    try {
      for (const file of files) {
        const res: any = await uploadApi.uploadImage(file, "complaints");
        const url = res?.data?.url || res?.url;
        if (url) setExtraEvidence((prev) => [...prev, url]);
      }
    } catch {
      setMsg("❌ Tải ảnh thất bại");
    } finally {
      e.target.value = "";
    }
  }

  /**
   * Bổ sung ảnh minh chứng cho vụ việc mà **không** phải viết lại phản hồi.
   *
   * Gọi `POST /cases/:id/evidence`; backend thấy người gọi là bên bị khiếu nại
   * nên ghi ảnh vào `respondentEvidence` — đúng trường AI đọc cho mục "Bên bị
   * khiếu nại". Nhờ vậy nhà hàng có chỗ gửi ảnh món đã chuẩn bị/hoá đơn/ảnh
   * camera, thay vì chỉ có nút "Phản hồi" lúc vụ việc còn `OPEN`.
   */
  async function submitExtraEvidence(id: string) {
    if (!extraEvidence.length) {
      setMsg("❌ Vui lòng chọn ít nhất 1 ảnh minh chứng");
      return;
    }
    setEvidenceBusy(true);
    setMsg("");
    try {
      await resolutionApi.addEvidence(id, {
        urls: extraEvidence,
        actorId: profileId || undefined,
      });
      setMsg("✅ Đã gửi ảnh minh chứng — AI sẽ phân tích lại vụ việc");
      setExtraEvidence([]);
      const fresh: any = await resolutionApi.getCase(id);
      setSelectedCase(fresh?.data ?? fresh);
      await load();
    } catch (err: any) {
      setMsg(`❌ ${err?.message || "Không gửi được ảnh minh chứng"}`);
    } finally {
      setEvidenceBusy(false);
    }
  }

  async function confirmCase(id: string) {
    setRespondBusy(true);
    setMsg("");
    try {
      await resolutionApi.confirm(id, { actorId: profileId });
      setMsg("✅ Đã xác nhận, khiếu nại được giải quyết");
      setSelectedCase(null);
      await load();
    } catch (err: any) {
      setMsg(`❌ ${err?.message || "Không thể xác nhận"}`);
    } finally {
      setRespondBusy(false);
    }
  }

  async function withdrawCase(id: string) {
    try {
      await resolutionApi.withdraw(id, { actorId: profileId });
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
    <MerchantShell contentClassName="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
          🛡️ Trợ giúp & Khiếu nại
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
        >
          + Khiếu nại
        </button>
      </div>

      <div className="space-y-4">
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
                {(REASONS_BY_PARTY[form.respondentType] || []).map((k) => (
                  <option key={k} value={k}>
                    {CATEGORY_LABEL[k] || k}
                  </option>
                ))}
              </select>
              <select
                value={form.respondentType}
                onChange={(e) => onRespondentTypeChange(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="DRIVER">Tài xế</option>
                <option value="CONSUMER">Khách hàng</option>
              </select>
              <div className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 flex items-center min-h-[40px]">
                {partyNames[form.respondentType] ? (
                  <>
                    👤{" "}
                    <span className="font-semibold text-[#1a1a2e] ml-1 truncate">
                      {partyNames[form.respondentType]}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-gray-400">
                    Nhập mã đơn để hiện tên
                  </span>
                )}
              </div>
              <input
                value={form.orderId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, orderId: e.target.value }))
                }
                onBlur={(e) => {
                  if (e.target.value && e.target.value !== linkedOrder?.id) {
                    linkOrder(e.target.value);
                  }
                }}
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
              <div
                key={c.id}
                onClick={() => openCaseDetail(c)}
                className="bg-white rounded-2xl shadow-sm p-4 cursor-pointer hover:shadow-md transition"
              >
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
                    <span className="text-xs text-gray-500">
                      · {VERDICT_LABEL[c.verdict] || c.verdict}
                    </span>
                  )}
                  {(c.status === "OPEN" ||
                    c.status === "UNDER_REVIEW" ||
                    c.status === "WAITING_EVIDENCE") &&
                    [profileId, user?.id].includes(c.reporterId) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          withdrawCase(c.id);
                        }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTimeline(c.id);
                  }}
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
                    {p.amount
                      ? ` · ${Number(p.amount).toLocaleString("vi-VN")}₫`
                      : ""}
                    {p.durationDays ? ` · ${p.durationDays} ngày` : ""}
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

      {/* Modal chi tiết khiếu nại */}
      {selectedCase && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSelectedCase(null)}
        >
          <div
            className="bg-white w-full max-w-lg rounded-2xl p-5 space-y-3 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">{selectedCase.subject}</h3>
              <button
                onClick={() => setSelectedCase(null)}
                className="text-gray-400 text-xl"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-gray-400">
              {selectedCase.caseNumber} ·{" "}
              {CATEGORY_LABEL[selectedCase.category] || selectedCase.category} ·{" "}
              {ACTOR_LABEL[selectedCase.reporterType] ||
                selectedCase.reporterType}{" "}
              →{" "}
              {ACTOR_LABEL[selectedCase.respondentType] ||
                selectedCase.respondentType}
            </p>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[selectedCase.status] || "bg-gray-100 text-gray-600"}`}
              >
                {selectedCase.status}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SEVERITY_BADGE[selectedCase.severity] || "bg-gray-100"}`}
              >
                {selectedCase.severity}
              </span>
            </div>
            <p className="text-sm text-gray-700">{selectedCase.description}</p>
            {selectedCase.evidence?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500">
                  Ảnh bằng chứng của bên khiếu nại
                </p>
                <div className="flex gap-2 flex-wrap">
                  {selectedCase.evidence.map((url: string, i: number) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt="Bằng chứng"
                      className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                    />
                  ))}
                </div>
              </div>
            )}
            {selectedCase.respondentEvidence?.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-gray-500">
                  Ảnh minh chứng của bên bị khiếu nại
                </p>
                <div className="flex gap-2 flex-wrap">
                  {selectedCase.respondentEvidence.map(
                    (url: string, i: number) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={url}
                        alt="Ảnh minh chứng"
                        className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                      />
                    ),
                  )}
                </div>
              </div>
            )}
            {selectedCase.respondentResponse && (
              <div className="bg-gray-50 rounded-xl p-3 text-sm">
                <p className="font-semibold text-gray-700">Phản hồi:</p>
                <p className="text-gray-600">
                  {selectedCase.respondentResponse}
                </p>
              </div>
            )}
            {!selectedCase.respondentResponse &&
              selectedCase.respondentType === "MERCHANT" &&
              ACTIVE_STATUSES.includes(selectedCase.status) && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                  Bạn chưa phản hồi vụ việc này — hãy gửi giải trình và ảnh minh
                  chứng để AI có căn cứ đối chiếu.
                </p>
              )}
            {selectedCase.verdict && (
              <div className="bg-green-50 rounded-xl p-3 space-y-1 border border-green-100">
                <p className="text-xs font-semibold text-green-700 uppercase">
                  📋 Kết quả xử lý
                </p>
                <p className="text-sm font-semibold text-gray-800">
                  {VERDICT_LABEL[selectedCase.verdict] || selectedCase.verdict}
                  {selectedCase.faultParty
                    ? ` · Lỗi thuộc ${FAULT_PARTY_LABEL[selectedCase.faultParty] || selectedCase.faultParty}`
                    : ""}
                </p>
                {selectedCase.resolutionNote && (
                  <p className="text-xs text-gray-600">
                    {selectedCase.resolutionNote}
                  </p>
                )}
              </div>
            )}
            {casePenalties.length > 0 && (
              <div className="bg-red-50 rounded-xl p-3 space-y-2 border border-red-100">
                <p className="text-xs font-semibold text-red-700 uppercase">
                  📋 Kết quả xử phạt & bồi thường
                </p>
                {casePenalties
                  .filter((p: any) => p.type === "FINE")
                  .map((p: any, i: number) => (
                    <div key={`fine-${i}`} className="text-sm text-gray-700">
                      <p className="font-semibold">
                        💰 Phạt {ACTOR_LABEL[p.targetType] || p.targetType}:
                        {p.amount
                          ? ` ${Number(p.amount).toLocaleString("vi-VN")}₫`
                          : ""}
                        {p.durationDays ? ` · ${p.durationDays} ngày` : ""}
                      </p>
                      <p className="text-xs text-gray-500">{p.reason}</p>
                    </div>
                  ))}
                {casePenalties
                  .filter((p: any) => p.type === "COMPENSATION")
                  .map((p: any, i: number) => (
                    <div key={`comp-${i}`} className="text-sm text-gray-700">
                      <p className="font-semibold">
                        🤝 Bồi thường{" "}
                        {ACTOR_LABEL[p.targetType] || p.targetType}:
                        {p.amount
                          ? ` ${Number(p.amount).toLocaleString("vi-VN")}₫`
                          : ""}
                      </p>
                      <p className="text-xs text-gray-500">{p.reason}</p>
                    </div>
                  ))}
                {casePenalties
                  .filter(
                    (p: any) => p.type !== "FINE" && p.type !== "COMPENSATION",
                  )
                  .map((p: any, i: number) => (
                    <div key={`other-${i}`} className="text-sm text-gray-700">
                      <p className="font-semibold">
                        {ACTOR_LABEL[p.targetType] || p.targetType}:{" "}
                        {PENALTY_LABEL[p.type] || p.type}
                        {p.amount
                          ? ` · ${Number(p.amount).toLocaleString("vi-VN")}₫`
                          : ""}
                        {p.durationDays ? ` · ${p.durationDays} ngày` : ""}
                      </p>
                      <p className="text-xs text-gray-500">{p.reason}</p>
                    </div>
                  ))}
              </div>
            )}
            {selectedCase.respondentType === "MERCHANT" &&
              ACTIVE_STATUSES.includes(selectedCase.status) && (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  {selectedCase.status === "WAITING_EVIDENCE" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                      Admin đang yêu cầu bổ sung bằng chứng — hãy gửi giải
                      trình/ảnh để AI phân tích lại.
                    </p>
                  )}
                  {respondingCaseId === selectedCase.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={respondText}
                        onChange={(e) => setRespondText(e.target.value)}
                        placeholder="Phản hồi của bạn..."
                        rows={3}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={uploadRespondEvidence}
                        className="text-xs text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5"
                      />
                      {respondEvidence.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {respondEvidence.map((url, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={url}
                              alt="Bằng chứng"
                              className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                            />
                          ))}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => respondCase(selectedCase.id)}
                          disabled={respondBusy}
                          className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26] disabled:opacity-50"
                        >
                          Gửi phản hồi
                        </button>
                        <button
                          onClick={() => setRespondingCaseId(null)}
                          className="px-3 py-2 rounded-lg text-sm text-gray-500 border border-gray-200"
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setRespondingCaseId(selectedCase.id);
                          setRespondText("");
                          setRespondEvidence([]);
                        }}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-500 text-white hover:bg-blue-600"
                      >
                        Phản hồi
                      </button>
                      <button
                        onClick={() => confirmCase(selectedCase.id)}
                        disabled={respondBusy}
                        className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-green-500 text-white hover:bg-green-600 disabled:opacity-50"
                      >
                        Xác nhận
                      </button>
                    </div>
                  )}
                </div>
              )}

            {/*
              Bổ sung ảnh minh chứng KHÔNG cần viết lại phản hồi.
              Hiện cho bên bị khiếu nại (gửi ảnh món đã chuẩn bị/đóng gói, hoá
              đơn, camera) và cho bên khiếu nại (ảnh bổ sung sau khiếu nại).
              Chỉ mở ở trạng thái còn xử lý — case đã chốt thì API trả 400.
            */}
            {ACTIVE_STATUSES.includes(selectedCase.status) &&
              (selectedCase.respondentType === "MERCHANT" ||
                (!!selectedCase.reporterId &&
                  [profileId, user?.id]
                    .filter(Boolean)
                    .includes(selectedCase.reporterId))) && (
                <div className="space-y-2 border-t border-gray-100 pt-3">
                  <p className="text-sm font-semibold text-gray-700">
                    📷 Bổ sung ảnh minh chứng
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {selectedCase.respondentType === "MERCHANT"
                      ? "Ảnh món đã chuẩn bị/đóng gói, hoá đơn hoặc ảnh camera — AI dùng để đối chiếu với ảnh khách gửi."
                      : "Ảnh bổ sung cho khiếu nại của bạn — AI sẽ phân tích lại ngay sau khi nhận."}
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={uploadExtraEvidence}
                    className="text-xs text-gray-500 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5"
                  />
                  {extraEvidence.length > 0 && (
                    <div className="flex gap-2 flex-wrap">
                      {extraEvidence.map((url, i) => (
                        <button
                          key={i}
                          type="button"
                          title="Bấm để xoá ảnh này"
                          onClick={() =>
                            setExtraEvidence((prev) =>
                              prev.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={url}
                            alt="Ảnh minh chứng"
                            className="h-16 w-16 object-cover rounded-lg border border-gray-200"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => submitExtraEvidence(selectedCase.id)}
                    disabled={evidenceBusy || extraEvidence.length === 0}
                    className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-white hover:bg-gray-900 disabled:opacity-50"
                  >
                    {evidenceBusy
                      ? "Đang gửi..."
                      : `Gửi ${extraEvidence.length} ảnh minh chứng`}
                  </button>
                </div>
              )}
          </div>
        </div>
      )}
    </MerchantShell>
  );
}
