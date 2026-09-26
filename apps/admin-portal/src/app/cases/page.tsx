"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolutionApi, walletApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";

const CASE_STATUS_BADGE: Record<string, string> = {
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

const PENALTY_STATUS_BADGE: Record<string, string> = {
  ISSUED: "bg-gray-100 text-gray-600",
  EXECUTING: "bg-blue-100 text-blue-700",
  EXECUTED: "bg-green-100 text-green-700",
  EXECUTION_FAILED: "bg-red-100 text-red-700",
  APPEALED: "bg-amber-100 text-amber-700",
  UPHELD: "bg-green-100 text-green-700",
  OVERTURNED: "bg-purple-100 text-purple-700",
  WAIVED: "bg-gray-100 text-gray-500",
};

const PENALTY_TYPE_LABEL: Record<string, string> = {
  WARNING: "⚠️ Cảnh cáo",
  FINE: "💰 Phạt tiền",
  COMPENSATION: "🤝 Bồi thường",
  SUSPEND: "⏸️ Tạm khóa",
  BAN: "🚫 Khóa vĩnh viễn",
  REPUTATION_DEDUCTION: "⭐ Trừ điểm uy tín",
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
  COD_THEFT: "Chiếm dụng COD",
  ORDER_FARMING: "Đơn ảo",
  FAKE_REVIEW: "Đánh giá giả",
  PROMO_ABUSE: "Lạm dụng KM",
  REFUND_ABUSE: "Lạm dụng hoàn tiền",
  MULTI_ACCOUNT: "Nhiều tài khoản",
  CHARGEBACK_FRAUD: "Gian lận thanh toán",
  GPS_SPOOFING: "Giả mạo GPS",
  COLLUSION: "Thông đồng",
};

const ACTOR_LABEL: Record<string, string> = {
  CONSUMER: "Khách hàng",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  ADMIN: "Admin",
  SYSTEM: "Hệ thống",
};

const FAULT_PARTY_LABEL: Record<string, string> = {
  CUSTOMER: "Khách hàng",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  SYSTEM: "Hệ thống",
  INCONCLUSIVE: "Không xác định",
};

const VERDICT_LABEL: Record<string, string> = {
  VALID: "✅ Khiếu nại hợp lệ",
  INVALID: "❌ Khiếu nại không hợp lệ",
  INCONCLUSIVE: "❓ Chưa đủ căn cứ",
};

function formatVnd(n: unknown): string {
  return (Number(n) || 0).toLocaleString("vi-VN") + "₫";
}

function timeAgo(s?: string): string {
  if (!s) return "-";
  const diff = Math.floor((Date.now() - new Date(s).getTime()) / 60000);
  if (diff < 1) return "Vừa xong";
  if (diff < 60) return `${diff} phút trước`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export default function AdminCasesPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [tab, setTab] = useState<"cases" | "penalties" | "fraud">("cases");

  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fType, setFType] = useState("");
  const [fSeverity, setFSeverity] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [casePenalties, setCasePenalties] = useState<any[]>([]);

  const [createForm, setCreateForm] = useState({
    type: "COMPLAINT",
    category: "MISSING_ITEM",
    orderId: "",
    respondentId: "",
    respondentType: "MERCHANT",
    subject: "",
    description: "",
  });
  const [showCreate, setShowCreate] = useState(false);

  const [penaltyForm, setPenaltyForm] = useState({
    type: "FINE",
    amount: "",
    durationDays: "",
    reason: "",
  });
  const [showPenalty, setShowPenalty] = useState(false);
  const [resolveForm, setResolveForm] = useState({
    faultParty: "MERCHANT",
    note: "",
  });

  const [penalties, setPenalties] = useState<any[]>([]);
  const [pLoading, setPLoading] = useState(false);
  const [pStatus, setPStatus] = useState("");

  const [rules, setRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({
    name: "",
    category: "REFUND_ABUSE",
    severity: "MEDIUM",
    description: "",
  });
  const [detectResult, setDetectResult] = useState<any>(null);
  const [detectLoading, setDetectLoading] = useState(false);
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);
  const [debts, setDebts] = useState<any[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadCases();
    loadPenalties();
    loadRules();
    loadReserve();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, fStatus, fType, fSeverity, pStatus]);

  async function loadCases() {
    setLoading(true);
    setError("");
    try {
      const res: any = await resolutionApi.listCases({
        status: fStatus || undefined,
        type: fType || undefined,
        severity: fSeverity || undefined,
        take: 100,
      });
      setCases(res?.data || []);
    } catch {
      setError("Không thể tải danh sách vụ việc");
    } finally {
      setLoading(false);
    }
  }

  async function openCase(c: any) {
    setSelected(c);
    setTimeline([]);
    setCasePenalties([]);
    try {
      const fresh: any = await resolutionApi.getCase(c.id);
      if (fresh?.data) {
        setSelected(fresh.data);
        const ids: string[] = fresh.data.penaltyIds || [];
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
      }
    } catch {
      /* ignore */
    }
    try {
      const t: any = await resolutionApi.getTimeline(c.id);
      setTimeline(t?.data || []);
    } catch {
      /* ignore */
    }
  }

  async function act(fn: () => Promise<any>, okMsg: string) {
    setMsg("");
    try {
      await fn();
      setMsg(`✅ ${okMsg}`);
      await loadCases();
      if (selected) await openCase(selected);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Thao tác thất bại"}`);
    }
  }

  async function loadPenalties() {
    setPLoading(true);
    try {
      const res: any = await resolutionApi.listPenalties({
        status: pStatus || undefined,
        take: 100,
      });
      setPenalties(res?.data || []);
    } catch {
      /* ignore */
    } finally {
      setPLoading(false);
    }
  }

  async function loadRules() {
    try {
      const res: any = await resolutionApi.listFraudRules();
      setRules(res?.data || []);
    } catch {
      /* ignore */
    }
  }

  async function loadReserve() {
    try {
      const r: any = await walletApi.getReserveBalance();
      setReserveBalance(Number(r?.balance) || 0);
    } catch {
      setReserveBalance(null);
    }
    try {
      const d: any = await walletApi.listDebts(14);
      setDebts(d?.data || []);
    } catch {
      setDebts([]);
    }
  }

  async function handleCreateCase() {
    if (!createForm.subject.trim() || !createForm.description.trim()) {
      setMsg("❌ Vui lòng nhập tiêu đề và mô tả");
      return;
    }
    setMsg("");
    try {
      await resolutionApi.createCase({
        type: createForm.type,
        category: createForm.category,
        orderId: createForm.orderId || undefined,
        respondentId: createForm.respondentId || "unknown",
        respondentType: createForm.respondentType,
        subject: createForm.subject,
        description: createForm.description,
      });
      setMsg("✅ Đã tạo vụ việc");
      setShowCreate(false);
      await loadCases();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Tạo thất bại"}`);
    }
  }

  async function handleIssuePenalty() {
    if (!selected) return;
    setMsg("");
    try {
      await resolutionApi.issuePenalty({
        caseId: selected.id,
        type: penaltyForm.type,
        targetId: selected.respondentId,
        targetType: selected.respondentType,
        amount: penaltyForm.amount ? Number(penaltyForm.amount) : undefined,
        durationDays: penaltyForm.durationDays
          ? Number(penaltyForm.durationDays)
          : undefined,
        reason: penaltyForm.reason || selected.subject,
      });
      setMsg("✅ Đã ban hành + thi hành hình phạt");
      setShowPenalty(false);
      await loadPenalties();
      await openCase(selected);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Ban hành phạt thất bại"}`);
    }
  }

  async function resolveWithPenalty(verdict: string) {
    if (!selected) return;
    setMsg("");
    try {
      await resolutionApi.resolve(selected.id, {
        verdict,
        note: resolveForm.note || undefined,
        faultParty: resolveForm.faultParty,
      });
      setMsg(`✅ Đã phán quyết: ${VERDICT_LABEL[verdict] || verdict}`);
      await loadCases();
      await loadPenalties();
      if (selected) await openCase(selected);
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Phán quyết thất bại"}`);
    }
  }

  async function handleDetect() {
    setDetectLoading(true);
    setDetectResult(null);
    try {
      const res: any = await resolutionApi.detectFraud();
      setDetectResult(res?.data);
    } catch (e: any) {
      setDetectResult({ error: e?.message || "Quét thất bại" });
    } finally {
      setDetectLoading(false);
    }
  }

  async function handleCreateRule() {
    if (!ruleForm.name.trim()) {
      setMsg("❌ Nhập tên rule");
      return;
    }
    setMsg("");
    try {
      await resolutionApi.createFraudRule({
        name: ruleForm.name,
        category: ruleForm.category,
        description: ruleForm.description || undefined,
        severity: ruleForm.severity,
      });
      setMsg("✅ Đã tạo rule");
      setRuleForm({
        name: "",
        category: "REFUND_ABUSE",
        severity: "MEDIUM",
        description: "",
      });
      await loadRules();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Tạo rule thất bại"}`);
    }
  }

  async function handleToggleRule(r: any) {
    try {
      await resolutionApi.updateFraudRule(r.id, { enabled: !r.enabled });
      await loadRules();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Cập nhật thất bại"}`);
    }
  }

  async function handleDeleteRule(id: string) {
    try {
      await resolutionApi.deleteFraudRule(id);
      await loadRules();
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Xóa thất bại"}`);
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <header className="bg-white shadow-sm px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-gray-400 hover:text-gray-600"
          >
            ← Quay lại
          </button>
          <h1 className="text-xl font-bold">
            🛡️ Khiếu nại · Gian lận · Xử phạt
          </h1>
        </div>
        <div className="flex gap-2">
          {(
            [
              ["cases", "📋 Vụ việc"],
              ["penalties", "💰 Hình phạt"],
              ["fraud", "🔎 Gian lận"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                tab === key
                  ? "bg-[#ff6b35] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
              💰 Quỹ dự phòng
            </p>
            <p className="text-2xl font-bold text-[#1a1a2e]">
              {reserveBalance === null
                ? "—"
                : `${reserveBalance.toLocaleString("vi-VN")}₫`}
            </p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase mb-1">
              🧾 Nợ COD quá hạn (trên 14 ngày)
            </p>
            <p className="text-2xl font-bold text-red-600">{debts.length}</p>
            {debts.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {debts.map((d: any, i: number) => (
                  <p key={i} className="text-xs text-gray-500">
                    {d.consumerId?.slice(0, 8)}… · {d.balance}₫ ·{" "}
                    {d.daysOverdue} ngày
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
        {msg && (
          <div className="bg-white rounded-2xl shadow-sm px-4 py-3 text-sm font-medium">
            {msg}
          </div>
        )}

        {tab === "cases" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-2xl shadow-sm p-4 flex flex-wrap gap-2 items-center">
                <select
                  value={fStatus}
                  onChange={(e) => setFStatus(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="OPEN">OPEN</option>
                  <option value="UNDER_REVIEW">UNDER_REVIEW</option>
                  <option value="WAITING_EVIDENCE">WAITING_EVIDENCE</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="REJECTED">REJECTED</option>
                  <option value="ESCALATED">ESCALATED</option>
                </select>
                <select
                  value={fType}
                  onChange={(e) => setFType(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  <option value="">Tất cả loại</option>
                  <option value="COMPLAINT">COMPLAINT</option>
                  <option value="FRAUD_REPORT">FRAUD_REPORT</option>
                </select>
                <select
                  value={fSeverity}
                  onChange={(e) => setFSeverity(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  <option value="">Mọi mức độ</option>
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
                <button
                  onClick={() => setShowCreate(!showCreate)}
                  className="ml-auto px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black"
                >
                  + Tạo vụ việc
                </button>
              </div>

              {showCreate && (
                <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                  <p className="font-semibold text-[#1a1a2e]">
                    Tạo khiếu nại mới (Admin)
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={createForm.type}
                      onChange={(e) =>
                        setCreateForm((f) => ({ ...f, type: e.target.value }))
                      }
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    >
                      <option value="COMPLAINT">COMPLAINT</option>
                      <option value="FRAUD_REPORT">FRAUD_REPORT</option>
                    </select>
                    <select
                      value={createForm.category}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          category: e.target.value,
                        }))
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
                      value={createForm.respondentType}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          respondentType: e.target.value,
                        }))
                      }
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    >
                      <option value="MERCHANT">MERCHANT</option>
                      <option value="DRIVER">DRIVER</option>
                      <option value="CONSUMER">CONSUMER</option>
                    </select>
                    <input
                      value={createForm.respondentId}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          respondentId: e.target.value,
                        }))
                      }
                      placeholder="respondentId"
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                    <input
                      value={createForm.orderId}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          orderId: e.target.value,
                        }))
                      }
                      placeholder="orderId (tùy chọn)"
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                    <input
                      value={createForm.subject}
                      onChange={(e) =>
                        setCreateForm((f) => ({
                          ...f,
                          subject: e.target.value,
                        }))
                      }
                      placeholder="Tiêu đề"
                      className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                    />
                  </div>
                  <textarea
                    value={createForm.description}
                    onChange={(e) =>
                      setCreateForm((f) => ({
                        ...f,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Mô tả chi tiết"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                  />
                  <button
                    onClick={handleCreateCase}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
                  >
                    Lưu
                  </button>
                </div>
              )}

              {loading ? (
                <p className="text-gray-400 text-sm">Đang tải...</p>
              ) : error ? (
                <p className="text-red-500 text-sm">{error}</p>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                          Vụ việc
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                          Mức độ
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                          Trạng thái
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                          Thời gian
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {cases.map((c: any) => (
                        <tr
                          key={c.id}
                          onClick={() => openCase(c)}
                          className={`cursor-pointer hover:bg-orange-50/50 transition ${selected?.id === c.id ? "bg-orange-50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">
                              {c.subject}
                            </p>
                            <p className="text-xs text-gray-400">
                              {c.caseNumber} ·{" "}
                              {CATEGORY_LABEL[c.category] || c.category} ·{" "}
                              {c.reporterType} → {c.respondentType}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SEVERITY_BADGE[c.severity] || "bg-gray-100 text-gray-600"}`}
                            >
                              {c.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CASE_STATUS_BADGE[c.status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                            {timeAgo(c.createdAt)}
                          </td>
                        </tr>
                      ))}
                      {cases.length === 0 && (
                        <tr>
                          <td
                            colSpan={4}
                            className="px-4 py-8 text-center text-gray-400"
                          >
                            Chưa có vụ việc nào
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {selected ? (
                <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-bold text-[#1a1a2e]">
                        {selected.subject}
                      </h2>
                      <p className="text-xs text-gray-400">
                        {selected.caseNumber} ·{" "}
                        {CATEGORY_LABEL[selected.category] || selected.category}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CASE_STATUS_BADGE[selected.status] || "bg-gray-100 text-gray-600"}`}
                    >
                      {selected.status}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600">
                    {selected.description}
                  </p>

                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                    <p>
                      Người khiếu nại:{" "}
                      {ACTOR_LABEL[selected.reporterType] || selected.reporterType}
                    </p>
                    <p>
                      Bên bị khiếu nại:{" "}
                      {ACTOR_LABEL[selected.respondentType] ||
                        selected.respondentType}
                    </p>
                    <p className="col-span-2">Mã đơn: {selected.orderId || "-"}</p>
                  </div>

                  {selected.evidence?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                        📷 Bằng chứng của người khiếu nại
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {selected.evidence.map((url: string, i: number) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={i}
                            src={url}
                            alt={`Bằng chứng ${i + 1}`}
                            className="h-24 w-24 object-cover rounded-lg border border-gray-200"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {(selected.respondentResponse ||
                    selected.respondentEvidence?.length > 0) && (
                    <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase">
                        💬 Phản hồi của bên bị khiếu nại
                        {selected.respondentRespondedAt
                          ? ` · ${timeAgo(selected.respondentRespondedAt)}`
                          : ""}
                      </p>
                      {selected.respondentResponse && (
                        <p className="text-sm text-gray-700">
                          {selected.respondentResponse}
                        </p>
                      )}
                      {selected.respondentEvidence?.length > 0 && (
                        <div className="flex gap-2 flex-wrap">
                          {selected.respondentEvidence.map(
                            (url: string, i: number) => (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                key={i}
                                src={url}
                                alt={`Phản hồi ${i + 1}`}
                                className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                              />
                            ),
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(selected.verdict ||
                    selected.faultParty ||
                    selected.resolutionNote) && (
                    <div className="bg-green-50 rounded-xl p-3 space-y-1 border border-green-100">
                      <p className="text-xs font-semibold text-green-700 uppercase">
                        ✅ Kết quả xử lý
                      </p>
                      {selected.verdict && (
                        <p className="text-sm font-semibold text-gray-800">
                          {VERDICT_LABEL[selected.verdict] || selected.verdict}
                        </p>
                      )}
                      {selected.faultParty && (
                        <p className="text-sm text-gray-700">
                          Lỗi thuộc về:{" "}
                          <span className="font-semibold">
                            {FAULT_PARTY_LABEL[selected.faultParty] ||
                              selected.faultParty}
                          </span>
                        </p>
                      )}
                      {selected.resolutionNote && (
                        <p className="text-xs text-gray-600">
                          📝 {selected.resolutionNote}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        act(
                          () => resolutionApi.review(selected.id),
                          "Chuyển điều tra",
                        )
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100"
                    >
                      Điều tra
                    </button>
                    <button
                      onClick={() =>
                        act(
                          () => resolutionApi.requestEvidence(selected.id),
                          "Yêu cầu thêm bằng chứng",
                        )
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 hover:bg-amber-100"
                    >
                      Cần bằng chứng
                    </button>
                    <button
                      onClick={() => setShowPenalty(!showPenalty)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100"
                    >
                      + Ban hành phạt
                    </button>
                    <button
                      onClick={() =>
                        act(
                          () => resolutionApi.escalate(selected.id),
                          "Leo thang",
                        )
                      }
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100"
                    >
                      Leo thang
                    </button>
                  </div>

                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <p className="text-xs font-semibold text-gray-400 uppercase">
                      Xử lý khiếu nại theo lỗi ai
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={resolveForm.faultParty}
                        onChange={(e) =>
                          setResolveForm((f) => ({
                            ...f,
                            faultParty: e.target.value,
                          }))
                        }
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      >
                        {Object.keys(FAULT_PARTY_LABEL).map((k) => (
                          <option key={k} value={k}>
                            {FAULT_PARTY_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <input
                        value={resolveForm.note}
                        onChange={(e) =>
                          setResolveForm((f) => ({
                            ...f,
                            note: e.target.value,
                          }))
                        }
                        placeholder="Ghi chú phán quyết"
                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["VALID", "INVALID", "INCONCLUSIVE"].map((v) => (
                        <button
                          key={v}
                          onClick={() => resolveWithPenalty(v)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
                        >
                          {VERDICT_LABEL[v] || v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {casePenalties.length > 0 && (
                    <div className="bg-red-50 rounded-xl p-3 space-y-2 border border-red-100">
                      <p className="text-xs font-semibold text-red-700 uppercase">
                        🚨 Xử phạt đã ban hành
                      </p>
                      {casePenalties.map((p: any) => {
                        const party =
                          p.targetId === selected.reporterId
                            ? "Người khiếu nại"
                            : p.targetId === selected.respondentId
                              ? "Bên bị khiếu nại"
                              : ACTOR_LABEL[p.targetType] || p.targetType;
                        return (
                          <div key={p.id} className="text-sm text-gray-700">
                            <p className="font-semibold">
                              {party} ({ACTOR_LABEL[p.targetType] || p.targetType}
                              ): {PENALTY_TYPE_LABEL[p.type] || p.type}
                              {p.amount ? ` · ${formatVnd(p.amount)}` : ""}
                              {p.durationDays
                                ? ` · ${p.durationDays} ngày`
                                : ""}
                            </p>
                            <p className="text-xs text-gray-500">{p.reason}</p>
                            <span
                              className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${PENALTY_STATUS_BADGE[p.status] || "bg-gray-100 text-gray-600"}`}
                            >
                              {p.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {showPenalty && (
                    <div className="border border-gray-100 rounded-xl p-3 space-y-2">
                      <p className="text-sm font-semibold">
                        Ban hành hình phạt
                      </p>
                      <select
                        value={penaltyForm.type}
                        onChange={(e) =>
                          setPenaltyForm((f) => ({
                            ...f,
                            type: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      >
                        {Object.keys(PENALTY_TYPE_LABEL).map((k) => (
                          <option key={k} value={k}>
                            {PENALTY_TYPE_LABEL[k]}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={penaltyForm.amount}
                          onChange={(e) =>
                            setPenaltyForm((f) => ({
                              ...f,
                              amount: e.target.value,
                            }))
                          }
                          placeholder="Số tiền/điểm"
                          className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                        <input
                          value={penaltyForm.durationDays}
                          onChange={(e) =>
                            setPenaltyForm((f) => ({
                              ...f,
                              durationDays: e.target.value,
                            }))
                          }
                          placeholder="Số ngày khóa"
                          className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                        />
                      </div>
                      <input
                        value={penaltyForm.reason}
                        onChange={(e) =>
                          setPenaltyForm((f) => ({
                            ...f,
                            reason: e.target.value,
                          }))
                        }
                        placeholder="Lý do"
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                      />
                      <button
                        onClick={handleIssuePenalty}
                        className="w-full px-3 py-2 rounded-lg text-sm font-semibold bg-green-600 text-white hover:bg-green-700"
                      >
                        Thi hành ngay
                      </button>
                    </div>
                  )}

                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                      Timeline
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {timeline.map((t: any, i: number) => (
                        <p key={i} className="text-xs text-gray-500">
                          <span className="font-semibold">{t.toStatus}</span>{" "}
                          {t.fromStatus ? `(từ ${t.fromStatus})` : ""} ·{" "}
                          {timeAgo(t.createdAt)}
                          {t.note ? ` — ${t.note}` : ""}
                        </p>
                      ))}
                      {timeline.length === 0 && (
                        <p className="text-xs text-gray-300">Chưa có log</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl shadow-sm p-6 text-center text-gray-400 text-sm">
                  Chọn một vụ việc để xem chi tiết
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "penalties" && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-4 flex items-center gap-2">
              <select
                value={pStatus}
                onChange={(e) => setPStatus(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
              >
                <option value="">Tất cả trạng thái phạt</option>
                <option value="ISSUED">ISSUED</option>
                <option value="EXECUTING">EXECUTING</option>
                <option value="EXECUTED">EXECUTED</option>
                <option value="EXECUTION_FAILED">EXECUTION_FAILED</option>
                <option value="APPEALED">APPEALED</option>
                <option value="UPHELD">UPHELD</option>
                <option value="OVERTURNED">OVERTURNED</option>
                <option value="WAIVED">WAIVED</option>
              </select>
              {pLoading && (
                <span className="text-xs text-gray-400">Đang tải...</span>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                      Hình phạt
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                      Đối tượng
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                      Giá trị
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                      Trạng thái
                    </th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                      Hành động
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {penalties.map((p: any) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-800">
                          {PENALTY_TYPE_LABEL[p.type] || p.type}
                        </p>
                        <p className="text-xs text-gray-400">{p.reason}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {p.targetType} · {p.targetId?.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-right text-sm">
                        {p.amount != null
                          ? formatVnd(p.amount)
                          : p.durationDays
                            ? `${p.durationDays} ngày`
                            : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PENALTY_STATUS_BADGE[p.status] || "bg-gray-100 text-gray-600"}`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {p.status === "EXECUTED" && (
                            <button
                              onClick={() =>
                                act(
                                  () =>
                                    resolutionApi.appealPenalty(p.id, {
                                      reason: "Kháng nghị",
                                    }),
                                  "Kháng nghị",
                                )
                              }
                              className="px-2 py-1 rounded text-xs bg-amber-50 text-amber-600 hover:bg-amber-100"
                            >
                              Appeal
                            </button>
                          )}
                          {p.status === "APPEALED" && (
                            <>
                              <button
                                onClick={() =>
                                  act(
                                    () =>
                                      resolutionApi.decideAppeal(p.id, {
                                        upheld: true,
                                      }),
                                    "Giữ phạt",
                                  )
                                }
                                className="px-2 py-1 rounded text-xs bg-green-50 text-green-700 hover:bg-green-100"
                              >
                                Giữ
                              </button>
                              <button
                                onClick={() =>
                                  act(
                                    () =>
                                      resolutionApi.decideAppeal(p.id, {
                                        upheld: false,
                                      }),
                                    "Hủy phạt",
                                  )
                                }
                                className="px-2 py-1 rounded text-xs bg-purple-50 text-purple-700 hover:bg-purple-100"
                              >
                                Hủy
                              </button>
                            </>
                          )}
                          <button
                            onClick={() =>
                              act(
                                () => resolutionApi.waivePenalty(p.id),
                                "Bỏ phạt",
                              )
                            }
                            className="px-2 py-1 rounded text-xs bg-gray-50 text-gray-500 hover:bg-gray-100"
                          >
                            Waive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {penalties.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-8 text-center text-gray-400"
                      >
                        Chưa có hình phạt
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "fraud" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-[#1a1a2e]">
                Rule phát hiện gian lận
              </h2>
              <div className="flex gap-2">
                <input
                  value={ruleForm.name}
                  onChange={(e) =>
                    setRuleForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Tên rule"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
                />
                <select
                  value={ruleForm.category}
                  onChange={(e) =>
                    setRuleForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
                >
                  {Object.keys(CATEGORY_LABEL)
                    .filter(
                      (k) =>
                        ![
                          "ORDER_QUALITY",
                          "MISSING_ITEM",
                          "WRONG_ITEM",
                          "DELIVERY_LATE",
                          "NOT_RECEIVED",
                          "DRIVER_BEHAVIOR",
                          "MERCHANT_BEHAVIOR",
                          "DAMAGED_ITEM",
                          "UNAUTHORIZED_CANCEL",
                        ].includes(k),
                    )
                    .map((k) => (
                      <option key={k} value={k}>
                        {CATEGORY_LABEL[k]}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleCreateRule}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-[#ff6b35] text-white hover:bg-[#e85a26]"
                >
                  Thêm
                </button>
              </div>
              <div className="space-y-2">
                {rules.map((r: any) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border border-gray-100 rounded-xl px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-semibold text-gray-800">
                        {r.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {CATEGORY_LABEL[r.category] || r.category} ·{" "}
                        {r.severity}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleToggleRule(r)}
                        className="px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100"
                      >
                        {r.enabled ? "Tắt" : "Bật"}
                      </button>
                      <button
                        onClick={() => handleDeleteRule(r.id)}
                        className="px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                ))}
                {rules.length === 0 && (
                  <p className="text-sm text-gray-300">Chưa có rule</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
              <h2 className="font-bold text-[#1a1a2e]">
                Quét gian lận tự động
              </h2>
              <p className="text-xs text-gray-400">
                Phát hiện đối tượng có ≥3 vụ việc trong 30 ngày → tự tạo
                FRAUD_REPORT.
              </p>
              <button
                onClick={handleDetect}
                disabled={detectLoading}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black disabled:opacity-50"
              >
                {detectLoading ? "Đang quét..." : "🔎 Quét ngay"}
              </button>
              {detectResult && (
                <div className="bg-gray-50 rounded-xl p-3 text-sm">
                  {detectResult.error ? (
                    <p className="text-red-600">⚠️ {detectResult.error}</p>
                  ) : (
                    <p>
                      Đã gắn cờ <b>{detectResult.flagged}</b> đối tượng · tự tạo{" "}
                      <b>{detectResult.created}</b> FRAUD_REPORT.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white flex justify-around py-2 pb-3 border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] z-[100]">
        <Link
          href="/"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📊</span>
          <span>Dashboard</span>
        </Link>
        <Link
          href="/cases"
          className="flex flex-col items-center text-[10px] text-[#ff6b35] no-underline"
        >
          <span className="text-[22px]">🛡️</span>
          <span>Khiếu nại</span>
        </Link>
        <Link
          href="/orders"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">📋</span>
          <span>Orders</span>
        </Link>
        <Link
          href="/users"
          className="flex flex-col items-center text-[10px] text-gray-400 no-underline"
        >
          <span className="text-[22px]">👥</span>
          <span>Users</span>
        </Link>
      </nav>
    </div>
  );
}
