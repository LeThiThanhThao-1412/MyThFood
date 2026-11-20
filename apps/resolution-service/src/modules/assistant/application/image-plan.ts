import { AiImageKind, CaseImagePlan } from "../domain/assistant.types";

/**
 * Thứ tự gửi ảnh mặc định: bằng chứng trước, ảnh tham chiếu sau.
 *
 * Provider chỉ báo TỔNG số ảnh đã dùng, nên thứ tự này phải được dùng thống
 * nhất ở 3 nơi: tải ảnh (context), prompt ảnh và phân bổ `imagesUsed`
 * (`normalize`). Lệch một nơi là số ảnh "đã đọc" của từng bên sẽ sai.
 */
export const DEFAULT_IMAGE_ORDER: AiImageKind[] = [
  "DELIVERY_PROOF",
  "REPORTER",
  "RESPONDENT",
  "MENU_REFERENCE",
  "REVIEW",
];

/** Với sự cố món ăn: ảnh chuẩn món quan trọng hơn ảnh hai bên. */
export const MENU_FIRST_IMAGE_ORDER: AiImageKind[] = [
  "DELIVERY_PROOF",
  "MENU_REFERENCE",
  "REPORTER",
  "RESPONDENT",
  "REVIEW",
];

export function buildImageOrder(menuFirst: boolean): AiImageKind[] {
  return [...(menuFirst ? MENU_FIRST_IMAGE_ORDER : DEFAULT_IMAGE_ORDER)];
}

const PLAN_KEY: Record<AiImageKind, keyof CaseImagePlan> = {
  DELIVERY_PROOF: "deliveryProof",
  MENU_REFERENCE: "menuReference",
  REPORTER: "reporter",
  RESPONDENT: "respondent",
  REVIEW: "review",
};

/**
 * Phân bổ tổng số ảnh provider báo đã dùng về từng loại, theo đúng thứ tự gửi.
 *
 * Ví dụ: plan proof=1, reporter=2, respondent=2, menu=2; `imagesUsed=4`:
 * - thứ tự mặc định  ⇒ proof 1, reporter 2, respondent 1, menu 0.
 * - thứ tự món trước ⇒ proof 1, menu 2, reporter 1, respondent 0.
 */
export function allocateImagesByKind(
  plan: CaseImagePlan,
  order: AiImageKind[],
  imagesUsed: number,
): Record<AiImageKind, number> {
  const result: Record<AiImageKind, number> = {
    DELIVERY_PROOF: 0,
    MENU_REFERENCE: 0,
    REPORTER: 0,
    RESPONDENT: 0,
    REVIEW: 0,
  };
  let remaining = Math.max(0, Math.trunc(imagesUsed) || 0);
  for (const kind of order) {
    const wanted = Math.max(0, plan[PLAN_KEY[kind]] ?? 0);
    const used = Math.min(wanted, remaining);
    result[kind] = used;
    remaining -= used;
  }
  return result;
}
