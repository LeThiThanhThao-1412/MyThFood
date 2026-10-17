"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolutionApi } from "@mythfood/api-client";
import type {
  AiDecisionOutcome,
  AiSideImageAnalysis,
  AssistantHealth,
  CaseAiAnalysisRecord,
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

/** AI chạy nền khi khiếu nại được tạo — chờ bao lâu thì ngừng hỏi lại. */
const POLL_INTERVAL_MS = 8000;
const POLL_MAX_ATTEMPTS = 25;

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
            tạo). Panel tự cập nhật khi xong — thường 40–90 giây.
          </p>
        </div>
      )}

      {!autoRunning && analysisState === "ready" && !record && (
        <p className="text-[11px] text-gray-600 bg-white border border-gray-100 rounded-lg px-2 py-1">
          Chưa có bản phân tích nào cho vụ việc này.
          {health?.autoAnalyze
            ? canAnalyze
              ? " AI sẽ tự phân tích khi có khiếu nại mới, hoặc bấm “Phân tích lại”."
              : " Bật trợ lý AI để phân tích."
            : " Tự phân tích đang tắt (AI_AUTO_ANALYZE=false) — bấm “Phân tích lại”."}
        </p>
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
            reviewing={reviewing}
            reviewNote={reviewNote}
            onReviewNoteChange={setReviewNote}
            onApprove={() => submitReview("ACCEPTED")}
            onReject={() => submitReview("REJECTED")}
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
  reviewing,
  reviewNote,
  onReviewNoteChange,
  onApprove,
  onReject,
}: {
  record: CaseAiAnalysisRecord;
  reviewing: boolean;
  reviewNote: string;
  onReviewNoteChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="bg-white rounded-xl border border-indigo-100 p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            VERDICT_TONE[suggestion.suggestedVerdict] ||
            "bg-gray-100 text-gray-600"
          }`}
        >
          {VERDICT_LABEL[suggestion.suggestedVerdict] ||
            suggestion.suggestedVerdict}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
          Lỗi: {FAULT_LABEL[suggestion.suggestedFaultParty] || "—"}
        </span>
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            SEVERITY_BADGE[suggestion.suggestedSeverity] ||
            "bg-gray-100 text-gray-600"
          }`}
        >
          {suggestion.suggestedSeverity}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-600">
          Tự tin {confidence}%
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] bg-gray-50 text-gray-500">
          {record.source === "AUTO" ? "AI tự phân tích" : "Admin bấm phân tích"}
        </span>
        <span className="text-[11px] text-gray-400 ml-auto">
          {suggestion.model} · {formatDateTime(record.createdAt)}
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
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

      {lowConfidence && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
          {suggestion.suggestedVerdict === "INCONCLUSIVE"
            ? "AI chưa đủ căn cứ để kết luận — nên bổ sung bằng chứng bên dưới trước khi phán quyết."
            : "AI đã kết luận nhưng độ tự tin thấp — nên đối chiếu ảnh và dữ liệu hệ thống trước khi duyệt."}
        </p>
      )}

      {suggestion.evidenceWeight && (
        <div>
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span className="font-semibold uppercase text-gray-400">
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
          <p className="mt-0.5 text-[10px] text-gray-400">
            Ảnh {suggestion.evidenceWeight.images}% · Dữ liệu hệ thống{" "}
            {suggestion.evidenceWeight.system}% · Lời khai{" "}
            {suggestion.evidenceWeight.testimony}% —{" "}
            {suggestion.evidenceWeight.objective >= 50
              ? "đủ căn cứ kết luận (ảnh + hệ thống > 50%)"
              : "còn thiếu bằng chứng khách quan"}
          </p>
        </div>
      )}

      {suggestion.summary && (
        <div>
          <p className="text-[11px] font-semibold uppercase text-gray-400">
            Tóm tắt nhanh
          </p>
          <p className="text-[12px] text-gray-700">{suggestion.summary}</p>
        </div>
      )}

      {/* Ảnh giao hàng do tài xế chụp lúc bấm giao thành công (bằng chứng hệ thống) */}
      {suggestion.deliveryProof?.photoUrl && (
        <div>
          <p className="text-[11px] font-semibold uppercase text-gray-400">
            📦 Ảnh giao hàng (hệ thống ghi nhận)
          </p>
          <div className="flex items-start gap-2 bg-blue-50/60 border border-blue-100 rounded-lg px-2 py-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={suggestion.deliveryProof.photoUrl}
              alt="Ảnh giao hàng"
              className="h-16 w-16 rounded-lg object-cover border border-blue-100"
            />
            <div className="text-[11px] text-gray-600 space-y-0.5">
              <p>
                Tài xế chụp ngay trước khi bấm <b>giao hàng thành công</b> —
                dùng làm căn cứ đối chiếu lời khai/ảnh của hai bên.
              </p>
              <p
                className={
                  suggestion.deliveryProof.analyzed
                    ? "text-green-700"
                    : "text-amber-700"
                }
              >
                {suggestion.deliveryProof.analyzed
                  ? "✅ Đã gửi cho AI phân tích"
                  : "⚠️ Ảnh có nhưng chưa gửi được cho AI"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Ảnh bằng chứng: phân tích TÁCH theo từng bên rồi mới kết luận */}
      <div>
        <p className="text-[11px] font-semibold uppercase text-gray-400">
          📷 Phân tích ảnh bằng chứng (tách theo bên)
        </p>
        {hasImageData ? (
          <div className="space-y-2">
            <SideImageBlock
              label="Bên khiếu nại"
              data={suggestion.reporterImages}
            />
            <SideImageBlock
              label="Bên bị khiếu nại"
              data={suggestion.respondentImages}
            />
          </div>
        ) : legacyImageAnalysis ? (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
            Bản phân tích này <b>gộp chung ảnh hai bên</b> (bản cũ):{" "}
            {legacyImageAnalysis} — bấm <b>“↻ Phân tích lại”</b> để tách riêng
            từng bên.
          </p>
        ) : (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
            Bản phân tích này được tạo <b>trước khi có mục phân tích ảnh</b> nên
            không có dữ liệu ảnh — bấm <b>“↻ Phân tích lại”</b>.
          </p>
        )}
      </div>

      {suggestion.sideComparison && (
        <div>
          <p className="text-[11px] font-semibold uppercase text-gray-400">
            ⚖️ So sánh hai bên (căn cứ kết luận)
          </p>
          <p className="text-[12px] text-gray-700">
            {suggestion.sideComparison}
          </p>
        </div>
      )}

      {(suggestion.suggestedActions ?? []).length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase text-gray-400">
            Hình phạt / khắc phục đề xuất
          </p>
          <div className="space-y-1">
            {suggestion.suggestedActions.map((action, index) => (
              <p
                key={index}
                className="text-[12px] text-gray-700 bg-indigo-50/60 rounded-lg px-2 py-1"
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
        </div>
      )}

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

      {(suggestion.followUpQuestions.length > 0 ||
        suggestion.respondentQuestions.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Bullets
            title="Yêu cầu bổ sung · Khách hàng"
            items={suggestion.followUpQuestions}
            tone="text-gray-400"
            numbered
          />
          <Bullets
            title="Yêu cầu bổ sung · Bên bị khiếu nại"
            items={suggestion.respondentQuestions}
            tone="text-gray-400"
            numbered
          />
        </div>
      )}

      {suggestion.suggestedResolutionNote && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase text-gray-400">
              Ghi chú phán quyết đề xuất
            </p>
            <button
              onClick={copyNote}
              className="text-[11px] text-indigo-600 hover:underline"
            >
              {copied ? "Đã sao chép ✓" : "Sao chép"}
            </button>
          </div>
          <p className="text-[12px] text-gray-700">
            {suggestion.suggestedResolutionNote}
          </p>
        </div>
      )}

      {/* Admin duyệt / bỏ qua: ghi vết ai đã xem gợi ý, lúc nào. */}
      <div className="border-t border-gray-100 pt-2 space-y-2">
        {review ? (
          <p className="text-[11px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1">
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
              className="w-full text-[11px] border border-gray-200 rounded-lg px-2 py-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onApprove}
                disabled={reviewing}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {reviewing ? "Đang lưu..." : "✅ Duyệt & áp dụng"}
              </button>
              <button
                onClick={onReject}
                disabled={reviewing}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                ✖️ Bỏ qua
              </button>
              <span className="text-[11px] text-gray-400">
                Duyệt = áp dụng <b>phán quyết + hình phạt</b> của AI vào vụ việc
                và thông báo cho các bên (bên thiếu bằng chứng sẽ được yêu cầu
                bổ sung).
              </span>
            </div>
          </>
        )}
      </div>

      <details className="text-[11px] text-gray-500">
        <summary className="cursor-pointer">
          Nguồn dữ liệu &amp; cảnh báo
        </summary>
        <div className="mt-1 space-y-1">
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
    </div>
  );
}

/** Khối ảnh bằng chứng của MỘT bên (badge + số ảnh + nhận xét). */
function SideImageBlock({
  label,
  data,
}: {
  label: string;
  data: AiSideImageAnalysis;
}) {
  const tone = IMAGE_SUPPORT_TONE[data.support] ?? "bg-gray-50 text-gray-600";
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-2 py-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-600">{label}</span>
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone}`}
        >
          {IMAGE_SUPPORT_LABEL[data.support] ?? data.support}
        </span>
        <span className="text-[10px] text-gray-400">
          {data.analyzed > 0
            ? `${data.analyzed}/${data.attached} ảnh đã gửi AI`
            : data.attached > 0
              ? "0 ảnh gửi AI (bị bỏ)"
              : "không có ảnh"}
        </span>
      </div>
      <p className="text-[12px] text-gray-700">{data.analysis}</p>
    </div>
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
        {context.imagesAttached} ảnh
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
        <p className="text-[11px] text-amber-600">
          Ảnh không gửi kèm: {context.imagesSkipped.length} (quá giới hạn hoặc
          tải lỗi)
        </p>
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
      <p className={`text-[11px] font-semibold uppercase ${tone}`}>{title}</p>
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
