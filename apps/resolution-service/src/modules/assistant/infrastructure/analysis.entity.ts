import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from "typeorm";

/**
 * Bản phân tích AI đã lưu cho một vụ việc (mỗi vụ việc giữ **một** bản mới nhất).
 *
 * Có bảng này thì admin mở vụ việc là **đọc được ngay** kết quả AI đã chạy nền
 * lúc khiếu nại được tạo, không phải bấm "Phân tích" rồi chờ 1-2 phút; đồng thời
 * lưu luôn vết duyệt/bỏ qua của admin (`reviewDecision`, `reviewedBy`, ...).
 *
 * Cố ý không FK sang `cases`: vụ việc có thể bị dọn/khởi tạo lại trong lúc dev.
 */
@Entity("case_ai_analyses")
@Index(["caseId"], { unique: true })
export class CaseAiAnalysisEntity {
  @PrimaryColumn({ type: "uuid" })
  id!: string;

  @Column({ type: "uuid" })
  caseId!: string;

  @Column({ type: "varchar", length: 40 })
  caseNumber!: string;

  /** `AUTO` = hệ thống tự chạy khi có khiếu nại mới; `MANUAL` = admin bấm. */
  @Column({ type: "varchar", length: 10 })
  source!: string;

  /** Model thực tế đã trả kết quả. */
  @Column({ type: "varchar", length: 80 })
  model!: string;

  @Column({ type: "varchar", length: 20 })
  verdict!: string;

  @Column({ type: "numeric", precision: 4, scale: 3 })
  confidence!: string;

  /** Toàn bộ `CaseAiSuggestion` (nguồn sự thật để dựng lại UI). */
  @Column({ type: "jsonb" })
  payload!: Record<string, unknown>;

  @Column({ type: "varchar", length: 10, nullable: true })
  reviewDecision!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  reviewedBy!: string | null;

  @Column({ type: "timestamptz", nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: "text", nullable: true })
  reviewNote!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
