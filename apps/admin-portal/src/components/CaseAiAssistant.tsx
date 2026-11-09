"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { resolutionApi } from "@mythfood/api-client";
import type {
  AiDecisionOutcome,
  AiImageReadStatus,
  AiSideImageAnalysis,
  AssistantHealth,
  CaseAiAnalysisRecord,
  CaseAiAutoStatus,
  CaseAiContext,
  CaseAiSuggestion,
} from "@mythfood/api-client";
import { formatDateTime, formatVnd } from "../lib/format";

const VERDICT_LABEL: Record<string, string> = {
  VALID: "✅ Có căn cứ",
  INVALID: "❌ Không có căn cứ",
  INCONCLUSIVE: "❓ Chưa đủ căn cứ",
};

const VERDICT_TONE: Record<string, string> = {
  VALID: "bg-green-100 text-green-700",
  INVALID: "bg-red-100 text-red-700",
  INCONCLUSIVE: "bg-amber-100 text-amber-700",
};

const FAULT_LABEL: Record<string, string> = {
  CUSTOMER: "Khách hàng",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
  SYSTEM: "Hệ thống",
  INCONCLUSIVE: "Không xác định",
};

const ACTION_LABEL: Record<string, string> = {
  WARNING: "⚠️ Cảnh cáo",
  FINE: "💰 Phạt tiền",
  COMPENSATION: "🤝 Bồi thường",
  SUSPEND: "⏸️ Tạm khóa",
  BAN: "🚫 Khóa vĩnh viễn",
  REPUTATION_DEDUCTION: "⭐ Trừ uy tín",
  RESTRICT_ACTIVITY: "🔒 Hạn chế hoạt động",
};

const TARGET_LABEL: Record<string, string> = {
  CONSUMER: "Khách hàng",
  DRIVER: "Tài xế",
  MERCHANT: "Nhà hàng",
};

const SEVERITY_BADGE: Record<string, string> = {
  LOW: "bg-gray-100 text-gray-600",
  MEDIUM: "bg-amber-100 text-amber-700",
  HIGH: "bg-orange-100 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

/** Nhãn tiếng Việt cho mức độ — trước đây panel in thẳng `LOW`/`CRITICAL`. */
const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  CRITICAL: "Nghiêm trọng",
};

/** Kết luận của máy đếm món (code chấm, không phải model tự phán). */
const INVENTORY_VERDICT_LABEL: Record<string, string> = {
  MATCH: "✅ đủ món",
  MISSING: "❌ thiếu món",
  EXTRA: "➕ thừa món",
  UNCLEAR: "❔ chưa rõ",
};

/** Code có tự duyệt/tự bác được không — admin biết mức độ tin của kết luận máy. */
const MATCH_DECISION_LABEL: Record<string, string> = {
  AUTO_APPROVE: "✅ code tự duyệt",
  AUTO_REJECT: "❌ code tự bác",
  NEEDS_REVIEW: "👀 cần admin xem",
};

const IMAGE_SUPPORT_LABEL: Record<string, string> = {
  SUPPORTS: "✅ Ủng hộ khiếu nại",
  CONTRADICTS: "⚠️ Mâu thuẫn với khiếu nại",
  NEUTRAL: "➖ Chưa kết luận được",
  NO_IMAGE: "— Không có ảnh",
};

const IMAGE_SUPPORT_TONE: Record<string, string> = {
  SUPPORTS: "bg-green-50 text-green-700",
  CONTRADICTS: "bg-red-50 text-red-700",
  NEUTRAL: "bg-gray-50 text-gray-600",
  NO_IMAGE: "bg-gray-50 text-gray-500",
};

/**
 * Tiêu đề banner chẩn đoán ảnh theo từng trạng thái.
 *
 * `OK`/`NO_IMAGES` không hiện banner (không có gì để báo).
 */
const IMAGE_READ_TITLE: Partial<Record<AiImageReadStatus, string>> = {
  VISION_OVERLOADED: "⏳ Model đọc ảnh đang quá tải — chưa phân tích được ảnh",
  VISION_DISABLED: "⚠️ Chưa bật model đọc ảnh",
  VISION_ERROR: "⚠️ Model đọc ảnh lỗi — chưa phân tích được ảnh",
  DOWNLOAD_FAILED: "⚠️ Không tải được ảnh bằng chứng để gửi AI",
};

const IMAGE_READ_TONE: Partial<Record<AiImageReadStatus, string>> = {
  VISION_OVERLOADED: "bg-amber-50 border-amber-200 text-amber-800",
  DOWNLOAD_FAILED: "bg-red-50 border-red-200 text-red-700",
  VISION_DISABLED: "bg-orange-50 border-orange-200 text-orange-800",
  VISION_ERROR: "bg-orange-50 border-orange-200 text-orange-800",
};

/** AI chạy nền khi khiếu nại được tạo — chờ bao lâu thì ngừng hỏi lại. */
const POLL_INTERVAL_MS = 8000;
// Auto-analysis giờ chạy 2 lượt (đọc ảnh → suy luận) nên chờ tối đa ~5 phút.
const POLL_MAX_ATTEMPTS = 40;

type LoadState = "loading" | "ready" | "error";

/**
 * Khối trợ lý AI của một vụ việc.
 *
 * Luồng mới (admin chỉ đọc & duyệt): khi khiếu nại được tạo, backend tự cho AI
 * phân tích và lưu lại; panel này đọc bản đã lưu, nếu AI còn đang chạy thì tự
 * chờ (poll) — admin không phải bấm gì, chỉ bấm khi muốn phân tích lại.
 *
 * Vẫn giữ nguyên tắc human-in-the-loop: AI chỉ đề xuất, admin duyệt/bỏ qua, và
 * vẫn là người ban hành phán quyết ở các khối bên dưới.
 */
