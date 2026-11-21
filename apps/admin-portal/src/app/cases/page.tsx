"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { resolutionApi, walletApi, orderApi } from "@mythfood/api-client";
import type { CaseAiListSummary } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import AdminShell from "../../components/AdminShell";
import CaseAiAssistant from "../../components/CaseAiAssistant";

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

const CASE_STATUS_LABEL: Record<string, string> = {
  OPEN: "Mở mới",
  UNDER_REVIEW: "Đang xem xét",
  WAITING_EVIDENCE: "Chờ bằng chứng",
  RESOLVED: "Đã giải quyết",
  REJECTED: "Đã bác bỏ",
  WITHDRAWN: "Đã rút lại",
  ESCALATED: "Đã chuyển cấp",
  CLOSED: "Đã đóng",
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
  FINE: "💰 Phạt tiền (nộp quỹ dự phòng)",
  COMPENSATION: "🤝 Bồi thường cho khách",
  SUSPEND: "⏸️ Tạm khoá tài khoản",
  BAN: "🚫 Khoá vĩnh viễn",
  REPUTATION_DEDUCTION: "⭐ Trừ điểm uy tín",
  RESTRICT_ACTIVITY: "🔒 Hạn chế hoạt động",
};

/** Nhãn tiếng Việt cho trạng thái hình phạt (thay vì hiện mã enum). */
const PENALTY_STATUS_LABEL: Record<string, string> = {
  ISSUED: "Vừa ban hành",
  EXECUTING: "Đang thi hành",
  EXECUTED: "Đã thi hành",
  EXECUTION_FAILED: "Thi hành lỗi",
  APPEALED: "Đang kháng nghị",
  UPHELD: "Giữ nguyên",
  OVERTURNED: "Đã huỷ",
  WAIVED: "Được miễn",
};

/** Ví nào bị trừ khi bồi thường/ phạt (hiển thị trong phần xem trước). */
const WALLET_OF_FAULT: Record<string, string> = {
  CUSTOMER: "ví khách hàng",
  MERCHANT: "ví nhà hàng",
  DRIVER: "ví tài xế",
  SYSTEM: "quỹ nền tảng",
};

/**
 * Chế tài admin chọn tay ở bước ④ của khung “Xử lý vụ việc”.
 *
 * - `WARNING` / `COMPENSATION` do luồng phán quyết VALID tự ghi
 *   (`recordResolutionPenalties`) ⇒ đưa vào form sẽ tạo bản ghi trùng.
 * - `RESTRICT_ACTIVITY` chưa được service nào thi hành ⇒ chọn xong không có
 *   tác dụng gì, dễ khiến admin tưởng đã xử lý.
 */
/**
 * Danh mục bồi thường theo GIÁ TRỊ MÓN (khớp `PARTIAL_ITEM_CATEGORIES` ở
 * resolution-service): khách chỉ thiếu/sai/hỏng một phần món nên không được
 * hoàn cả đơn — admin chọn số tiền bồi thường, ví chuyển đúng phần đó từ bên lỗi.
 */
const ITEM_COMPENSATION_CATEGORIES = [
  "MISSING_ITEM",
  "WRONG_ITEM",
  "DAMAGED_ITEM",
];

const MANUAL_PENALTY_TYPES: readonly string[] = [
  "FINE",
  "SUSPEND",
  "BAN",
  "REPUTATION_DEDUCTION",
];

const PENALTY_TYPE_HINT: Record<string, string> = {
  FINE: "Trừ tiền trong ví của bên bị phạt",
  SUSPEND: "Khoá tài khoản tạm thời theo số ngày",
  BAN: "Khoá vĩnh viễn tài khoản",
  REPUTATION_DEDUCTION: "Trừ điểm uy tín (chỉ tài xế)",
};

/** Chế tài cần nhập số tiền/điểm. */
function penaltyNeedsAmount(type: string): boolean {
  return type === "FINE" || type === "REPUTATION_DEDUCTION";
}

/** Chế tài cần nhập số ngày khoá. */
function penaltyNeedsDays(type: string): boolean {
  return type === "SUSPEND";
}

type PenaltyTargetKey = "RESPONDENT" | "REPORTER";

interface PenaltyTargetOption {
  key: PenaltyTargetKey;
  id: string;
  type: string;
  label: string;
}

/** Các bên có thể bị xử phạt trong vụ việc (bỏ SYSTEM / không xác định). */
function penaltyTargets(c: any): PenaltyTargetOption[] {
  const options: PenaltyTargetOption[] = [];
  const add = (key: PenaltyTargetKey, id?: string, type?: string) => {
    const targetType = String(type || "").toUpperCase();
    if (!id || !targetType || targetType === "SYSTEM") return;
    const who = ACTOR_LABEL[targetType] || targetType;
    const suffix =
      key === "RESPONDENT" ? "bên bị khiếu nại" : "người khiếu nại";
    options.push({ key, id, type: targetType, label: `${who} (${suffix})` });
  };
  add("RESPONDENT", c?.respondentId, c?.respondentType);
  add("REPORTER", c?.reporterId, c?.reporterType);
  return options;
}

/** Form chế tài mặc định: bên bị khiếu nại, phạt tiền, chưa nhập gì. */
function emptyPenaltyForm(c?: any) {
  const hasRespondent =
    !!c?.respondentId &&
    String(c?.respondentType || "").toUpperCase() !== "SYSTEM";
  return {
    type: "FINE",
    target: (hasRespondent || !c ? "RESPONDENT" : "REPORTER") as PenaltyTargetKey,
    amount: "",
    durationDays: "",
    reason: "",
  };
}

/**
 * Vụ việc có thể xử lý / ban hành chế tài từ drawer này không?
 *
 * `needsVerdict` = chưa có phán quyết VALID ⇒ nút chốt phải chạy thêm bước
 * `/cases/:id/resolve` (phán quyết + bồi thường/cảnh cáo tự động).
 */
function penaltyEligibility(c: any): {
  ok: boolean;
  needsVerdict: boolean;
  reason?: string;
} {
  if (!c) return { ok: false, needsVerdict: false, reason: "Chưa chọn vụ việc" };
  const status = c.status;
  const verdict = c.verdict;
  if (status === "RESOLVED" && verdict === "VALID") {
    return { ok: true, needsVerdict: false };
  }
  if (["REJECTED", "CLOSED", "WITHDRAWN"].includes(status)) {
    return {
      ok: false,
      needsVerdict: false,
      reason: "Vụ việc đã kết thúc — không thể phán quyết hợp lệ nữa",
    };
  }
  if (status === "RESOLVED") {
    return {
      ok: false,
      needsVerdict: false,
      reason:
        "Vụ việc đã phán quyết không hợp lệ (INVALID) — không thể ban hành hình phạt",
    };
  }
  return { ok: true, needsVerdict: true };
}

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

const RESPONDENT_TO_FAULT: Record<string, string> = {
  DRIVER: "DRIVER",
  MERCHANT: "MERCHANT",
  CONSUMER: "CUSTOMER",
};

const VERDICT_LABEL: Record<string, string> = {
  VALID: "✅ Khiếu nại hợp lệ",
  INVALID: "❌ Khiếu nại không hợp lệ",
  INCONCLUSIVE: "❓ Chưa đủ căn cứ",
};

/** Trạng thái còn phải xử lý — dùng cho chip lọc nhanh. */
const UNRESOLVED_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "WAITING_EVIDENCE",
  "ESCALATED",
];

const AI_VERDICT_LABEL: Record<string, string> = {
  VALID: "AI: có căn cứ",
  INVALID: "AI: không căn cứ",
  INCONCLUSIVE: "AI: chưa đủ căn cứ",
};

const AI_VERDICT_BADGE: Record<string, string> = {
  VALID: "bg-green-100 text-green-700",
  INVALID: "bg-red-100 text-red-700",
  INCONCLUSIVE: "bg-amber-100 text-amber-700",
};

const SEVERITY_RANK: Record<string, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

function formatVnd(n: unknown): string {
  return (Number(n) || 0).toLocaleString("vi-VN") + "₫";
}