export default function CaseAiAssistant({ caseId }: { caseId: string }) {
  const [health, setHealth] = useState<AssistantHealth | null>(null);
  const [healthState, setHealthState] = useState<LoadState>("loading");
  const [record, setRecord] = useState<CaseAiAnalysisRecord | null>(null);
  const [analysisState, setAnalysisState] = useState<LoadState>("loading");
  /** AI đang phân tích nền (chưa có bản lưu) ⇒ hiển thị trạng thái chờ. */
  const [autoRunning, setAutoRunning] = useState(false);
  const [context, setContext] = useState<CaseAiContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  /** Kết quả sau khi duyệt: đã áp dụng phán quyết/hình phạt/thông báo gì. */
  const [outcome, setOutcome] = useState<AiDecisionOutcome | null>(null);
  const [error, setError] = useState("");
  /** Chẩn đoán lần tự phân tích gần nhất (backend giữ trong RAM). */
  const [auto, setAuto] = useState<CaseAiAutoStatus | null>(null);
  const pollRef = useRef<number | null>(null);

  const canAnalyze =
    healthState === "ready" && !!health?.enabled && !!health?.hasApiKey;

  useEffect(() => {
    let alive = true;
    resolutionApi
      .assistantHealth()
      .then((res) => {
        if (!alive) return;
        setHealth(res?.data ?? null);
        setHealthState("ready");
      })
      .catch(() => {
        if (!alive) return;
        setHealth(null);
        setHealthState("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadStored = useCallback(async () => {
    const res = await resolutionApi.getCaseAiAnalysis(caseId);
    // Trạng thái lần tự phân tích gần nhất: nói rõ vì sao chưa có bản phân tích.
    setAuto(res?.auto ?? null);
    return res?.data ?? null;
  }, [caseId]);

  /**
   * Đọc bản phân tích đã lưu. Chưa có ⇒ nếu AI đang bật thì chờ (poll) vì backend
   * vừa cho AI chạy nền lúc khiếu nại được tạo.
   */
  useEffect(() => {
    let alive = true;

    const stopPolling = () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    stopPolling();
    setRecord(null);
    setError("");
    setOutcome(null);
    setAutoRunning(false);
    setAnalysisState("loading");

    loadStored()
      .then((data) => {
        if (!alive) return;
        setRecord(data);
        setAnalysisState("ready");
        if (data || !canAnalyze || !health?.autoAnalyze) return;

        setAutoRunning(true);
        let attempts = 0;
        pollRef.current = window.setInterval(async () => {
          attempts += 1;
          try {
            const next = await loadStored();
            if (!alive) return;
            if (next) {
              setRecord(next);
              setAutoRunning(false);
              stopPolling();
            } else if (attempts >= POLL_MAX_ATTEMPTS) {
              setAutoRunning(false);
              stopPolling();
            }
          } catch {
            if (!alive) return;
            setAutoRunning(false);
            stopPolling();
          }
        }, POLL_INTERVAL_MS);
      })
      .catch((e: any) => {
        if (!alive) return;
        setAnalysisState("error");
        setError(e?.message || "Không đọc được bản phân tích AI");
      });

    return () => {
      alive = false;
      stopPolling();
    };
  }, [caseId, loadStored, canAnalyze, health?.autoAnalyze]);

  const runAnalysis = useCallback(async () => {
    setManualLoading(true);
    setError("");
    try {
      await resolutionApi.analyzeCase(caseId, {});
      const stored = await loadStored();
      setRecord(stored);
      setAnalysisState("ready");
      setAutoRunning(false);
    } catch (e: any) {
      setError(e?.message || "Không gọi được trợ lý AI");
    } finally {
      setManualLoading(false);
    }
  }, [caseId, loadStored]);

  const submitReview = useCallback(
    async (decision: "ACCEPTED" | "REJECTED") => {
      setReviewing(true);
      setError("");
      setOutcome(null);
      try {
        const res = await resolutionApi.reviewCaseAiAnalysis(caseId, {
          decision,
          note: reviewNote.trim() || undefined,
        });
        const result = res?.data ?? null;
        if (result?.analysis) setRecord(result.analysis);
        if (result?.outcome) setOutcome(result.outcome);
        setReviewNote("");
      } catch (e: any) {
        setError(e?.message || "Không lưu được quyết định duyệt");
      } finally {
        setReviewing(false);
      }
    },
    [caseId, reviewNote],
  );

  const loadContext = useCallback(async () => {
    if (context) {
      setContext(null);
      return;
    }
    setContextLoading(true);
    setError("");
    try {
      const res = await resolutionApi.getCaseAiContext(caseId);
      setContext(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || "Không tải được dữ liệu ngữ cảnh");
    } finally {
      setContextLoading(false);
    }
  }, [caseId, context]);

  /**
   * Nạp ngữ cảnh AI nhận đúng MỘT lần, chỉ khi admin cần xem ảnh gốc.
   *
   * Không gọi sẵn khi mở panel: endpoint này dựng lại toàn bộ ngữ cảnh (đọc ảnh,
   * đếm token) — không tốn token model nhưng vẫn là một request nặng, và phần
   * lớn lượt xem chỉ cần đọc kết luận.
   */
  const ensureContext = useCallback(async () => {
    if (context || contextLoading) return;
    setContextLoading(true);
    try {
      const res = await resolutionApi.getCaseAiContext(caseId);
      setContext(res?.data ?? null);
    } catch {
      // Im lặng: khối ảnh vẫn hiển thị được số đếm ảnh từ bản phân tích.
    } finally {
      setContextLoading(false);
    }
  }, [caseId, context, contextLoading]);

  return (
    <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-indigo-700 uppercase">
            🤖 Trợ lý AI điều tra
          </p>
          <p className="text-[11px] text-gray-500">
            AI đọc hồ sơ &amp; đề xuất — admin xem qua rồi duyệt.
            {health?.model ? ` · ${health.provider}/${health.model}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadContext}
            disabled={contextLoading}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {contextLoading
              ? "Đang tải..."
              : context
                ? "Ẩn dữ liệu AI nhận"
                : "Xem dữ liệu AI nhận"}
          </button>
          <button
            onClick={runAnalysis}
            disabled={manualLoading || !canAnalyze}
            title={
              canAnalyze
                ? "Chạy lại phân tích cho vụ việc này"
                : "Cần bật AI_ASSISTANT_ENABLED=true và key của provider"
            }
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {manualLoading ? "⏳ Đang phân tích..." : "↻ Phân tích lại"}
          </button>
        </div>
      </div>

      {healthState === "loading" && (
        <p className="text-[11px] text-gray-500">Đang kiểm tra cấu hình...</p>
      )}

      {healthState === "error" && (
        <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
          Không đọc được cấu hình trợ lý AI — kiểm tra resolution-service rồi
          tải lại trang.
        </p>
      )}

      {healthState === "ready" && !health?.enabled && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
          Trợ lý AI đang tắt: cần đặt <b>AI_ASSISTANT_ENABLED=true</b> cho
          resolution-service.
        </p>
      )}

      {healthState === "ready" && health?.enabled && !health?.hasApiKey && (
        <p className="text-[11px] text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
          Thiếu <b>{health?.apiKeyEnv ?? "API key"}</b> cho provider{" "}
          <b>{health?.provider ?? "—"}</b> — thêm biến này vào <code>.env</code>{" "}
          rồi khởi động lại resolution-service (Docker:{" "}
          <code>docker compose up -d --force-recreate resolution-service</code>
          ).
        </p>
      )}

      {error && (
        <p className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1">
          ⚠️ {error}
        </p>
      )}

      {outcome && (
        <div
          className={`text-[11px] rounded-lg border px-2 py-1 ${
            outcome.applied
              ? "text-green-700 bg-green-50 border-green-100"
              : "text-gray-600 bg-gray-50 border-gray-100"
          }`}
        >
          {outcome.applied ? "✅ " : "ℹ️ "}
          {outcome.summary}
          {outcome.caseStatus
            ? ` · Trạng thái vụ việc: ${outcome.caseStatus}`
            : ""}
          {outcome.evidenceRequestedFrom.length > 0
            ? ` · Đã yêu cầu bổ sung: ${outcome.evidenceRequestedFrom
                .map((p) =>
                  p === "REPORTER" ? "khách hàng" : "tài xế/nhà hàng",
                )
                .join(", ")}`
            : ""}
        </div>
      )}

      {context && <ContextViewer context={context} />}

      {analysisState === "loading" && !record && (
        <p className="text-[11px] text-gray-500">Đang đọc kết quả AI...</p>
      )}

      {autoRunning && !record && (
        <div className="bg-white rounded-xl border border-indigo-100 p-3 space-y-2">
          <div className="h-2 w-1/3 bg-gray-100 rounded animate-pulse" />
          <div className="h-2 w-4/5 bg-gray-100 rounded animate-pulse" />
          <p className="text-[11px] text-indigo-700">
            AI đang tự phân tích vụ việc này (chạy nền từ lúc khiếu nại được
            tạo): đọc ảnh bằng chứng trước, rồi đối chiếu với món đã đặt. Panel
            tự cập nhật khi xong — thường 1–2 phút.
          </p>
        </div>
      )}

      {!autoRunning && analysisState === "ready" && !record && (
        <div className="text-[11px] text-gray-600 bg-white border border-gray-100 rounded-lg px-2 py-1 space-y-1">
          <p>
            Chưa có bản phân tích nào cho vụ việc này.
            {auto?.status === "RUNNING"
              ? " AI đang phân tích (chạy nền) — chờ thêm rồi tải lại."
              : auto?.status === "FAILED"
                ? " Lượt tự phân tích gần nhất bị lỗi — bấm “Phân tích lại”."
                : health?.autoAnalyze
                  ? canAnalyze
                    ? " AI sẽ tự phân tích khi có khiếu nại mới, hoặc bấm “Phân tích lại”."
                    : " Bật trợ lý AI để phân tích."
                  : " Tự phân tích đang tắt (AI_AUTO_ANALYZE=false) — bấm “Phân tích lại”."}
          </p>
          {auto?.detail && auto.status !== "PENDING" && (
            <p
              className={
                auto.status === "FAILED" ? "text-red-600" : "text-amber-700"
              }
            >
              {auto.status === "FAILED" ? "Lỗi: " : "Ghi chú: "}
              {auto.detail}
              {auto.attemptedAt
                ? ` · lúc ${formatDateTime(auto.attemptedAt)}`
                : ""}
            </p>
          )}
        </div>
      )}

      {record && (
        <>
          {record.stale && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
              ⏳ Vụ việc có <b>cập nhật mới sau bản phân tích này</b> (phản
              hồi/bằng chứng bổ sung của một bên) — bấm <b>“↻ Phân tích lại”</b>{" "}
              để AI đọc phần mới.
            </p>
          )}
          <AnalysisCard
            record={record}
            context={context}
            contextLoading={contextLoading}
            reviewing={reviewing}
            reviewNote={reviewNote}
            onReviewNoteChange={setReviewNote}
            onApprove={() => submitReview("ACCEPTED")}
            onReject={() => submitReview("REJECTED")}
            onRetry={runAnalysis}
            onNeedContext={ensureContext}
          />
        </>
      )}
    </div>
  );
}

/**
 * Thẻ kết quả AI — bám đúng mẫu phản hồi ngắn mà admin cần đọc:
 * kết quả + độ tự tin → tóm tắt nhanh → phát hiện chính → thiếu bằng chứng →
 * rủi ro → yêu cầu bổ sung (khách/tài xế) → ghi chú phán quyết → duyệt/bỏ qua.
 */
function AnalysisCard({
  record,
  context,
  contextLoading,
  reviewing,
  reviewNote,
  onReviewNoteChange,
  onApprove,
  onReject,
  onRetry,
  onNeedContext,
}: {
  record: CaseAiAnalysisRecord;
  context?: CaseAiContext | null;
  contextLoading?: boolean;
  reviewing: boolean;
  reviewNote: string;
  onReviewNoteChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
  /** Bấm "Phân tích lại" ngay trong cảnh báo (ảnh quá tải / model lỗi). */
  onRetry?: () => void;
  /** Nạp ngữ cảnh AI nhận khi admin muốn xem ảnh gốc (không tốn token). */
  onNeedContext?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedQuestion, setCopiedQuestion] = useState<string | null>(null);
  /** Ảnh đang xem lớn — không cần thư viện lightbox cho một panel nội bộ. */
  const [zoom, setZoom] = useState<{ url: string; label: string } | null>(null);
  const suggestion: CaseAiSuggestion = record.suggestion;
  const review = record.review;
  const confidence = Math.round((Number(suggestion.confidence) || 0) * 100);
  const lowConfidence =
    suggestion.suggestedVerdict === "INCONCLUSIVE" || confidence < 50;
  /**
   * Bản phân tích cũ (tạo trước khi có mục ảnh) không có dữ liệu ảnh ⇒ phải nói
   * rõ là "không có dữ liệu", không được hiển thị nhầm thành "không có ảnh".
   */
  const hasImageData =
    !!suggestion.reporterImages && !!suggestion.respondentImages;
  /** Bản cũ gộp chung ảnh hai bên (trước khi tách theo bên). */
  const legacyImageAnalysis: string = (suggestion as any).imageAnalysis ?? "";
  /**
   * Vì sao ảnh giao hàng **có trên hệ thống** nhưng không được gửi cho model
   * (404, quá dung lượng, content-type không phải ảnh…).
   *
   * Trước đây panel chỉ nói "Ảnh có nhưng chưa gửi được cho AI" mà không nêu
   * lý do, admin không biết ảnh hỏng hay do giới hạn gửi model. Lý do lấy từ
   * `context.imageSkipReasons` do backend ghi lại khi tải ảnh.
   */
  const proofPhotoUrl = suggestion.deliveryProof?.photoUrl ?? "";
  const proofSkipReason =
    !suggestion.deliveryProof?.analyzed && proofPhotoUrl
      ? (context?.imageSkipReasons?.find((item) => item.url === proofPhotoUrl)
          ?.reason ?? "")
      : "";

  const copyNote = useCallback(async () => {
    const text = suggestion.suggestedResolutionNote ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [suggestion.suggestedResolutionNote]);

  /**
   * URL ảnh gốc của hai bên: bản phân tích **không** mang URL ảnh khách/quán,
   * chỉ có số đếm. URL thật nằm trong ngữ cảnh AI nhận (`case.evidence` /
   * `case.respondentEvidence`) — nên chỉ hiện thumbnail khi admin đã nạp ngữ cảnh.
   */
  const reporterPhotoUrls = (context?.case?.evidence ?? []).filter((url) =>
    /^https?:\/\//i.test(url),
  );
  const respondentPhotoUrls = (context?.case?.respondentEvidence ?? []).filter(
    (url) => /^https?:\/\//i.test(url),
  );

  const copyQuestion = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedQuestion(text);
      window.setTimeout(() => setCopiedQuestion(null), 2000);
    } catch {
      setCopiedQuestion(null);
    }
  }, []);

  /**
   * Gom MỌI cảnh báo về một khối đặt **trước** phần duyệt.
   *
   * Trước đây chúng rải ở 6 nơi (chẩn đoán ảnh, độ tự tin, bản ghi cũ, ảnh giao
   * hàng thiếu lý do, `warnings` bị chôn trong mục kỹ thuật, thiếu nguồn dữ liệu)
   * nên admin có thể bấm duyệt mà không thấy cảnh báo nào.
   */
  const alerts: {
    key: string;
    tone: string;
    text: string;
    retry?: boolean;
  }[] = [];

  const diagnostics = suggestion.imageDiagnostics;
  if (
    diagnostics &&
    diagnostics.status !== "OK" &&
    diagnostics.status !== "NO_IMAGES"
  ) {
    alerts.push({
      key: "image-read",
      tone:
        IMAGE_READ_TONE[diagnostics.status] ??
        "bg-amber-50 border-amber-200 text-amber-800",
      text: [
        IMAGE_READ_TITLE[diagnostics.status] ?? "Chưa đọc được ảnh bằng chứng",
        `${diagnostics.attached} ảnh đã gửi · model đọc được ${diagnostics.analyzed}`,
        diagnostics.detail,
        diagnostics.hint,
      ]
        .filter(Boolean)
        .join(" · "),
      retry:
        diagnostics.status === "VISION_OVERLOADED" ||
        diagnostics.status === "VISION_ERROR",
    });
  }

  if (lowConfidence) {
    alerts.push({
      key: "confidence",
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text:
        suggestion.suggestedVerdict === "INCONCLUSIVE"
          ? "AI chưa đủ căn cứ để kết luận — nên bổ sung bằng chứng bên dưới trước khi phán quyết."
          : "AI đã kết luận nhưng độ tự tin thấp — nên đối chiếu ảnh và dữ liệu hệ thống trước khi duyệt.",
    });
  }

  if (!hasImageData) {
    alerts.push({
      key: "legacy",
      tone: "bg-gray-50 border-gray-200 text-gray-600",
      text: legacyImageAnalysis
        ? `Bản phân tích này gộp chung ảnh hai bên (bản cũ): ${legacyImageAnalysis} — bấm “↻ Phân tích lại” để tách riêng từng bên.`
        : "Bản phân tích này được tạo trước khi có mục phân tích ảnh nên không có dữ liệu ảnh — bấm “↻ Phân tích lại”.",
    });
  }

  if (proofPhotoUrl && !suggestion.deliveryProof?.analyzed) {
    alerts.push({
      key: "proof",
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text: `Ảnh giao hàng có trên hệ thống nhưng chưa gửi được cho AI${
        proofSkipReason ? ` (lý do: ${proofSkipReason})` : ""
      }.`,
    });
  }

  if (
    hasImageData &&
    suggestion.reporterImages.attached > 0 &&
    suggestion.reporterImages.analyzed === 0
  ) {
    alerts.push({
      key: "reporter-images",
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text: `Khách gửi ${suggestion.reporterImages.attached} ảnh nhưng model chưa đọc được ảnh nào — kết luận về ảnh của khách đang trống.`,
    });
  }

  if (
    context?.imagesAvailable &&
    (context.imagesAvailable.reporter ?? 0) === 0
  ) {
    alerts.push({
      key: "no-evidence",
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text: "Bên khiếu nại không có ảnh bằng chứng nào trong vụ việc — AI chỉ có lời khai và dữ liệu hệ thống.",
    });
  }

  if (suggestion.evidenceWeight?.reporterSelfContradiction) {
    alerts.push({
      key: "self-contradiction",
      tone: "bg-red-50 border-red-200 text-red-700",
      text: "Ảnh của bên khiếu nại mâu thuẫn với lời khai của chính họ.",
    });
  }

  for (const [index, warning] of (suggestion.warnings ?? []).entries()) {
    alerts.push({
      key: `warning-${index}`,
      tone: "bg-amber-50 border-amber-200 text-amber-800",
      text: warning,
    });
  }

  if ((suggestion.sourcesMissing ?? []).length > 0) {
    alerts.push({
      key: "sources-missing",
      tone: "bg-gray-50 border-gray-200 text-gray-600",
      text: `Thiếu ${suggestion.sourcesMissing.length} nguồn dữ liệu: ${suggestion.sourcesMissing
        .slice(0, 3)
        .join("; ")}${suggestion.sourcesMissing.length > 3 ? "…" : ""}`,
    });
  }

  return (
    <div className="bg-white rounded-xl border border-indigo-100 p-3 space-y-3">
      {/* ❶ KẾT LUẬN — gộp 4 ô rời thành một khối: đọc một chỗ là biết AI kết
          luận gì, bên nào có lỗi, mức độ nào, vì sao (trước đây là 4 ô ngang
          hàng nhau nên không có trọng tâm). */}
      <Section step={1} icon="⚖️" title="Kết luận của AI">
        <div
          className={`rounded-xl px-3 py-2 ${
            VERDICT_TONE[suggestion.suggestedVerdict] ||
            "bg-gray-100 text-gray-600"
          }`}
        >
          <p className="text-[15px] font-bold leading-snug">
            {VERDICT_LABEL[suggestion.suggestedVerdict] ||
              suggestion.suggestedVerdict}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Chip tone="bg-white/70 text-gray-700">
              Bên có lỗi:{" "}
              <b>
                {FAULT_LABEL[suggestion.suggestedFaultParty] ||
                  "Không xác định"}
              </b>
            </Chip>
            <Chip
              tone={
                SEVERITY_BADGE[suggestion.suggestedSeverity] ||
                "bg-gray-100 text-gray-600"
              }
            >
              Mức độ:{" "}
              <b>
                {SEVERITY_LABEL[suggestion.suggestedSeverity] ||
                  suggestion.suggestedSeverity}
              </b>
            </Chip>
            <Chip tone="bg-white/70 text-gray-700">
              Độ tự tin <b>{confidence}%</b>
            </Chip>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70">
            <div
              className={`h-1.5 rounded-full ${
                confidence >= 70
                  ? "bg-green-500"
                  : confidence >= 40
                    ? "bg-amber-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, confidence))}%` }}
            />
          </div>
          {suggestion.summary && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-gray-700">
              <span className="font-semibold">Vì sao AI kết luận vậy:</span>{" "}
              {suggestion.summary}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-500">
          <Chip tone="bg-gray-50 text-gray-500">
            {record.source === "AUTO"
              ? "AI tự phân tích"
              : "Admin bấm phân tích"}
          </Chip>
          <span>
            {suggestion.model} · {formatDateTime(record.createdAt)}
          </span>
          {suggestion.imagesAnalyzed > 0 && (
            <span>· đã đọc {suggestion.imagesAnalyzed} ảnh</span>
          )}
        </div>
      </Section>

      {/* ⚠️ CẢNH BÁO — một khối duy nhất, đặt ngay dưới kết luận và TRƯỚC phần
          duyệt: admin không thể bấm duyệt mà không thấy lý do nên chậm lại. */}
      {alerts.length > 0 && (
        <Section icon="⚠️" title="Cần biết trước khi duyệt">
          <div className="space-y-1">
            {alerts.map((alert) => (
              <p
                key={alert.key}
                className={`rounded-lg border px-2 py-1 text-[11.5px] leading-relaxed ${alert.tone}`}
              >
                {alert.text}
              </p>
            ))}
            {alerts.some((alert) => alert.retry) && onRetry && (
              <button
                onClick={onRetry}
                className="text-[11px] font-semibold text-indigo-600 hover:underline"
              >
                ↻ Phân tích lại ngay
              </button>
            )}
          </div>
        </Section>
      )}

      {/* (Độ mạnh bằng chứng chuyển xuống ❸ Đối chiếu hai bên; tóm tắt chuyển
          lên ❶ Kết luận — trước đây hai khối này nằm giữa panel nên admin đọc
          "kết luận" rồi bị ngắt mạch trước khi tới phần ảnh.) */}

      {/* ❷ ẢNH AI ĐÃ ĐỌC — gộp ảnh giao hàng + ảnh hai bên thành MỘT khối, mỗi
          bên một hàng, ảnh bấm được để xem lớn. */}
      {(hasImageData || !!suggestion.deliveryProof?.photoUrl) && (
        <Section
          step={2}
          icon="📷"
          title="Ảnh AI đã đọc"
          hint={
            suggestion.imagesAnalyzed > 0
              ? `${suggestion.imagesAnalyzed} ảnh đã gửi model`
              : undefined
          }
        >
          <div className="space-y-1.5">
            {suggestion.deliveryProof?.photoUrl && (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-2 py-1">
                <div className="flex items-start gap-2">
                  <EvidenceThumb
                    url={suggestion.deliveryProof.photoUrl}
                    label="Ảnh giao hàng của tài xế"
                    onZoom={() =>
                      setZoom({
                        url: suggestion.deliveryProof.photoUrl as string,
                        label:
                          "Ảnh giao hàng của tài xế (chụp ngay trước khi bấm giao thành công)",
                      })
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-0.5 text-[11.5px] leading-relaxed text-gray-700">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold">
                        Tài xế · ảnh giao hàng
                      </span>
                      <Chip
                        tone={
                          suggestion.deliveryProof.analyzed
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }
                      >
                        {suggestion.deliveryProof.analyzed
                          ? "AI đã đọc"
                          : "chưa gửi được AI"}
                      </Chip>
                      {suggestion.deliveryProof.analyzed &&
                        suggestion.deliveryProof.matchesOrder && (
                          <Chip
                            tone={
                              suggestion.deliveryProof.matchesOrder === "MATCH"
                                ? "bg-green-100 text-green-700"
                                : suggestion.deliveryProof.matchesOrder ===
                                    "MISMATCH"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-gray-100 text-gray-600"
                            }
                          >
                            {suggestion.deliveryProof.matchesOrder === "MATCH"
                              ? "ảnh khớp món đã đặt"
                              : suggestion.deliveryProof.matchesOrder ===
                                  "MISMATCH"
                                ? "ảnh KHÔNG khớp món đã đặt"
                                : "chưa xác định khớp món"}
                          </Chip>
                        )}
                    </div>
                    {suggestion.deliveryProof.itemsSeen && (
                      <p>
                        <b>Nhìn thấy:</b> {suggestion.deliveryProof.itemsSeen}
                      </p>
                    )}
                    {suggestion.deliveryProof.analysis && (
                      <p className="text-gray-600">
                        {suggestion.deliveryProof.analysis}
                      </p>
                    )}
                    {proofSkipReason && (
                      <p className="text-[10px] text-amber-700">
                        Lý do chưa gửi AI: {proofSkipReason}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {hasImageData && (
              <>
                <SideImageBlock
                  label="Khách hàng · ảnh khiếu nại"
                  data={suggestion.reporterImages}
                  urls={reporterPhotoUrls}
                  analyzedUrls={context?.reporterImageUrls}
                  skipReasons={context?.imageSkipReasons}
                  onZoom={(url, label) => setZoom({ url, label })}
                />
                <SideImageBlock
                  label="Bên bị khiếu nại · ảnh phản hồi"
                  data={suggestion.respondentImages}
                  urls={respondentPhotoUrls}
                  analyzedUrls={context?.respondentImageUrls}
                  skipReasons={context?.imageSkipReasons}
                  onZoom={(url, label) => setZoom({ url, label })}
                />
              </>
            )}

            {(suggestion.menuImagesAnalyzed ?? 0) > 0 && (
              <p className="text-[11px] text-gray-600">
                🍽️ Đã gửi <b>{suggestion.menuImagesAnalyzed}</b> ảnh chuẩn món
                từ thực đơn để đối chiếu với ảnh khách chụp.
              </p>
            )}

            {!context && onNeedContext && (
              <button
                onClick={onNeedContext}
                disabled={contextLoading}
                className="text-[11px] font-semibold text-indigo-600 hover:underline disabled:opacity-50"
              >
                {contextLoading
                  ? "Đang tải ảnh gốc..."
                  : "🖼️ Tải ảnh gốc AI đã nhận (không tốn token)"}
              </button>
            )}
          </div>
        </Section>
      )}

      {/* ❸ ĐỐI CHIẾU & CĂN CỨ — lời khai vs ảnh của hai bên, kèm độ mạnh bằng
          chứng (chuyển từ đầu panel xuống đây vì đây mới là phần "căn cứ"). */}
      <Section step={3} icon="⚖️" title="Đối chiếu & căn cứ kết luận">
        {suggestion.sideComparison && (
          <p className="text-[12.5px] leading-relaxed text-gray-700">
            {suggestion.sideComparison}
          </p>
        )}

        {suggestion.evidenceWeight && (
          <div>
            <div className="flex items-center justify-between text-[11px] text-gray-500">
              <span className="font-semibold uppercase tracking-wide">
                Độ mạnh bằng chứng
              </span>
              <span>
                khách quan {suggestion.evidenceWeight.objective}% · lời khai{" "}
                {suggestion.evidenceWeight.testimony}%
              </span>
            </div>
            <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="bg-emerald-500"
                style={{ width: `${suggestion.evidenceWeight.images}%` }}
                title={`Ảnh ${suggestion.evidenceWeight.images}%`}
              />
              <div
                className="bg-sky-500"
                style={{ width: `${suggestion.evidenceWeight.system}%` }}
                title={`Dữ liệu hệ thống ${suggestion.evidenceWeight.system}%`}
              />
              <div
                className="bg-gray-300"
                style={{ width: `${suggestion.evidenceWeight.testimony}%` }}
                title={`Lời khai ${suggestion.evidenceWeight.testimony}%`}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-gray-500">
              Ảnh {suggestion.evidenceWeight.images}% · Dữ liệu hệ thống{" "}
              {suggestion.evidenceWeight.system}% · Lời khai{" "}
              {suggestion.evidenceWeight.testimony}% —{" "}
              {suggestion.evidenceWeight.objective >= 50
                ? "đủ căn cứ kết luận (ảnh + hệ thống ≥ 50%)"
                : "còn thiếu bằng chứng khách quan"}
            </p>
          </div>
        )}

        {/* Khối ghép cặp ảnh: chỉ hiện khi backend trả `pairComparison`/`imageMatch`. */}
        <PairComparisonBlock
          pairComparison={suggestion.pairComparison}
          imageMatch={suggestion.imageMatch}
        />

        <div className="space-y-1">
          <Bullets
            title="Phát hiện chính"
            items={suggestion.keyFindings}
            tone="text-green-600"
          />
          <Bullets
            title="Thiếu bằng chứng"
            items={suggestion.evidenceGaps}
            tone="text-amber-600"
          />
          <Bullets
            title="Dấu hiệu rủi ro"
            items={suggestion.riskFlags}
            tone="text-red-600"
          />
        </div>
      </Section>

      {/* ❹ VIỆC ADMIN NÊN LÀM — hình phạt đề xuất + yêu cầu bổ sung, đặt NGAY
          TRƯỚC nút duyệt vì đây chính là thứ được áp dụng khi bấm duyệt. */}
      <Section step={4} icon="🛠️" title="Việc admin nên làm">
        {(suggestion.suggestedActions ?? []).length > 0 && (
          <div className="space-y-1">
            {suggestion.suggestedActions.map((action, index) => (
              <p
                key={index}
                className="rounded-lg bg-indigo-50/60 px-2 py-1 text-[12px] leading-relaxed text-gray-700"
              >
                <span className="font-semibold">
                  {ACTION_LABEL[action.type] || action.type}
                </span>{" "}
                → {TARGET_LABEL[action.targetType] || action.targetType}
                {action.amount ? ` · ${formatVnd(action.amount)}` : ""}
                {action.durationDays ? ` · ${action.durationDays} ngày` : ""}
                <span className="text-[11px] text-gray-500">
                  {" "}
                  — {action.reason}
                </span>
              </p>
            ))}
          </div>
        )}

        {(suggestion.followUpQuestions.length > 0 ||
          suggestion.respondentQuestions.length > 0) && (
          <div className="space-y-1.5">
            <QuestionList
              title="Yêu cầu bổ sung · Khách hàng"
              items={suggestion.followUpQuestions}
              copiedQuestion={copiedQuestion}
              onCopy={copyQuestion}
            />
            <QuestionList
              title="Yêu cầu bổ sung · Bên bị khiếu nại"
              items={suggestion.respondentQuestions}
              copiedQuestion={copiedQuestion}
              onCopy={copyQuestion}
            />
          </div>
        )}
      </Section>

      {((suggestion.detailedFindings?.length ?? 0) > 0 ||
        (suggestion.contradictions?.length ?? 0) > 0 ||
        (suggestion.whatWouldChangeVerdict?.length ?? 0) > 0 ||
        (suggestion.sourceAssessment?.length ?? 0) > 0 ||
        (suggestion.timelineHighlights?.length ?? 0) > 0) && (
        <details className="text-[12px] text-gray-600">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            🔧 Lý luận chi tiết của AI (nguồn &amp; mốc thời gian)
          </summary>
          <div className="mt-2 space-y-2">
            {(suggestion.detailedFindings?.length ?? 0) > 0 && (
              <div className="space-y-1">
                {suggestion.detailedFindings!.map((finding, index) => (
                  <div
                    key={`finding-${index}`}
                    className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1"
                  >
                    <p>
                      <b>{finding.signal}</b>{" "}
                      <span className="text-[10px] text-gray-400">
                        [{finding.source} · {finding.weight}]
                      </span>
                    </p>
                    <p>{finding.facts}</p>
                    <p className="text-gray-500">{finding.interpretation}</p>
                  </div>
                ))}
              </div>
            )}
            {(suggestion.contradictions?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase text-gray-400">
                  Mâu thuẫn
                </p>
                <ul className="list-disc pl-4">
                  {suggestion.contradictions!.map((item, index) => (
                    <li key={`contradiction-${index}`}>
                      <b>{item.between}</b>: {item.detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(suggestion.whatWouldChangeVerdict?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase text-gray-400">
                  Dữ liệu có thể lật kết luận
                </p>
                <ul className="list-disc pl-4">
                  {suggestion.whatWouldChangeVerdict!.map((item, index) => (
                    <li key={`change-${index}`}>
                      {item.missingData} → {item.couldChangeTo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(suggestion.timelineHighlights?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase text-gray-400">
                  Mốc quan trọng
                </p>
                <ul className="list-disc pl-4">
                  {suggestion.timelineHighlights!.map((item, index) => (
                    <li key={`time-${index}`}>
                      {formatDateTime(item.at)} · [{item.source}] {item.event}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(suggestion.sourceAssessment?.length ?? 0) > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase text-gray-400">
                  Đánh giá nguồn dữ liệu
                </p>
                <ul className="list-disc pl-4">
                  {suggestion.sourceAssessment!.map((item, index) => (
                    <li key={`source-${index}`}>
                      <b>{item.sourceId}</b> · {item.status}: {item.note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      )}

      <details className="text-[11px] text-gray-500">
        <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          🔧 Nguồn dữ liệu &amp; thông số kỹ thuật (món, PII, token)
        </summary>
        <div className="mt-1 space-y-1">
          {context?.menuItems && context.menuItems.length > 0 && (
            <div>
              <p className="font-semibold text-indigo-600">Món &amp; giá</p>
              <ul className="list-disc pl-4">
                {context.menuItems.map((item, index) => (
                  <li key={`menu-${index}`}>
                    {item.name} ×{item.orderedQuantity}: thực đơn{" "}
                    {formatVnd(item.price ?? 0)} · đơn{" "}
                    {formatVnd(item.orderUnitPrice ?? 0)}
                    {item.priceMismatch ? " · ⚠ lệch giá" : ""}
                    {item.isAvailable === false ? " · hết hàng" : ""}
                    {item.imageUrl ? " · có ảnh chuẩn" : " · không có ảnh"}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {context?.imagesAvailable && (
            <p>
              <span className="font-semibold text-indigo-600">Ảnh có sẵn:</span>{" "}
              proof {context.imagesAvailable.deliveryProof ?? 0} · món{" "}
              {context.imagesAvailable.menuReference ?? 0} · khách{" "}
              {context.imagesAvailable.reporter ?? 0} · quán{" "}
              {context.imagesAvailable.respondent ?? 0} · review{" "}
              {context.imagesAvailable.review ?? 0}
              {context.imagesAttached === 0
                ? " (chưa tải — bấm “Xem ngữ cảnh”/“Phân tích lại” để gửi cho AI)"
                : ` · đã gửi ${context.imagesAttached}`}
            </p>
          )}
          {context?.imagePlan &&
            (context.imagesAvailable?.reporter ?? 0) === 0 && (
              <p className="text-amber-600">
                ⚠ Bên khiếu nại không có ảnh bằng chứng nào (không có URL
                http(s) trong vụ việc).
              </p>
            )}
          {context?.imagePlan && (
            <p>
              <span className="font-semibold text-indigo-600">Ảnh đã gửi:</span>{" "}
              proof {context.imagePlan.deliveryProof ?? 0} · món{" "}
              {context.imagePlan.menuReference ?? 0} · khách{" "}
              {context.imagePlan.reporter ?? 0} · quán{" "}
              {context.imagePlan.respondent ?? 0} · review{" "}
              {context.imagePlan.review ?? 0}
            </p>
          )}
          {context?.imagePlan &&
            (context.imagePlan.menuReference ?? 0) === 0 &&
            (context.menuItems ?? []).some((item) => !!item.imageUrl) && (
              <p className="text-red-500">
                ⚠ Chưa gửi được ảnh chuẩn món — xem cảnh báo phía trên.
              </p>
            )}
          {context?.pii && (
            <p>
              <span className="font-semibold text-indigo-600">Ẩn danh:</span>{" "}
              {context.pii.redactedFields} trường PII · mode {context.pii.mode}{" "}
              · {context.pii.pseudonymizedIds} ID giả danh
            </p>
          )}
          {context?.contextStats && (
            <p>
              Ngữ cảnh: ~{context.contextStats.estimatedTokens} token · GPS{" "}
              {context.contextStats.gpsPoints} điểm · ảnh{" "}
              {context.imagesAttached}
            </p>
          )}
          <p>
            <span className="font-semibold text-green-600">Đã dùng:</span>{" "}
            {(suggestion.sourcesUsed ?? []).join("; ") || "—"}
          </p>
          <p>
            <span className="font-semibold text-red-500">Còn thiếu:</span>{" "}
            {(suggestion.sourcesMissing ?? []).join("; ") || "—"}
          </p>
          {(suggestion.warnings ?? []).length > 0 && (
            <p>
              <span className="font-semibold text-amber-600">Cảnh báo:</span>{" "}
              {suggestion.warnings.join(" | ")}
            </p>
          )}
          <p>
            Tokens: {suggestion.usage?.totalTokens ?? "n/a"} (prompt{" "}
            {suggestion.usage?.promptTokens ?? "n/a"} · output{" "}
            {suggestion.usage?.outputTokens ?? "n/a"})
          </p>
        </div>
      </details>

      {/* ❺ GHI CHÚ & DUYỆT — nằm CUỐI panel: nút duyệt là bước cuối của đường đọc
          ❶→❺, và thanh duyệt dính đáy drawer nên admin cuộn tới đâu vẫn bấm được. */}
      <Section step={5} icon="✅" title="Ghi chú & duyệt">
        {suggestion.suggestedResolutionNote && (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Ghi chú phán quyết đề xuất
              </p>
              <button
                onClick={copyNote}
                className="text-[11px] text-indigo-600 hover:underline"
              >
                {copied ? "Đã sao chép ✓" : "Sao chép"}
              </button>
            </div>
            <p className="text-[12.5px] leading-relaxed text-gray-700">
              {suggestion.suggestedResolutionNote}
            </p>
          </div>
        )}
      </Section>

      {/* Admin duyệt / bỏ qua: ghi vết ai đã xem gợi ý, lúc nào. */}
      <div className="sticky bottom-0 z-10 -mx-3 space-y-2 border-t border-indigo-100 bg-white/95 px-3 py-2 backdrop-blur">
        {review ? (
          <p className="rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 text-[11.5px] text-gray-600">
            {review.decision === "ACCEPTED" ? "✅ Đã duyệt" : "✖️ Đã bỏ qua"}{" "}
            bởi <b>{review.by}</b> lúc {formatDateTime(review.at)}
            {review.note ? ` — “${review.note}”` : ""}
          </p>
        ) : (
          <>
            <input
              value={reviewNote}
              onChange={(e) => onReviewNoteChange(e.target.value)}
              placeholder="Ghi chú khi duyệt (không bắt buộc)"
              className="w-full rounded-lg border border-gray-200 px-2 py-1 text-[11.5px]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onApprove}
                disabled={reviewing}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
              >
                {reviewing ? "Đang lưu..." : "✅ Duyệt & áp dụng"}
              </button>
              <button
                onClick={onReject}
                disabled={reviewing}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                ✖️ Bỏ qua
              </button>
              <span className="text-[11px] leading-snug text-gray-500">
                Duyệt = áp dụng <b>phán quyết + hình phạt</b> của AI vào vụ việc
                và thông báo cho các bên (bên thiếu bằng chứng sẽ được yêu cầu
                bổ sung).
              </span>
            </div>
          </>
        )}
      </div>

      {/* Xem ảnh lớn: render cuối card nhưng dùng `fixed` nên không chiếm chỗ. */}
      {zoom && <Lightbox item={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

/**
 * Một khối trong đường đọc ❶→❺ của panel.
 *
 * Panel trước đây là ~15 khối ngang hàng nhau (cùng cỡ tiêu đề, cùng khoảng cách)
 * nên admin không biết đọc đâu trước. Giờ mỗi khối có số thứ tự, tiêu đề 11px
 * in hoa và nội dung 11.5–12.5px — mắt đi theo đúng một đường.
 */
function Section({
  step,
  icon,
  title,
  hint,
  children,
}: {
  /** Số thứ tự hiển thị; bỏ trống cho khối không nằm trong dãy ❶→❺ (cảnh báo). */
  step?: number;
  icon: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-baseline gap-1.5">
        {step !== undefined && (
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
            {step}
          </span>
        )}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          {icon} {title}
        </p>
        {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Nhãn trạng thái dùng chung — một cỡ chữ, một bo góc cho cả panel. */
function Chip({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

/**
 * Ảnh bằng chứng bấm được để xem lớn.
 *
 * Trước đây panel chỉ hiện ảnh giao hàng (16px vuông, không bấm được) và **không**
 * hiện ảnh khách/quán — admin phải mở tab khác để tự đối chiếu.
 */
function EvidenceThumb({
  url,
  label,
  note,
  onZoom,
}: {
  url: string;
  label: string;
  /** Nhãn nhỏ phủ đáy ảnh: "đã đọc" / "bỏ qua" ... */
  note?: string;
  onZoom?: () => void;
}) {
  const shell =
    "relative block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-gray-200";
  const content = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="h-14 w-14 object-cover" />
      {note && (
        <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-[9px] leading-tight text-white">
          {note}
        </span>
      )}
    </>
  );

  if (!onZoom) return <span className={shell}>{content}</span>;

  return (
    <button
      type="button"
      onClick={onZoom}
      title={`Bấm để xem lớn: ${label}`}
      className={`${shell} focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400`}
    >
      {content}
    </button>
  );
}

/**
 * Xem ảnh lớn: Esc hoặc bấm nền để đóng.
 *
 * Dùng `role="dialog"` + `aria-modal` vì panel nằm trong drawer — trình đọc màn
 * hình cần biết tiêu điểm đã chuyển sang ảnh.
 */
function Lightbox({
  item,
  onClose,
}: {
  item: { url: string; label: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-black/80 p-4"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt={item.label}
        className="max-h-[80vh] max-w-full rounded-lg object-contain"
      />
      <p className="max-w-full break-all text-center text-[11px] text-white/85">
        {item.label}
      </p>
      <p className="text-[10px] text-white/60">
        Bấm ra ngoài hoặc nhấn Esc để đóng
      </p>
    </div>
  );
}

/** Khối ảnh bằng chứng của MỘT bên: nhãn, badge, số ảnh, thumbnail, nhận xét. */
function SideImageBlock({
  label,
  data,
  urls,
  analyzedUrls,
  skipReasons,
  onZoom,
}: {
  label: string;
  data: AiSideImageAnalysis;
  /**
   * URL ảnh gốc của bên này (lấy từ ngữ cảnh AI nhận). Rỗng ⇒ chỉ hiện số đếm —
   * bản phân tích không mang URL nên phải chờ admin nạp ngữ cảnh.
   */
  urls?: string[];
  /** URL thực sự đã gửi cho model ⇒ gắn nhãn "đã đọc" trên thumbnail. */
  analyzedUrls?: string[];
  /** Ảnh có nhưng bị bỏ qua khi gửi model (quá dung lượng / tải lỗi...). */
  skipReasons?: { url: string; reason: string }[];
  onZoom?: (url: string, label: string) => void;
}) {
  const tone = IMAGE_SUPPORT_TONE[data.support] ?? "bg-gray-50 text-gray-600";
  const photos = (urls ?? []).slice(0, 8);

  return (
    <div className="rounded-lg border border-gray-100 bg-white px-2 py-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11.5px] font-semibold text-gray-700">
          {label}
        </span>
        <Chip tone={tone}>
          {IMAGE_SUPPORT_LABEL[data.support] ?? data.support}
        </Chip>
        <span className="text-[10px] text-gray-500">
          {data.analyzed > 0
            ? `${data.analyzed}/${data.attached} ảnh đã gửi AI`
            : data.attached > 0
              ? `${data.attached} ảnh đã gửi nhưng model chưa đọc`
              : "không có ảnh"}
        </span>
      </div>

      {photos.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {photos.map((url, index) => {
            const analyzed = (analyzedUrls ?? []).includes(url);
            const skip = skipReasons?.find((item) => item.url === url)?.reason;
            const photoLabel = `${label} — ảnh ${index + 1}${
              skip ? ` (bỏ qua: ${skip})` : ""
            }`;
            return (
              <EvidenceThumb
                key={`${label}-${index}`}
                url={url}
                label={photoLabel}
                note={analyzed ? "đã đọc" : skip ? "bỏ qua" : undefined}
                onZoom={onZoom ? () => onZoom(url, photoLabel) : undefined}
              />
            );
          })}
        </div>
      )}

      <p className="mt-0.5 text-[11.5px] leading-relaxed text-gray-700">
        {data.analysis}
      </p>
      {photos.length > 0 && !analyzedUrls && (
        <p className="text-[10px] text-gray-500">
          Chưa có danh sách ảnh đã gửi model — bấm “🖼️ Tải ảnh gốc” ở trên rồi
          phân tích lại để biết ảnh nào AI đã đọc.
        </p>
      )}
    </div>
  );
}

/**
 * Câu hỏi cần gửi cho MỘT bên, kèm nút sao chép từng câu.
 *
 * Admin thường copy từng câu sang Zalo/hộp thư để hỏi khách, nên sao chép một
 * phát cả khối là không dùng được.
 */
function QuestionList({
  title,
  items,
  copiedQuestion,
  onCopy,
}: {
  title: string;
  items: string[];
  copiedQuestion: string | null;
  onCopy: (text: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {title}
      </p>
      <ol className="list-decimal space-y-0.5 pl-4 text-[11.5px] leading-relaxed text-gray-700">
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>
            {item}
            <button
              onClick={() => onCopy(item)}
              className="ml-1 text-[10px] font-semibold text-indigo-600 hover:underline"
            >
              {copiedQuestion === item ? "đã chép ✓" : "chép"}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * 🔗 GHÉP CẶP ẢNH [thực đơn] ↔ [khách chụp] — do **code** tổng hợp, không phải
 * model tự phán, nên admin đọc thẳng "thiếu món nào, mấy phần".
 *
 * Tự ẩn khi backend chưa trả `pairComparison`/`imageMatch` (hiện bước merge của
 * assistant-service lọc mất hai trường này) — bật lại ở backend là panel hiện
 * ngay, không phải sửa UI.
 */
function PairComparisonBlock({
  pairComparison,
  imageMatch,
}: {
  pairComparison?: CaseAiSuggestion["pairComparison"];
  imageMatch?: CaseAiSuggestion["imageMatch"];
}) {
  const matches = imageMatch ?? [];
  if (!pairComparison && matches.length === 0) return null;

  const pairs = pairComparison?.pairs ?? 0;
  const readable = pairComparison?.readable ?? 0;
  const wrongItems = pairComparison?.wrongItems ?? [];
  const missingPairs = pairComparison?.missingPairs ?? [];
  const details = pairComparison?.details ?? [];

  return (
    <details className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-2 py-1 text-[11.5px] leading-relaxed text-gray-700">
      <summary className="cursor-pointer font-semibold text-indigo-700">
        🔗 Ghép cặp ảnh thực đơn ↔ ảnh khách chụp
        {pairComparison ? ` (${readable}/${pairs} cặp đọc được)` : ""}
      </summary>
      <div className="mt-1 space-y-1">
        {pairComparison && pairComparison.similarityAvg != null && (
          <p>
            Điểm giống trung bình: <b>{pairComparison.similarityAvg}%</b>
            {pairComparison.canOverride
              ? " · code được phép lật kết luận của AI"
              : " · chưa đủ rõ để lật kết luận của AI"}
          </p>
        )}
        {wrongItems.length > 0 && (
          <p className="text-red-700">Nhận sai món: {wrongItems.join(", ")}</p>
        )}
        {missingPairs.length > 0 && (
          <p className="text-amber-700">
            Không ghép được cặp ảnh cho: {missingPairs.join(", ")}
          </p>
        )}

        {matches.map((item, index) => (
          <div
            key={`match-${item.side}-${index}`}
            className="rounded-md border border-gray-100 bg-white px-1.5 py-1"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <b>
                {item.side === "DELIVERY_PROOF"
                  ? "Ảnh giao hàng"
                  : "Ảnh khách chụp"}
              </b>
              <Chip
                tone={
                  item.verdict === "MATCH"
                    ? "bg-green-100 text-green-700"
                    : item.verdict === "MISSING"
                      ? "bg-red-100 text-red-700"
                      : item.verdict === "EXTRA"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                }
              >
                {INVENTORY_VERDICT_LABEL[item.verdict] ?? item.verdict}
              </Chip>
              <Chip tone="bg-gray-100 text-gray-600">
                {MATCH_DECISION_LABEL[item.decision] ?? item.decision}
              </Chip>
              <span className="text-[10px] text-gray-500">
                khớp {item.matchedQuantity}/{item.totalQuantity} phần
                {item.matchScore != null ? ` · điểm ${item.matchScore}%` : ""}
                {item.pairCount != null && item.pairsTotal != null
                  ? ` · ${item.pairCount}/${item.pairsTotal} cặp`
                  : ""}
              </span>
            </div>
            <p>{item.reason}</p>
            {item.missingText && (
              <p className="text-amber-700">Thiếu: {item.missingText}</p>
            )}
            {item.extraText && (
              <p className="text-sky-700">Thừa: {item.extraText}</p>
            )}
            {item.wrongItemsText && (
              <p className="text-red-700">Sai món: {item.wrongItemsText}</p>
            )}
            {item.refundCap != null && (
              <p className="text-[10px] text-gray-500">
                Trần hoàn đề xuất: {formatVnd(item.refundCap)}
              </p>
            )}
          </div>
        ))}

        {details.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-4 text-[11px]">
            {details.map((detail) => (
              <li key={detail.orderItemId}>
                {detail.name}: đặt {detail.orderedQuantity} · thấy{" "}
                {detail.quantitySeen}
                {detail.sameDish ? "" : " · khác món"}
                {detail.similarityPercent != null
                  ? ` · giống ${detail.similarityPercent}%`
                  : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}

/** Danh sách nguồn dữ liệu AI đã đọc, làm nổi bật nguồn trọng yếu bị thiếu. */
function ContextViewer({ context }: { context: CaseAiContext }) {
  const sources = context.sources ?? [];
  const available = sources.filter((s) => s.available).length;
  const critical = context.criticalMissingSourceIds ?? [];

  return (
    <div className="bg-white rounded-lg border border-gray-100 p-2 space-y-1 max-h-64 overflow-y-auto">
      <p className="text-[11px] font-semibold text-gray-400 uppercase">
        Nguồn dữ liệu ({available}/{sources.length} khả dụng ·{" "}
        {context.imagesAttached} ảnh đã gửi
        {context.imagesAvailable
          ? ` · khách ${context.imagesAvailable.reporter ?? 0} · quán ${context.imagesAvailable.respondent ?? 0} ảnh có sẵn`
          : ""}
        {critical.length > 0
          ? ` · thiếu ${critical.length} nguồn trọng yếu`
          : ""}
        )
      </p>
      {sources.map((source) => {
        const isCritical = critical.includes(source.id);
        return (
          <p key={source.id} className="text-[11px] text-gray-600">
            <span
              className={
                source.available
                  ? "text-green-600 font-semibold"
                  : isCritical
                    ? "text-red-600 font-semibold"
                    : "text-gray-400"
              }
            >
              {source.available ? "CÓ" : isCritical ? "THIẾU⚠" : "KHÔNG"}
            </span>{" "}
            {source.id} · {source.name}
            {source.detail ? ` — ${source.detail}` : ""}
          </p>
        );
      })}
      {context.imagesSkipped?.length > 0 && (
        <div className="text-[11px] text-amber-600 space-y-0.5">
          <p>
            Ảnh không gửi kèm: {context.imagesSkipped.length} (quá giới hạn, quá
            dung lượng hoặc tải lỗi)
          </p>
          {(context.imageSkipReasons ?? []).slice(0, 3).map((item) => (
            <p key={item.url} className="text-[10px] text-amber-700 break-all">
              • {item.url} — {item.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Danh sách gạch đầu dòng ngắn — mỗi mục đã được backend giới hạn độ dài. */
function Bullets({
  title,
  items,
  tone,
  numbered,
}: {
  title: string;
  items?: string[];
  tone: string;
  numbered?: boolean;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${tone}`}
      >
        {title}
      </p>
      <ul
        className={`ml-4 text-[12px] text-gray-700 space-y-0.5 ${
          numbered ? "list-decimal" : "list-disc"
        }`}
      >
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