/** Giá trị một dòng món trong đơn (đã nhân số lượng). */
function itemValue(item: any): number {
  return Math.round(
    Number(
      item?.subtotal ??
        Number(item?.unitPrice || 0) * Number(item?.quantity || 1),
    ) || 0,
  );
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
  /** Bộ lọc phía client — lọc ngay trên 100 vụ việc đã tải, không reload. */
  const [q, setQ] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fAiVerdict, setFAiVerdict] = useState("");
  const [fEvidenceOnly, setFEvidenceOnly] = useState(false);
  const [fUnresolvedOnly, setFUnresolvedOnly] = useState(false);
  const [fTime, setFTime] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "severity">(
    "newest",
  );
  /** Badge AI cho từng thẻ (1 request cho cả trang). */
  const [aiById, setAiById] = useState<Record<string, CaseAiListSummary>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [casePenalties, setCasePenalties] = useState<any[]>([]);
  /** Ảnh tài xế chụp món ăn lúc giao (bằng chứng hệ thống của đơn). */
  const [deliveryProofUrl, setDeliveryProofUrl] = useState("");
  /** Đơn của vụ việc — hiển thị món đã đặt để admin đối chiếu ảnh. */
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  /** Chống race: đóng drawer khi request chi tiết còn đang chạy. */
  const openTokenRef = useRef(0);

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

  const [penaltyForm, setPenaltyForm] = useState(() => emptyPenaltyForm());
  /**
   * Kết luận admin đang chọn ở Bước 1 (`""` = chưa chọn ⇒ chưa cho chốt).
   * Trước đây mỗi kết luận là một nút riêng nằm cạnh panel chế tài nên admin
   * không biết bấm nút nào trước; nay là lựa chọn duy nhất của một quy trình.
   */
  const [verdictPick, setVerdictPick] = useState<
    "" | "VALID" | "INVALID" | "INCONCLUSIVE"
  >("");
  /** Bật/tắt bước “phạt thêm” (mặc định tắt: không phạt ai là lựa chọn an toàn). */
  const [addPenalty, setAddPenalty] = useState(false);
  /** Món đang được tính vào tiền bồi thường (index trong `selectedOrder.items`). */
  const [compItems, setCompItems] = useState<number[]>([]);
  /** `ITEM` = bồi thường phần món bị lỗi; `FULL` = hoàn 100% đơn. */
  const [compMode, setCompMode] = useState<"ITEM" | "FULL">("ITEM");
  /** Đang gọi API phán quyết/thi hành — chặn double-click (tránh phạt 2 lần). */
  const [penaltyBusy, setPenaltyBusy] = useState(false);
  /**
   * Phản hồi hiển thị NGAY TRONG drawer.
   *
   * `msg` cấp trang nằm sau drawer (`fixed z-40/z-50`) nên admin bấm “Thi hành
   * ngay” xong không thấy gì — đây là lý do chính khiến luồng trông như “không
   * hoạt động”.
   */
  const [penaltyMsg, setPenaltyMsg] = useState("");
  const [penaltyTone, setPenaltyTone] = useState<"ok" | "warn" | "error">("ok");
  /** Hình phạt đang EXECUTION_FAILED để hiện nút “Thử lại thi hành”. */
  const [failedPenaltyId, setFailedPenaltyId] = useState<string | null>(null);
  const [resolveForm, setResolveForm] = useState({
    faultParty: "",
    note: "",
    /** Số tiền bồi thường cho phần món bị thiếu/sai/hỏng (chuỗi số, rỗng = hoàn cả đơn). */
    compensation: "",
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

  // Drawer chi tiết: khoá scroll nền + đóng bằng Escape cho thao tác nhanh.
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        openTokenRef.current += 1;
        setSelected(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

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
      const items: any[] = res?.data || [];
      setCases(items);

      // Badge AI cho lưới: một request cho cả trang. Lỗi badge không được làm
      // hỏng danh sách vụ việc.
      if (items.length > 0) {
        setAiLoading(true);
        resolutionApi
          .listCaseAiSummaries(items.map((c) => c.id))
          .then((r: any) => {
            const map: Record<string, CaseAiListSummary> = {};
            for (const summary of r?.data ?? []) {
              map[summary.caseId] = summary;
            }
            setAiById(map);
          })
          .catch(() => setAiById({}))
          .finally(() => setAiLoading(false));
      } else {
        setAiById({});
        setAiLoading(false);
      }
    } catch {
      setError("Không thể tải danh sách vụ việc");
    } finally {
      setLoading(false);
    }
  }

  async function openCase(c: any, opts?: { keepPenaltyMessage?: boolean }) {
    const token = ++openTokenRef.current;
    setSelected(c);
    setTimeline([]);
    setCasePenalties([]);
    setDeliveryProofUrl("");
    setSelectedOrder(null);
    setPenaltyForm(emptyPenaltyForm(c));
    // Mở vụ việc khác ⇒ xoá phản hồi cũ + đóng panel; giữ lại khi chỉ refresh
    // sau một thao tác (để admin đọc được kết quả vừa bấm).
    if (!opts?.keepPenaltyMessage) {
      setPenaltyMsg("");
      setFailedPenaltyId(null);
    }
    // Mỗi vụ việc bắt đầu lại từ Bước 1: không mang kết luận/món đã chọn của
    // vụ trước sang (dễ chốt nhầm tiền cho người khác).
    setVerdictPick("");
    setAddPenalty(false);
    setCompItems([]);
    setCompMode("ITEM");
    setResolveForm({
      faultParty: RESPONDENT_TO_FAULT[c.respondentType] || "",
      note: "",
      compensation: "",
    });
    try {
      const fresh: any = await resolutionApi.getCase(c.id);
      if (openTokenRef.current !== token) return;
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
          if (openTokenRef.current !== token) return;
          setCasePenalties(ps.filter(Boolean));
        }
        if (fresh.data.orderId) {
          try {
            const order: any = await orderApi.getById(fresh.data.orderId);
            if (openTokenRef.current !== token) return;
            setSelectedOrder(order ?? null);
            setDeliveryProofUrl(order?.deliveryProofPhotoUrl || "");
          } catch {
            /* không lấy được đơn — bỏ qua phần ảnh bằng chứng */
          }
        }
      }
    } catch {
      /* ignore */
    }
    try {
      const t: any = await resolutionApi.getTimeline(c.id);
      if (openTokenRef.current !== token) return;
      setTimeline(t?.data || []);
    } catch {
      /* ignore */
    }
  }

  /** Đóng drawer + huỷ luôn request chi tiết đang chạy (nếu có). */
  function closeCase() {
    openTokenRef.current += 1;
    setSelected(null);
    setPenaltyMsg("");
    setFailedPenaltyId(null);
    setVerdictPick("");
    setAddPenalty(false);
    setCompItems([]);
    setCompMode("ITEM");
    setPenaltyForm(emptyPenaltyForm());
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

  /**
   * Nút CHỐT duy nhất của khung “Xử lý vụ việc”.
   *
   * Một lần bấm thực hiện đúng những gì admin đã chọn:
   *   ① kết luận (khách đúng / khách sai / chưa đủ căn cứ),
   *   ② bên chịu lỗi + tiền trả khách (bồi thường phần món hoặc hoàn cả đơn),
   *   ③ chế tài thêm (tuỳ chọn, mặc định không phạt ai).
   *
   * Vì sao gộp: backend chỉ cho ban hành hình phạt khi vụ việc đã RESOLVED
   * (`penalty.service.ts`), nên trước đây admin phải bấm “Phán quyết” rồi mới
   * bấm “Thi hành” — hai nút nằm hai chỗ, rất dễ bấm thiếu hoặc chọn nhầm.
   *
   * Phản hồi ghi vào `penaltyMsg` (render TRONG drawer) vì `msg` cấp trang bị
   * drawer `fixed z-40/z-50` che khuất.
   */
  async function handleSubmitDecision() {
    if (!selected || penaltyBusy) return;

    const tone = (value: "ok" | "warn" | "error", message: string) => {
      setPenaltyTone(value);
      setPenaltyMsg(message);
    };

    const state = penaltyEligibility(selected);
    if (!state.ok) {
      tone("error", `❌ ${state.reason || "Vụ việc không thể xử lý"}`);
      return;
    }

    const needsVerdict = state.needsVerdict;
    const verdict = needsVerdict ? verdictPick : "VALID";
    if (!verdict) {
      tone("error", "❌ Bước ①: chọn kết luận của bạn trước khi chốt");
      return;
    }

    const faultParty =
      verdict === "INCONCLUSIVE" ? "INCONCLUSIVE" : resolveForm.faultParty;
    if (needsVerdict && verdict === "VALID" && !faultParty) {
      tone(
        "error",
        "❌ Bước ②: chọn bên chịu lỗi (người bị trừ tiền bồi thường)",
      );
      return;
    }

    // Tiền trả khách: chỉ áp dụng khi case chưa kết luận + danh mục món bị lỗi.
    const itemMode =
      needsVerdict && canPickItemCompensation && compMode === "ITEM";
    const fullMode =
      needsVerdict && canPickItemCompensation && compMode === "FULL";
    if (verdict === "VALID" && itemMode && !(itemCompensation > 0)) {
      tone(
        "error",
        "❌ Bước ③: chọn món bị lỗi, hoặc bấm “Hoàn cả đơn” nếu khách không dùng được gì",
      );
      return;
    }
    const requestedAmount = itemMode ? itemCompensation : 0;

    // Chế tài thêm (tuỳ chọn) — chỉ có nghĩa khi kết luận khách đúng.
    const wantPenalty = verdict === "VALID" && addPenalty;
    const targets = penaltyTargets(selected);
    const target =
      targets.find((t) => t.key === penaltyForm.target) ?? targets[0];
    const type = penaltyForm.type;
    const amount = Number(penaltyForm.amount.replace(/[^\d]/g, ""));
    const durationDays = Number(penaltyForm.durationDays.replace(/[^\d]/g, ""));
    const penaltyReason =
      penaltyForm.reason.trim() ||
      resolveForm.note.trim() ||
      selected.subject ||
      `Xử lý vụ việc ${selected.id}`;

    if (wantPenalty) {
      if (!target) {
        tone("error", "❌ Bước ④: vụ việc không có bên nào có thể bị xử phạt");
        return;
      }
      if (type === "FINE" && !(amount > 0)) {
        tone(
          "error",
          "❌ Bước ④: phạt tiền cần số tiền lớn hơn 0 (ví dụ: 50000)",
        );
        return;
      }
      if (type === "SUSPEND" && !(durationDays >= 1)) {
        tone("error", "❌ Bước ④: tạm khoá cần số ngày >= 1");
        return;
      }
      if (type === "REPUTATION_DEDUCTION") {
        if (target.type !== "DRIVER") {
          tone("error", "❌ Bước ④: chỉ trừ điểm uy tín của tài xế");
          return;
        }
        if (!(amount > 0)) {
          tone("error", "❌ Bước ④: cần số điểm uy tín cần trừ (> 0)");
          return;
        }
      }
    }

    // Chuyển tiền là thao tác không hoàn tác ⇒ xác nhận lại đúng những gì
    // khung “Sẽ thực hiện” đang liệt kê.
    if (
      typeof window !== "undefined" &&
      verdict === "VALID" &&
      decisionPlan.length > 0
    ) {
      const ok = window.confirm(
        `Chốt vụ việc ${selected.caseNumber || selected.id}?\n\n${decisionPlan
          .map((line) => `• ${line}`)
          .join("\n")}\n\nTiền sẽ được chuyển ngay và không hoàn tác được.`,
      );
      if (!ok) return;
    }

    setPenaltyBusy(true);
    setFailedPenaltyId(null);
    setPenaltyMsg("");

    let verdictDone = false;
    try {
      if (needsVerdict) {
        await resolutionApi.resolve(selected.id, {
          verdict,
          faultParty,
          note:
            resolveForm.note.trim() ||
            `${VERDICT_LABEL[verdict] || verdict}${
              wantPenalty ? ` + ${PENALTY_TYPE_LABEL[type] || type}` : ""
            }`,
          // Bồi thường phần món bị lỗi (nếu admin đã chọn) — độc lập với tiền phạt.
          compensationAmount: requestedAmount > 0 ? requestedAmount : undefined,
        });
        verdictDone = true;
      }

      let executionError: string | null = null;
      if (wantPenalty && target) {
        const res: any = await resolutionApi.issuePenalty({
          caseId: selected.id,
          type,
          targetId: target.id,
          targetType: target.type,
          amount: penaltyNeedsAmount(type) ? amount : undefined,
          durationDays: penaltyNeedsDays(type) ? durationDays : undefined,
          reason: penaltyReason,
        });
        executionError = res?.data?.executionError || null;
        if (executionError) setFailedPenaltyId(res?.data?.id || null);
      }

      // Câu xác nhận đọc lại đúng việc đã làm, không dùng thuật ngữ nội bộ.
      const done: string[] = [];
      if (verdictDone) {
        done.push(
          verdict === "VALID"
            ? "đã ghi kết luận khách đúng"
            : verdict === "INVALID"
              ? "đã bác khiếu nại của khách"
              : "đã ghi chưa đủ căn cứ",
        );
      }
      if (verdict === "VALID" && needsVerdict) {
        done.push(
          requestedAmount > 0
            ? `trả khách ${formatVnd(requestedAmount)}`
            : fullMode
              ? "hoàn 100% đơn cho khách"
              : "hoàn tiền cho khách theo chính sách danh mục",
        );
      }
      if (wantPenalty) {
        done.push(
          `${PENALTY_TYPE_LABEL[type] || type} cho ${
            target?.label || "bên bị xử phạt"
          }${
            penaltyNeedsAmount(type)
              ? ` · ${amount.toLocaleString("vi-VN")}${
                  type === "FINE" ? "₫" : " điểm"
                }`
              : ""
          }${penaltyNeedsDays(type) ? ` · ${durationDays} ngày` : ""}`,
        );
      }

      if (executionError) {
        setPenaltyTone("warn");
        setPenaltyMsg(
          `⚠️ ${done.join(" · ")} — nhưng CHƯA thi hành được chế tài: ${executionError}`,
        );
      } else {
        setPenaltyTone("ok");
        setPenaltyMsg(`✅ Đã chốt: ${done.join(" · ")}.`);
        setVerdictPick("");
        setAddPenalty(false);
        setCompItems([]);
        setCompMode("ITEM");
      }

      await loadCases();
      await loadPenalties();
      await openCase(selected, { keepPenaltyMessage: true });
    } catch (e: any) {
      const detail = e?.message || "lỗi không rõ";
      setPenaltyTone("error");
      setPenaltyMsg(
        verdictDone
          ? `❌ Đã ghi kết luận nhưng ban hành chế tài thất bại: ${detail}. Vụ việc đã chuyển “Đã giải quyết” — bật “Phạt thêm bên có lỗi” rồi bấm chốt lại để thử tiếp.`
          : `❌ Chốt vụ việc thất bại: ${detail}`,
      );
      await loadCases();
      await openCase(selected, { keepPenaltyMessage: true });
    } finally {
      setPenaltyBusy(false);
    }
  }

  /** Thi hành lại hình phạt EXECUTION_FAILED (idempotent theo penalty.id). */
  async function handleRetryPenalty(id: string) {
    if (penaltyBusy) return;
    setPenaltyBusy(true);
    setFailedPenaltyId(null);
    setPenaltyMsg("");
    setMsg("");
    try {
      const res: any = await resolutionApi.retryPenalty(id);
      const executionError = res?.data?.executionError;
      if (executionError) {
        setPenaltyTone("warn");
        setPenaltyMsg(`⚠️ Vẫn chưa thi hành được: ${executionError}`);
        setMsg(`⚠️ Vẫn chưa thi hành được hình phạt: ${executionError}`);
        setFailedPenaltyId(res?.data?.id || id);
      } else {
        setPenaltyTone("ok");
        setPenaltyMsg("✅ Đã thi hành lại hình phạt thành công");
        setMsg("✅ Đã thi hành lại hình phạt thành công");
      }
      await loadPenalties();
      await loadCases();
      if (selected) await openCase(selected, { keepPenaltyMessage: true });
    } catch (e: any) {
      const detail = e?.message || "lỗi không rõ";
      setPenaltyTone("error");
      setPenaltyMsg(`❌ Thi hành lại thất bại: ${detail}`);
      setMsg(`❌ Thi hành lại thất bại: ${detail}`);
    } finally {
      setPenaltyBusy(false);
    }
  }

  /**
   * Vụ việc có thể bồi thường THEO GIÁ TRỊ MÓN? (khớp `PARTIAL_ITEM_CATEGORIES`
   * ở backend): khách khiếu nại thiếu/sai/hỏng một phần món trên đơn đã giao.
   */
  const canPickItemCompensation =
    !!selected &&
    String(selected.reporterType || "").toUpperCase() === "CONSUMER" &&
    !!selected.orderId &&
    ITEM_COMPENSATION_CATEGORIES.includes(String(selected.category || "")) &&
    // Chỉ có hiệu lực ở lần phán quyết đầu tiên: case đã RESOLVED thì tiền đã
    // được route, hiện ô nhập nữa chỉ gây hiểu nhầm là còn đổi được.
    penaltyEligibility(selected).needsVerdict;

  /** Số tiền bồi thường admin đang chọn (0 = chưa chọn món nào). */
  const itemCompensation =
    Number(resolveForm.compensation.replace(/[^\d]/g, "")) || 0;

  /**
   * Bật/tắt một món trong danh sách “món bị lỗi”.
   *
   * Trước đây nút “+ Bồi thường” cộng dồn nên bấm hai lần cùng một món là trả
   * gấp đôi; nay là bật/tắt và ô tiền luôn bằng tổng các món đang bật.
   */
  function toggleItemCompensation(index: number) {
    const items: any[] = selectedOrder?.items ?? [];
    const next = compItems.includes(index)
      ? compItems.filter((i) => i !== index)
      : [...compItems, index];
    setCompItems(next);
    setCompMode("ITEM");
    const sum = items.reduce(
      (acc, it, i) => (next.includes(i) ? acc + itemValue(it) : acc),
      0,
    );
    setResolveForm((f) => ({ ...f, compensation: sum > 0 ? String(sum) : "" }));
  }

  /** Admin tự nhập số tiền ⇒ bỏ chọn món để ô tiền không bị ghi đè. */
  function setManualCompensation(raw: string) {
    setCompItems([]);
    setCompMode("ITEM");
    setResolveForm((f) => ({ ...f, compensation: raw.replace(/[^\d]/g, "") }));
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

  /** Lọc + sắp xếp ngay trên client để đổi bộ lọc là thấy kết quả tức thì. */
  const filteredCases = useMemo(() => {
    const term = q.trim().toLowerCase();
    const now = Date.now();
    const windowMs =
      fTime === "24h"
        ? 24 * 3600 * 1000
        : fTime === "7d"
          ? 7 * 24 * 3600 * 1000
          : fTime === "30d"
            ? 30 * 24 * 3600 * 1000
            : null;

    const list = cases.filter((c: any) => {
      if (fCategory && c.category !== fCategory) return false;
      if (
        fEvidenceOnly &&
        !(Array.isArray(c.evidence) && c.evidence.length > 0)
      ) {
        return false;
      }
      if (fUnresolvedOnly && !UNRESOLVED_STATUSES.includes(String(c.status))) {
        return false;
      }
      if (windowMs) {
        const created = new Date(c.createdAt).getTime();
        if (!Number.isFinite(created) || now - created > windowMs) return false;
      }
      const ai = aiById[c.id];
      if (fAiVerdict === "NONE" && ai) return false;
      if (fAiVerdict && fAiVerdict !== "NONE" && ai?.verdict !== fAiVerdict) {
        return false;
      }
      if (term) {
        const haystack = [
          c.caseNumber,
          c.subject,
          c.description,
          c.orderId,
          c.category,
          c.reporterId,
          c.respondentId,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });

    return list.sort((a: any, b: any) => {
      if (sortBy === "severity") {
        const diff =
          (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
        if (diff !== 0) return diff;
      }
      const at = new Date(a.createdAt).getTime() || 0;
      const bt = new Date(b.createdAt).getTime() || 0;
      return sortBy === "oldest" ? at - bt : bt - at;
    });
  }, [
    cases,
    q,
    fCategory,
    fAiVerdict,
    fEvidenceOnly,
    fUnresolvedOnly,
    fTime,
    sortBy,
    aiById,
  ]);

  const activeFilterCount =
    (q.trim() ? 1 : 0) +
    (fCategory ? 1 : 0) +
    (fAiVerdict ? 1 : 0) +
    (fEvidenceOnly ? 1 : 0) +
    (fUnresolvedOnly ? 1 : 0) +
    (fTime ? 1 : 0);

  function resetFilters() {
    setQ("");
    setFCategory("");
    setFAiVerdict("");
    setFEvidenceOnly(false);
    setFUnresolvedOnly(false);
    setFTime("");
    setSortBy("newest");
    setFStatus("");
    setFType("");
    setFSeverity("");
  }

  // Giá trị dẫn xuất cho khung “Xử lý vụ việc” (rẻ, tính lại mỗi render).
  const penaltyTargetList = selected ? penaltyTargets(selected) : [];
  const eligibility = penaltyEligibility(selected);

  /**
   * Các giá trị dẫn xuất cho khung “Xử lý vụ việc”.
   *
   * Viết theo ngôn ngữ nghiệp vụ: admin đọc là biết ví ai bị trừ, ai nhận tiền,
   * bấm nút thì chuyện gì xảy ra — thay cho các mã VALID/INVALID/COMPENSATION.
   */
  /** Case đã ở RESOLVED + VALID ⇒ chỉ còn ban hành thêm chế tài. */
  const alreadyResolved = eligibility.ok && !eligibility.needsVerdict;
  const verdictValue: "" | "VALID" | "INVALID" | "INCONCLUSIVE" =
    alreadyResolved ? "VALID" : verdictPick;
  /** Ví bị trừ theo bên chịu lỗi admin chọn. */
  const walletLabel =
    WALLET_OF_FAULT[resolveForm.faultParty] || "ví bên có lỗi";
  const orderTotalText = selectedOrder?.totalAmount
    ? formatVnd(selectedOrder.totalAmount)
    : null;
  const pickedItemTotal = (selectedOrder?.items ?? []).reduce(
    (acc: number, it: any, i: number) =>
      compItems.includes(i) ? acc + itemValue(it) : acc,
    0,
  );

  /** Gạch đầu dòng “Sẽ thực hiện” — dùng cho xem trước và hộp thoại xác nhận. */
  const decisionPlan: string[] = [];
  if (alreadyResolved) {
    decisionPlan.push(
      "Vụ việc đã kết luận khách đúng — tiền đã được chuyển ở lần xử lý trước.",
    );
  } else if (!verdictPick) {
    decisionPlan.push("Chọn kết luận ở Bước ① để xem trước kết quả.");
  } else if (verdictPick === "INVALID") {
    decisionPlan.push(
      "Bác khiếu nại: khách không được hoàn tiền, không ai bị phạt.",
    );
  } else if (verdictPick === "INCONCLUSIVE") {
    decisionPlan.push(
      "Ghi chưa đủ căn cứ: đóng vụ việc, không hoàn tiền, không phạt.",
    );
  } else {
    decisionPlan.push(
      `Ghi kết luận: khách đúng — ${
        FAULT_PARTY_LABEL[resolveForm.faultParty] || "bên có lỗi"
      } chịu lỗi.`,
    );
    if (canPickItemCompensation) {
      if (compMode === "FULL") {
        decisionPlan.push(
          `Hoàn 100% đơn${
            orderTotalText ? ` (${orderTotalText})` : ""
          } cho khách, trừ ${walletLabel}.`,
        );
      } else if (itemCompensation > 0) {
        decisionPlan.push(
          `Trả khách ${formatVnd(itemCompensation)}, trừ ${walletLabel}.`,
        );
      } else {
        decisionPlan.push(
          "Chưa chọn món bị lỗi ⇒ chưa biết số tiền trả khách.",
        );
      }
    } else if (
      String(selected?.reporterType || "").toUpperCase() !== "CONSUMER"
    ) {
      decisionPlan.push(
        "Người khiếu nại không phải khách hàng ⇒ không hoàn tiền; chỉ ghi cảnh cáo/chế tài.",
      );
    } else {
      decisionPlan.push(
        "Tiền hoàn cho khách theo chính sách danh mục (có danh mục không hoàn tiền).",
      );
    }
  }
  if (verdictValue === "VALID" && addPenalty) {
    const penaltyTargetLabel =
      penaltyTargetList.find((t) => t.key === penaltyForm.target)?.label ||
      "bên bị xử phạt";
    const penaltyAmount = Number(penaltyForm.amount.replace(/[^\d]/g, "")) || 0;
    const penaltyDays =
      Number(penaltyForm.durationDays.replace(/[^\d]/g, "")) || 0;
    if (penaltyForm.type === "FINE") {
      decisionPlan.push(
        penaltyAmount > 0
          ? `Phạt ${penaltyTargetLabel}: trừ ${formatVnd(
              penaltyAmount,
            )} → quỹ dự phòng.`
          : `Phạt tiền ${penaltyTargetLabel}: chưa nhập số tiền.`,
      );
    } else if (penaltyForm.type === "SUSPEND") {
      decisionPlan.push(
        penaltyDays > 0
          ? `Tạm khoá ${penaltyTargetLabel} ${penaltyDays} ngày.`
          : `Tạm khoá ${penaltyTargetLabel}: chưa nhập số ngày.`,
      );
    } else if (penaltyForm.type === "REPUTATION_DEDUCTION") {
      decisionPlan.push(
        penaltyAmount > 0
          ? `Trừ ${penaltyAmount} điểm uy tín của ${penaltyTargetLabel}.`
          : `Trừ điểm uy tín ${penaltyTargetLabel}: chưa nhập số điểm.`,
      );
    } else {
      decisionPlan.push(`Khoá vĩnh viễn ${penaltyTargetLabel}.`);
    }
  }

  /** Nhãn nút chốt — đọc lên là biết bấm xong chuyện gì xảy ra. */
  const submitLabel = penaltyBusy
    ? "⏳ Đang xử lý..."
    : !verdictValue
      ? "① Chọn kết luận để mở khoá nút này"
      : verdictValue === "INVALID"
        ? "❌ Chốt: bác khiếu nại của khách"
        : verdictValue === "INCONCLUSIVE"
          ? "❓ Chốt: chưa đủ căn cứ — đóng vụ việc"
          : canPickItemCompensation
            ? compMode === "FULL"
              ? "✅ Chốt: khách đúng · hoàn 100% đơn"
              : itemCompensation > 0
                ? `✅ Chốt: khách đúng · trả khách ${formatVnd(
                    itemCompensation,
                  )}`
                : "③ Chọn món bị lỗi hoặc “Hoàn cả đơn”"
            : addPenalty
              ? "✅ Chốt: khách đúng + thi hành chế tài"
              : "✅ Chốt: khách đúng (chỉ cảnh cáo)";

  /** Còn thiếu lựa chọn bắt buộc ⇒ khoá nút và nói rõ thiếu gì. */
  const submitBlockedReason = !verdictValue
    ? "Bước ①: chọn kết luận của bạn."
    : verdictValue === "VALID" && !alreadyResolved && !resolveForm.faultParty
      ? "Bước ②: chọn bên chịu lỗi."
      : verdictValue === "VALID" &&
          canPickItemCompensation &&
          compMode === "ITEM" &&
          !(itemCompensation > 0)
        ? "Bước ③: chọn món bị lỗi (hoặc “Hoàn cả đơn”)."
        : "";
  const submitBlocked = penaltyBusy || submitBlockedReason !== "";

  const PENALTY_TONE_CLASS: Record<"ok" | "warn" | "error", string> = {
    ok: "bg-green-50 text-green-700 border-green-200",
    warn: "bg-amber-50 text-amber-700 border-amber-200",
    error: "bg-red-50 text-red-700 border-red-200",
  };

  if (!isAuthenticated) return null;

  return (
    <AdminShell title="🛡️ Khiếu nại · Gian lận · Xử phạt">
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
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
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[220px] flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      🔎
                    </span>
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Tìm mã vụ việc, tiêu đề, mã đơn, mô tả..."
                      className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <select
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  >
                    <option value="">Mọi danh mục</option>
                    {Object.keys(CATEGORY_LABEL).map((key) => (
                      <option key={key} value={key}>
                        {CATEGORY_LABEL[key]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fAiVerdict}
                    onChange={(e) => setFAiVerdict(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  >
                    <option value="">Mọi kết luận AI</option>
                    <option value="VALID">AI: có căn cứ</option>
                    <option value="INVALID">AI: không căn cứ</option>
                    <option value="INCONCLUSIVE">AI: chưa đủ căn cứ</option>
                    <option value="NONE">AI chưa phân tích</option>
                  </select>
                  <select
                    value={fTime}
                    onChange={(e) => setFTime(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  >
                    <option value="">Mọi thời gian</option>
                    <option value="24h">24 giờ qua</option>
                    <option value="7d">7 ngày qua</option>
                    <option value="30d">30 ngày qua</option>
                  </select>
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as "newest" | "oldest" | "severity",
                      )
                    }
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  >
                    <option value="newest">Mới nhất trước</option>
                    <option value="oldest">Cũ nhất trước</option>
                    <option value="severity">Mức độ cao trước</option>
                  </select>
                  <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#1a1a2e] text-white hover:bg-black"
                  >
                    + Tạo vụ việc
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">
                    {filteredCases.length}/{cases.length} vụ việc
                  </span>
                  <button
                    onClick={() => setFUnresolvedOnly((v) => !v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      fUnresolvedOnly
                        ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    🔔 Chưa xử lý
                  </button>
                  <button
                    onClick={() => setFEvidenceOnly((v) => !v)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      fEvidenceOnly
                        ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    📷 Có ảnh bằng chứng
                  </button>
                  <button
                    onClick={() =>
                      setFAiVerdict((v) => (v === "NONE" ? "" : "NONE"))
                    }
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      fAiVerdict === "NONE"
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    🤖 AI chưa phân tích
                  </button>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                      ✕ Xoá {activeFilterCount} bộ lọc
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-gray-400">
                    Lọc máy chủ
                  </span>
                  <select
                    value={fStatus}
                    onChange={(e) => setFStatus(e.target.value)}
                    className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                  >
                    <option value="">Tất cả trạng thái</option>
                    <option value="OPEN">Mở mới</option>
                    <option value="UNDER_REVIEW">Đang xem xét</option>
                    <option value="WAITING_EVIDENCE">Chờ bằng chứng</option>
                    <option value="RESOLVED">Đã giải quyết</option>
                    <option value="REJECTED">Đã bác bỏ</option>
                    <option value="ESCALATED">Đã chuyển cấp</option>
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
                </div>
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
              ) : filteredCases.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm p-10 text-center">
                  <p className="text-sm text-gray-500">
                    Không có vụ việc nào khớp bộ lọc.
                  </p>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="mt-2 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Xoá bộ lọc để xem tất cả
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                  {filteredCases.map((c: any) => {
                    const ai = aiById[c.id];
                    const evidenceCount = Array.isArray(c.evidence)
                      ? c.evidence.length
                      : 0;
                    const reviewed = !!ai?.reviewDecision;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => openCase(c)}
                        className={`group text-left bg-white rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          selected?.id === c.id
                            ? "border-[#ff6b35] ring-2 ring-orange-100"
                            : "border-gray-100"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              SEVERITY_BADGE[c.severity] ||
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {c.severity}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              CASE_STATUS_BADGE[c.status] ||
                              "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {CASE_STATUS_LABEL[c.status] || c.status}
                          </span>
                          {ai ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                AI_VERDICT_BADGE[ai.verdict] ||
                                "bg-gray-100 text-gray-600"
                              }`}
                              title={`AI · ${Math.round(
                                (Number(ai.confidence) || 0) * 100,
                              )}% · ${reviewed ? "admin đã xem" : "chưa duyệt"}`}
                            >
                              {AI_VERDICT_LABEL[ai.verdict] || ai.verdict} ·{" "}
                              {Math.round((Number(ai.confidence) || 0) * 100)}%
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-50 text-gray-400">
                              {aiLoading ? "AI đang tải…" : "AI chưa phân tích"}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-gray-400">
                            {timeAgo(c.createdAt)}
                          </span>
                        </div>

                        <p className="mt-2 line-clamp-2 font-semibold text-[#1a1a2e] group-hover:text-[#ff6b35]">
                          {c.subject}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {c.description}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                          <span className="font-mono">{c.caseNumber}</span>
                          <span>
                            {CATEGORY_LABEL[c.category] || c.category}
                          </span>
                          <span>
                            {ACTOR_LABEL[c.reporterType] || c.reporterType} →{" "}
                            {ACTOR_LABEL[c.respondentType] || c.respondentType}
                          </span>
                          {c.orderId && (
                            <span title={c.orderId}>
                              📦 #{String(c.orderId).slice(0, 8)}…
                            </span>
                          )}
                          {evidenceCount > 0 && (
                            <span>📷 {evidenceCount} ảnh</span>
                          )}
                          {c.respondentResponse && <span>💬 có phản hồi</span>}
                        </div>

                        {ai?.summary && (
                          <div className="mt-2 rounded-lg bg-indigo-50/60 px-2 py-1">
                            <p className="line-clamp-2 text-[11px] text-indigo-800">
                              🤖 {ai.summary}
                            </p>
                            <div className="mt-1 flex items-center gap-1.5">
                              <div className="h-1 flex-1 rounded-full bg-white/80 overflow-hidden">
                                <div
                                  className={`h-1 rounded-full ${
                                    ai.verdict === "VALID"
                                      ? "bg-green-500"
                                      : ai.verdict === "INVALID"
                                        ? "bg-red-500"
                                        : "bg-amber-500"
                                  }`}
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.round(
                                        (Number(ai.confidence) || 0) * 100,
                                      ),
                                    )}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-indigo-500">
                                {ai.source === "AUTO" ? "tự động" : "chạy tay"}
                                {reviewed ? " · đã duyệt" : " · chưa duyệt"}
                              </span>
                            </div>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {selected && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
                  onClick={closeCase}
                  aria-hidden
                />
                <aside className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white p-5 shadow-2xl sm:max-w-xl">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400">
                      Chi tiết vụ việc
                    </p>
                    <button
                      onClick={closeCase}
                      className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      ✕ Đóng
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="font-bold text-[#1a1a2e]">
                          {selected.subject}
                        </h2>
                        <p className="text-xs text-gray-400">
                          {selected.caseNumber} ·{" "}
                          {CATEGORY_LABEL[selected.category] ||
                            selected.category}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CASE_STATUS_BADGE[selected.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {CASE_STATUS_LABEL[selected.status] || selected.status}
                      </span>
                    </div>

                    <p className="text-sm text-gray-600">
                      {selected.description}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                      <p>
                        Người khiếu nại:{" "}
                        {ACTOR_LABEL[selected.reporterType] ||
                          selected.reporterType}
                      </p>
                      <p>
                        Bên bị khiếu nại:{" "}
                        {ACTOR_LABEL[selected.respondentType] ||
                          selected.respondentType}
                      </p>
                      <p className="col-span-2">
                        Mã đơn: {selected.orderId || "-"}
                      </p>
                    </div>

                    {selectedOrder?.items?.length > 0 && (
                      <div className="rounded-xl border border-gray-100 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase text-gray-400">
                            🍱 Món khách đã đặt (mốc đối chiếu)
                          </p>
                          <span className="text-[11px] text-gray-400">
                            Tổng: {formatVnd(selectedOrder.totalAmount)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {selectedOrder.items.map((item: any, i: number) => {
                            const options = Array.isArray(item.options)
                              ? item.options
                                  .map((option: any) =>
                                    typeof option === "string"
                                      ? option
                                      : option?.name,
                                  )
                                  .filter(Boolean)
                                  .join(", ")
                              : typeof item.options === "string"
                                ? item.options
                                : "";
                            return (
                              <div
                                key={i}
                                className="flex items-center gap-2 text-xs text-gray-700"
                              >
                                {item.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-8 w-8 rounded-lg border border-gray-100 object-cover"
                                  />
                                ) : (
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-50">
                                    🍽️
                                  </span>
                                )}
                                <span className="font-semibold">
                                  {item.quantity}×
                                </span>
                                <span className="flex-1">
                                  {item.name}
                                  {options ? ` · ${options}` : ""}
                                  {item.specialInstructions
                                    ? ` · ${item.specialInstructions}`
                                    : ""}
                                </span>
                                <span className="shrink-0 text-gray-500">
                                  {formatVnd(
                                    item.subtotal ??
                                      Number(item.unitPrice || 0) *
                                        Number(item.quantity || 1),
                                  )}
                                </span>
                                {canPickItemCompensation && (
                                  <button
                                    type="button"
                                    onClick={() => toggleItemCompensation(i)}
                                    title={
                                      compItems.includes(i)
                                        ? "Bỏ món này khỏi tiền bồi thường"
                                        : "Cộng giá trị món này vào tiền bồi thường khách"
                                    }
                                    className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                                      compItems.includes(i)
                                        ? "bg-amber-500 border-amber-500 text-white"
                                        : "bg-white border-amber-300 text-amber-800 hover:bg-amber-100"
                                    }`}
                                  >
                                    {compItems.includes(i)
                                      ? "✓ Đã tính"
                                      : "+ Bồi thường"}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p className="mt-2 text-[11px] text-amber-700">
                          Đối chiếu danh sách này với ảnh giao hàng + ảnh khách:
                          hai ảnh giống nhau vẫn có thể cùng một món SAI.
                        </p>
                      </div>
                    )}

                    {deliveryProofUrl && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                          📷 Ảnh tài xế chụp lúc giao hàng (bằng chứng hệ thống)
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={deliveryProofUrl}
                          alt="Ảnh xác nhận giao hàng"
                          className="h-28 w-28 object-cover rounded-lg border border-gray-200"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">
                          Đối chiếu với ảnh/lời khai của hai bên trước khi kết
                          luận.
                        </p>
                      </div>
                    )}

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
                            {VERDICT_LABEL[selected.verdict] ||
                              selected.verdict}
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

                    {selected && <CaseAiAssistant caseId={selected.id} />}

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          act(
                            () => resolutionApi.review(selected.id),
                            "Đã chuyển sang điều tra",
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-600 hover:bg-blue-100"
                      >
                        🔍 Chuyển sang điều tra
                      </button>
                      <button
                        onClick={() =>
                          act(
                            () => resolutionApi.requestEvidence(selected.id),
                            "Đã gửi yêu cầu bổ sung bằng chứng",
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-600 hover:bg-amber-100"
                      >
                        📎 Yêu cầu thêm bằng chứng
                      </button>
                      <button
                        onClick={() =>
                          act(
                            () => resolutionApi.escalate(selected.id),
                            "Đã chuyển cấp trên xử lý",
                          )
                        }
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100"
                      >
                        ⬆️ Chuyển cấp trên
                      </button>
                    </div>

                    {penaltyMsg && (
                      <div
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold ${PENALTY_TONE_CLASS[penaltyTone]}`}
                      >
                        <p className="whitespace-pre-wrap">{penaltyMsg}</p>
                        {failedPenaltyId && (
                          <button
                            onClick={() => handleRetryPenalty(failedPenaltyId)}
                            disabled={penaltyBusy}
                            className="mt-2 px-2 py-1 rounded-lg text-[11px] font-semibold bg-white text-amber-700 border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
                          >
                            {penaltyBusy
                              ? "⏳ Đang thử lại..."
                              : "🔁 Thử lại thi hành"}
                          </button>
                        )}
                      </div>
                    )}

                    {eligibility.ok && (
                      <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-3 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-[#1a1a2e]">
                              ⚖️ Xử lý vụ việc
                            </p>
                            <p className="text-[11px] text-gray-500">
                              Làm lần lượt từng bước. Khung “Sẽ thực hiện” ở cuối
                              đọc lại đúng những gì sẽ xảy ra khi bấm nút.
                            </p>
                            <p className="mt-1 text-[11px] font-semibold text-indigo-700">
                              {CATEGORY_LABEL[selected.category] ||
                                selected.category}
                              {orderTotalText
                                ? ` · khách đã trả ${orderTotalText}`
                                : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                              alreadyResolved
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-indigo-200 bg-white text-indigo-600"
                            }`}
                          >
                            {alreadyResolved ? "Đã kết luận" : "Chưa kết luận"}
                          </span>
                        </div>

                        {!alreadyResolved && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase text-gray-500">
                              ① Kết luận của bạn{" "}
                              <span className="text-red-500">*</span>
                            </p>
                            <div className="grid gap-1.5">
                              {[
                                {
                                  v: "VALID" as const,
                                  t: "Khách đúng",
                                  d: "Bên kia có lỗi → hoàn/bồi thường tiền cho khách.",
                                },
                                {
                                  v: "INVALID" as const,
                                  t: "Khách sai",
                                  d: "Khiếu nại không có căn cứ → không hoàn tiền, không phạt ai.",
                                },
                                {
                                  v: "INCONCLUSIVE" as const,
                                  t: "Chưa đủ căn cứ",
                                  d: "Không xác định được ai đúng → đóng vụ việc.",
                                },
                              ].map((opt) => {
                                const active = verdictPick === opt.v;
                                return (
                                  <button
                                    key={opt.v}
                                    type="button"
                                    onClick={() => setVerdictPick(opt.v)}
                                    className={`rounded-xl border p-2 text-left transition ${
                                      active
                                        ? "border-indigo-500 bg-white ring-2 ring-indigo-100"
                                        : "border-gray-200 bg-white/70 hover:border-indigo-300"
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                                      <span
                                        className={`h-3.5 w-3.5 rounded-full border-2 ${
                                          active
                                            ? "border-indigo-500 bg-indigo-500"
                                            : "border-gray-300"
                                        }`}
                                      />
                                      {opt.t}
                                    </span>
                                    <span className="block pl-5 text-[11px] text-gray-500">
                                      {opt.d}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {verdictValue === "VALID" && !alreadyResolved && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase text-gray-500">
                              ② Bên chịu lỗi
                              <span className="text-red-500"> *</span>
                            </p>
                            <select
                              value={resolveForm.faultParty}
                              onChange={(e) =>
                                setResolveForm((f) => ({
                                  ...f,
                                  faultParty: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                            >
                              <option value="" disabled>
                                — Chọn bên chịu lỗi —
                              </option>
                              {Object.keys(FAULT_PARTY_LABEL).map((k) => (
                                <option key={k} value={k}>
                                  {FAULT_PARTY_LABEL[k]}
                                </option>
                              ))}
                            </select>
                            <p className="text-[11px] text-gray-500">
                              Tiền bồi thường (và tiền phạt nếu bật ở bước ④) sẽ
                              trừ vào {walletLabel}.
                            </p>
                            <input
                              value={resolveForm.note}
                              onChange={(e) =>
                                setResolveForm((f) => ({
                                  ...f,
                                  note: e.target.value,
                                }))
                              }
                              placeholder="Ghi chú xử lý (tuỳ chọn — khách sẽ thấy trong kết quả)"
                              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
                            />
                          </div>
                        )}
                        {verdictValue === "VALID" && !alreadyResolved && (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-bold uppercase text-gray-500">
                              ③ Tiền trả lại khách
                            </p>
                            {canPickItemCompensation ? (
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCompMode("ITEM");
                                    setCompItems([]);
                                    setResolveForm((f) => ({
                                      ...f,
                                      compensation: "",
                                    }));
                                  }}
                                  className={`rounded-xl border p-2 text-left ${
                                    compMode === "ITEM"
                                      ? "border-amber-500 bg-white ring-2 ring-amber-100"
                                      : "border-gray-200 bg-white/70 hover:border-amber-300"
                                  }`}
                                >
                                  <span className="block text-xs font-semibold text-gray-800">
                                    🍱 Chỉ món bị lỗi
                                  </span>
                                  <span className="block text-[10px] text-gray-500">
                                    Trả đúng giá trị món thiếu/sai/hỏng
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCompMode("FULL");
                                    setCompItems([]);
                                    setResolveForm((f) => ({
                                      ...f,
                                      compensation: "",
                                    }));
                                  }}
                                  className={`rounded-xl border p-2 text-left ${
                                    compMode === "FULL"
                                      ? "border-red-400 bg-white ring-2 ring-red-100"
                                      : "border-gray-200 bg-white/70 hover:border-red-300"
                                  }`}
                                >
                                  <span className="block text-xs font-semibold text-gray-800">
                                    🧾 Hoàn cả đơn
                                  </span>
                                  <span className="block text-[10px] text-gray-500">
                                    {orderTotalText
                                      ? `100% = ${orderTotalText}`
                                      : "100% số khách đã trả"}
                                  </span>
                                </button>
                              </div>
                            ) : (
                              <p className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-600">
                                Danh mục{" "}
                                <b>
                                  {CATEGORY_LABEL[selected.category] ||
                                    selected.category}
                                </b>
                                : hệ thống tự tính tiền hoàn theo chính sách
                                (có danh mục chỉ cảnh cáo, không hoàn tiền).
                              </p>
                            )}
                            {canPickItemCompensation && compMode === "ITEM" && (
                              <>
                                <p className="text-[11px] text-gray-500">
                                  Bấm chọn món bị thiếu/sai/hỏng (bấm lại để
                                  bỏ):
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                  {(selectedOrder?.items ?? []).length === 0 && (
                                    <span className="text-[11px] text-gray-400">
                                      Chưa tải được danh sách món — nhập tay số
                                      tiền bên dưới.
                                    </span>
                                  )}
                                  {(selectedOrder?.items ?? []).map(
                                    (item: any, i: number) => {
                                      const picked = compItems.includes(i);
                                      return (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => toggleItemCompensation(i)}
                                          className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                            picked
                                              ? "border-amber-500 bg-amber-500 text-white"
                                              : "border-gray-200 bg-white text-gray-700 hover:border-amber-400"
                                          }`}
                                        >
                                          {picked ? "✓ " : "+ "}
                                          {item.quantity}× {item.name} ·{" "}
                                          {formatVnd(itemValue(item))}
                                        </button>
                                      );
                                    },
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] text-gray-500">
                                    Hoặc nhập tay:
                                  </span>
                                  <input
                                    value={resolveForm.compensation}
                                    inputMode="numeric"
                                    disabled={penaltyBusy}
                                    onChange={(e) =>
                                      setManualCompensation(e.target.value)
                                    }
                                    placeholder="40000"
                                    className="w-28 px-2 py-1 rounded-lg border border-gray-200 text-sm bg-white"
                                  />
                                  <span className="text-sm font-semibold text-gray-600">
                                    ₫
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-600">
                                  {pickedItemTotal > 0 ? (
                                    <>
                                      Đang chọn {compItems.length} món ={" "}
                                      <b>{formatVnd(pickedItemTotal)}</b> → trả
                                      khách, trừ {walletLabel}.
                                    </>
                                  ) : itemCompensation > 0 ? (
                                    <>
                                      Sẽ trả khách{" "}
                                      <b>{formatVnd(itemCompensation)}</b>, trừ{" "}
                                      {walletLabel}.
                                    </>
                                  ) : (
                                    "Chưa chọn món nào."
                                  )}{" "}
                                  Trần = tiền món khách thực trả, không đụng
                                  tiền ship.
                                </p>
                              </>
                            )}

                          </div>
                        )}
                        {verdictValue === "VALID" && (
                          <div className="space-y-1.5">
                            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-gray-200 bg-white p-2">
                              <input
                                type="checkbox"
                                checked={addPenalty}
                                disabled={penaltyBusy}
                                onChange={(e) => setAddPenalty(e.target.checked)}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="block text-xs font-semibold text-gray-800">
                                  ④ Phạt thêm bên có lỗi (không bắt buộc)
                                </span>
                                <span className="block text-[10px] text-gray-500">
                                  Phạt tiền ở đây nộp vào QUỸ DỰ PHÒNG — khác với
                                  tiền bồi thường cho khách ở bước ③.
                                </span>
                              </span>
                            </label>

                            {addPenalty && (
                              <div className="space-y-1.5 rounded-xl border border-gray-200 bg-white p-2">
                                <label className="block text-[11px] font-semibold text-gray-500">
                                  Phạt ai?
                                </label>
                                <select
                                  value={
                                    penaltyTargetList.some(
                                      (t) => t.key === penaltyForm.target,
                                    )
                                      ? penaltyForm.target
                                      : penaltyTargetList[0]?.key || ""
                                  }
                                  onChange={(e) =>
                                    setPenaltyForm((f) => ({
                                      ...f,
                                      target: e.target.value as PenaltyTargetKey,
                                    }))
                                  }
                                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                >
                                  {penaltyTargetList.map((t) => (
                                    <option key={t.key} value={t.key}>
                                      {t.label}
                                    </option>
                                  ))}
                                </select>

                                <label className="block text-[11px] font-semibold text-gray-500">
                                  Hình thức xử lý
                                </label>
                                <select
                                  value={penaltyForm.type}
                                  onChange={(e) =>
                                    setPenaltyForm((f) => ({
                                      ...f,
                                      type: e.target.value,
                                    }))
                                  }
                                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                >
                                  {MANUAL_PENALTY_TYPES.map((k) => (
                                    <option key={k} value={k}>
                                      {PENALTY_TYPE_LABEL[k] || k}
                                    </option>
                                  ))}
                                </select>
                                <p className="text-[11px] text-gray-500">
                                  {PENALTY_TYPE_HINT[penaltyForm.type] || ""}
                                </p>
                                {(penaltyNeedsAmount(penaltyForm.type) ||
                                  penaltyNeedsDays(penaltyForm.type)) && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {penaltyNeedsAmount(penaltyForm.type) && (
                                      <input
                                        value={penaltyForm.amount}
                                        inputMode="numeric"
                                        onChange={(e) =>
                                          setPenaltyForm((f) => ({
                                            ...f,
                                            amount: e.target.value.replace(
                                              /[^\d]/g,
                                              "",
                                            ),
                                          }))
                                        }
                                        placeholder={
                                          penaltyForm.type ===
                                          "REPUTATION_DEDUCTION"
                                            ? "Số điểm uy tín"
                                            : "Số tiền (đồng)"
                                        }
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                      />
                                    )}
                                    {penaltyNeedsDays(penaltyForm.type) && (
                                      <input
                                        value={penaltyForm.durationDays}
                                        inputMode="numeric"
                                        onChange={(e) =>
                                          setPenaltyForm((f) => ({
                                            ...f,
                                            durationDays: e.target.value.replace(
                                              /[^\d]/g,
                                              "",
                                            ),
                                          }))
                                        }
                                        placeholder="Số ngày khoá"
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                      />
                                    )}
                                  </div>
                                )}
                                {penaltyForm.type === "REPUTATION_DEDUCTION" &&
                                  penaltyTargetList.find(
                                    (t) => t.key === penaltyForm.target,
                                  )?.type !== "DRIVER" && (
                                    <p className="text-[11px] font-semibold text-red-600">
                                      ⚠️ Chế tài này chỉ áp dụng cho tài xế — chọn
                                      “Phạt ai?” là tài xế.
                                    </p>
                                  )}
                                <input
                                  value={penaltyForm.reason}
                                  onChange={(e) =>
                                    setPenaltyForm((f) => ({
                                      ...f,
                                      reason: e.target.value,
                                    }))
                                  }
                                  placeholder="Lý do (mặc định: tiêu đề vụ việc)"
                                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
                                />

                              </div>
                            )}
                          </div>
                        )}
                        <div className="rounded-xl border border-gray-200 bg-white p-2.5">
                          <p className="text-[11px] font-bold uppercase text-gray-500">
                            📋 Bấm nút bên dưới, hệ thống sẽ
                          </p>
                          <ul className="mt-1 space-y-0.5">
                            {decisionPlan.map((line, i) => (
                              <li
                                key={i}
                                className="flex gap-1.5 text-[12px] text-gray-700"
                              >
                                <span className="text-indigo-500">•</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <button
                          onClick={handleSubmitDecision}
                          disabled={submitBlocked}
                          className={`w-full rounded-xl px-3 py-2.5 text-sm font-bold text-white ${
                            submitBlocked
                              ? "bg-gray-300 cursor-not-allowed"
                              : "bg-green-600 hover:bg-green-700"
                          }`}
                        >
                          {submitLabel}
                        </button>
                        {submitBlockedReason && !penaltyBusy && (
                          <p className="text-[11px] text-gray-500">
                            👉 {submitBlockedReason}
                          </p>
                        )}
                        {verdictValue === "VALID" && !submitBlockedReason && (
                          <p className="text-[10px] text-gray-400">
                            ⚠️ Bấm là chuyển tiền ngay, không hoàn tác được. Hệ
                            thống sẽ hỏi xác nhận lần nữa.
                          </p>
                        )}





                      </div>
                    )}


                    {!eligibility.ok && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-[11px] text-gray-500">
                        🔒 Không thể xử lý thêm:{" "}
                        {eligibility.reason || "vụ việc đã kết thúc"}.
                      </div>
                    )}

                    {casePenalties.length > 0 && (
                      <div className="bg-red-50 rounded-xl p-3 space-y-2 border border-red-100">
                        <p className="text-xs font-semibold text-red-700 uppercase">
                          🚨 Hình phạt &amp; bồi thường đã ghi
                        </p>
                        <p className="text-[11px] text-red-700/80">
                          Đây là các khoản đã trừ/chuyển thật trên ví — bấm “Thử
                          lại” nếu trạng thái là “Thi hành lỗi”.
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
                                {party} (
                                {ACTOR_LABEL[p.targetType] || p.targetType}
                                ): {PENALTY_TYPE_LABEL[p.type] || p.type}
                                {p.amount ? ` · ${formatVnd(p.amount)}` : ""}
                                {p.durationDays
                                  ? ` · ${p.durationDays} ngày`
                                  : ""}
                              </p>
                              <p className="text-xs text-gray-500">
                                {p.reason}
                              </p>
                              <div className="mt-1 flex items-center gap-2">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${PENALTY_STATUS_BADGE[p.status] || "bg-gray-100 text-gray-600"}`}
                                >
                                  {PENALTY_STATUS_LABEL[p.status] || p.status}
                                </span>
                                {p.status === "EXECUTION_FAILED" && (
                                  <button
                                    onClick={() => handleRetryPenalty(p.id)}
                                    disabled={penaltyBusy}
                                    className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-white text-amber-700 border border-amber-300 hover:bg-amber-100 disabled:opacity-50"
                                  >
                                    🔁 Thử lại
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
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
                </aside>
              </>
            )}
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
                <option value="">Tất cả trạng thái</option>
                <option value="ISSUED">Vừa ban hành</option>
                <option value="EXECUTING">Đang thi hành</option>
                <option value="EXECUTED">Đã thi hành</option>
                <option value="EXECUTION_FAILED">Thi hành lỗi</option>
                <option value="APPEALED">Đang kháng nghị</option>
                <option value="UPHELD">Giữ nguyên</option>
                <option value="OVERTURNED">Đã huỷ</option>
                <option value="WAIVED">Được miễn</option>
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
                        {ACTOR_LABEL[p.targetType] || p.targetType} ·{" "}
                        {p.targetId?.slice(0, 8)}…
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
                          {PENALTY_STATUS_LABEL[p.status] || p.status}
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
                              Kháng nghị
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
                                Giữ phạt
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
                                Huỷ phạt
                              </button>
                            </>
                          )}
                          {p.status === "EXECUTION_FAILED" && (
                            <button
                              onClick={() => handleRetryPenalty(p.id)}
                              disabled={penaltyBusy}
                              className="px-2 py-1 rounded text-xs bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                            >
                              {penaltyBusy ? "Đang thử..." : "Thử lại"}
                            </button>
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
    </AdminShell>
  );
}
