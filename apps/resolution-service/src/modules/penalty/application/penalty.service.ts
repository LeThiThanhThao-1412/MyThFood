import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { v4 as uuid } from "uuid";
import {
  PenaltyRepository,
  PenaltyListFilters,
} from "../infrastructure/penalty.repository";
import { Penalty } from "../domain/penalty.aggregate";
import { AppealEntity } from "../infrastructure/appeal.entity";
import { AppealStatus, PenaltyType } from "../domain/penalty.enums";
import { Case } from "../../case/domain/case.aggregate";
import { CaseRepository } from "../../case/infrastructure/case.repository";
import { CaseStatus, Verdict } from "../../case/domain/case.enums";
import {
  IntegrationService,
  SideEffectResult,
} from "../../integration/integration.service";
import {
  AppealPenaltyDto,
  DecideAppealDto,
  IssuePenaltyDto,
} from "./dtos/penalty.dto";

export interface AuthUser {
  userId: string;
  phone?: string;
  roles: string[];
}

@Injectable()
export class PenaltyService {
  constructor(
    private readonly repo: PenaltyRepository,
    private readonly caseRepo: CaseRepository,
    private readonly integration: IntegrationService,
  ) {}

  async issue(dto: IssuePenaltyDto, user: AuthUser) {
    const c = await this.caseRepo.findByIdOrFail(dto.caseId);
    if (
      c.caseStatus !== CaseStatus.RESOLVED ||
      c.caseVerdict !== Verdict.VALID
    ) {
      throw new BadRequestException(
        "Chỉ ban hành hình phạt sau khi vụ việc được phán quyết ✅ hợp lệ (VALID). " +
          "Trên trang Quản lý khiếu nại, mở vụ việc → khung “⚖️ Xử lý vụ việc”: chọn kết luận “Khách đúng”, bật “④ Phạt thêm bên có lỗi” rồi bấm nút chốt để phán quyết và thi hành trong một bước.",
      );
    }

    this.assertValidInput(dto);

    const p = Penalty.create({
      caseId: dto.caseId,
      type: dto.type,
      targetId: dto.targetId,
      targetType: dto.targetType,
      amount: dto.amount ?? null,
      durationDays: dto.durationDays ?? null,
      reason: dto.reason,
    });

    const id = p.id.toString();
    await this.repo.save(p);

    c.addPenaltyId(id);
    await this.caseRepo.save(c);

    return this.executeAndLoad(p, c, user.userId);
  }

  /**
   * Thi hành lại hình phạt đang EXECUTION_FAILED (ví/khoá tài khoản lỗi tạm thời).
   *
   * Dùng lại đúng `penalty.id` nên bút toán ví được dedupe (`referenceId`) —
   * retry không trừ tiền hai lần như khi tạo hình phạt mới.
   */
  async retry(id: string, user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    const c = await this.caseRepo.findByIdOrFail(p.penaltyCaseId);
    try {
      p.retryExecution();
    } catch (err: any) {
      // Lỗi nghiệp vụ phải trả 400 kèm lý do cho admin, không phải 500
      // "Internal server error" như exception domain mặc định.
      throw new BadRequestException(
        "Chỉ hình phạt đang ở trạng thái thi hành lỗi (EXECUTION_FAILED) " +
          `mới thi hành lại được. Chi tiết: ${err?.message ?? err}`,
      );
    }
    await this.repo.save(p);
    return this.executeAndLoad(p, c, user.userId);
  }

  /**
   * Ghi nhận hình phạt cho mục đích hiển thị (không thi hành side-effect),
   * vì tiền đã được route ở order-service.settleFailureMoney.
   */
  async recordPenalty(input: {
    caseId: string;
    type: PenaltyType;
    targetId: string;
    targetType: string;
    amount?: number | null;
    durationDays?: number | null;
    reason: string;
  }): Promise<any> {
    const c = await this.caseRepo.findByIdOrFail(input.caseId);
    const p = Penalty.create({
      caseId: input.caseId,
      type: input.type,
      targetId: input.targetId,
      targetType: input.targetType,
      amount: input.amount ?? null,
      durationDays: input.durationDays ?? null,
      reason: input.reason,
    });
    p.markExecuted("service");
    const id = p.id.toString();
    await this.repo.save(p);
    c.addPenaltyId(id);
    await this.caseRepo.save(c);
    return this.getEntityOrFail(id);
  }

  async list(filters: PenaltyListFilters) {
    return this.repo.findAndCount(filters);
  }

  async get(id: string) {
    return this.getEntityOrFail(id);
  }

  /**
   * Chặn dữ liệu vô nghĩa trước khi ghi hình phạt.
   *
   * Trước đây FINE với `amount` rỗng vẫn được ghi EXECUTED 0đ (không ai bị trừ
   * đồng nào) ⇒ admin tưởng đã phạt. Validate ở đây để lỗi hiện ngay trên UI.
   */
  private assertValidInput(dto: IssuePenaltyDto): void {
    const targetType = String(dto.targetType ?? "").toUpperCase();
    if (!["CONSUMER", "DRIVER", "MERCHANT"].includes(targetType)) {
      throw new BadRequestException(
        "Đối tượng bị phạt phải là khách hàng (CONSUMER), tài xế (DRIVER) hoặc nhà hàng (MERCHANT)",
      );
    }
    if (!dto.reason || !String(dto.reason).trim()) {
      throw new BadRequestException("Cần nêu lý do ban hành hình phạt");
    }

    const amount = Number(dto.amount ?? 0);
    switch (dto.type) {
      case PenaltyType.FINE:
      case PenaltyType.COMPENSATION:
        if (!Number.isFinite(amount) || Math.round(amount) <= 0) {
          throw new BadRequestException(
            "Hình phạt tiền cần số tiền lớn hơn 0 (đơn vị: đồng)",
          );
        }
        break;
      case PenaltyType.SUSPEND:
        if (!dto.durationDays || dto.durationDays < 1) {
          throw new BadRequestException("Hình phạt tạm khoá cần số ngày >= 1");
        }
        break;
      case PenaltyType.REPUTATION_DEDUCTION:
        if (targetType !== "DRIVER") {
          throw new BadRequestException(
            "Chỉ trừ điểm uy tín của tài xế (DRIVER)",
          );
        }
        if (!Number.isFinite(amount) || Math.round(amount) <= 0) {
          throw new BadRequestException("Cần số điểm uy tín cần trừ (> 0)");
        }
        break;
      default:
        break;
    }
  }

  /**
   * Thi hành + trả entity kèm `executionError`.
   *
   * Không throw khi side-effect thất bại: hình phạt đã được ghi (idempotent theo
   * `referenceId`) nên admin thấy đúng trạng thái EXECUTION_FAILED và bấm “Thử
   * lại thi hành”, thay vì tạo hình phạt mới (nguy cơ phạt trùng).
   */
  private async executeAndLoad(p: Penalty, c: Case, appliedBy: string) {
    const outcome = await this.execute(p, c, appliedBy);
    const entity = await this.getEntityOrFail(p.id.toString());
    return { ...entity, executionError: outcome.error };
  }

  private async execute(
    p: Penalty,
    c: Case,
    appliedBy: string,
  ): Promise<{ ok: boolean; error: string | null }> {
    p.markExecuting();
    await this.repo.save(p);

    let failure: string | null = null;
    try {
      failure = await this.applySideEffects(p, c);
    } catch (err: any) {
      failure = err?.message ? String(err.message) : String(err);
    }

    if (failure) {
      p.markExecutionFailed();
      await this.repo.save(p);
      return { ok: false, error: failure };
    }

    p.markExecuted(appliedBy);
    await this.repo.save(p);
    return { ok: true, error: null };
  }

  /**
   * Thi hành hình phạt ở service liên quan.
   *
   * Trả về chuỗi lỗi (null = thành công) thay vì nuốt lỗi: các call ghi dùng
   * `postExpectOk`/`patchExpectOk` nên biết chính xác ví có trừ tiền hay tài
   * khoản có bị khoá không. `referenceId` = id hình phạt để ví dedupe (retry
   * không trừ/hoàn tiền hai lần).
   */
  private async applySideEffects(p: Penalty, c: Case): Promise<string | null> {
    const amount = p.penaltyAmount ?? 0;
    const targetId = p.penaltyTargetId;
    const targetType = p.penaltyTargetType;
    const penaltyId = p.id.toString();
    const ref = { referenceType: "PENALTY", referenceId: penaltyId };
    const failures: string[] = [];

    const collect = async (
      label: string,
      call: Promise<SideEffectResult>,
    ): Promise<void> => {
      const result = await call;
      if (!result.ok) {
        failures.push(`${label}: ${result.error ?? "không rõ lỗi"}`);
      }
    };

    switch (p.penaltyType) {
      case PenaltyType.FINE:
        await collect(
          "Trừ tiền phạt",
          this.integration.debit(
            targetId,
            targetType,
            amount,
            `PENALTY ${penaltyId}: ${p.penaltyReason}`,
            ref,
          ),
        );
        break;
      case PenaltyType.COMPENSATION:
        await collect(
          "Trừ tiền bồi thường",
          this.integration.debit(
            targetId,
            targetType,
            amount,
            `COMPENSATION ${penaltyId}`,
            {
              ...ref,
              // Tiền bồi thường chuyển cho người khiếu nại (credit bên dưới),
              // không cộng thêm vào quỹ nền tảng để tổng tiền không tăng ảo.
              transferToPlatform: false,
            },
          ),
        );
        await collect(
          "Cộng tiền bồi thường",
          this.integration.credit(
            c.caseReporterId,
            c.caseReporterType,
            amount,
            `COMPENSATION ${penaltyId}`,
            ref,
          ),
        );
        break;
      case PenaltyType.SUSPEND:
        if (targetType === "DRIVER") {
          await collect(
            "Tạm khoá tài xế",
            this.integration.suspendDriver(
              targetId,
              p.penaltyDurationDays ?? 7,
              p.penaltyReason,
            ),
          );
        } else if (targetType === "CONSUMER") {
          await collect(
            "Tạm khoá khách hàng",
            this.integration.suspendConsumer(targetId, "SUSPENDED"),
          );
        } else {
          await collect(
            "Tạm khoá nhà hàng",
            this.integration.suspendMerchant(
              targetId,
              p.penaltyDurationDays ?? undefined,
              p.penaltyReason,
            ),
          );
        }
        break;
      case PenaltyType.BAN:
        if (targetType === "DRIVER") {
          await collect(
            "Khoá tài xế",
            this.integration.banDriver(targetId, p.penaltyReason),
          );
        } else if (targetType === "CONSUMER") {
          await collect(
            "Khoá khách hàng",
            this.integration.suspendConsumer(targetId, "BANNED"),
          );
        } else {
          await collect(
            "Khoá nhà hàng",
            this.integration.suspendMerchant(
              targetId,
              undefined,
              p.penaltyReason,
            ),
          );
        }
        break;
      case PenaltyType.REPUTATION_DEDUCTION:
        if (targetType === "DRIVER") {
          await collect(
            "Trừ điểm uy tín",
            this.integration.deductReputation(targetId, Math.round(amount)),
          );
        }
        break;
      case PenaltyType.WARNING:
      case PenaltyType.RESTRICT_ACTIVITY:
        break;
    }

    // Thông báo chỉ là best-effort: không chặn việc thi hành hình phạt.
    void this.integration.notify(
      targetId,
      "Bạn bị xử phạt",
      `${p.penaltyType}: ${p.penaltyReason}`,
    );

    return failures.length > 0 ? failures.join(" · ") : null;
  }

  async appeal(id: string, dto: AppealPenaltyDto, user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    p.appeal();
    await this.repo.save(p);

    const existing = await this.repo.findAppealByPenaltyId(id);
    if (existing) {
      throw new BadRequestException("This penalty has already been appealed");
    }

    const appeal = new AppealEntity();
    appeal.id = uuid();
    appeal.penaltyId = id;
    appeal.appealedBy = user.userId;
    appeal.appealedByType = this.mapRoleToActorType(user.roles);
    appeal.reason = dto.reason;
    appeal.evidence = dto.evidence ?? [];
    appeal.status = AppealStatus.SUBMITTED;
    appeal.deadline = p.penaltyDeadline;
    appeal.decidedBy = null;
    appeal.decidedAt = null;
    await this.repo.saveAppeal(appeal);

    return this.getEntityOrFail(id);
  }

  async decideAppeal(id: string, dto: DecideAppealDto, user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    // Validate + đổi trạng thái trong bộ nhớ TRƯỚC (chưa lưu) để chắc chắn
    // hình phạt đang APPEALED rồi mới đụng tới tiền.
    p.decideAppeal(dto.upheld);

    // Hủy phạt bồi thường ⇒ đảo bút toán. Làm trước khi lưu: ví lỗi thì hình
    // phạt vẫn ở APPEALED để admin bấm lại, và retry không hoàn tiền hai lần
    // (ví dedupe theo `referenceId`).
    if (!dto.upheld && p.penaltyType === PenaltyType.COMPENSATION) {
      await this.reverseCompensation(p);
    }

    await this.repo.save(p);

    const appeal = await this.repo.findAppealByPenaltyId(id);
    if (appeal) {
      appeal.status = dto.upheld
        ? AppealStatus.UPHELD
        : AppealStatus.OVERTURNED;
      appeal.decidedBy = user.userId;
      appeal.decidedAt = new Date();
      await this.repo.saveAppeal(appeal);
    }

    return this.getEntityOrFail(id);
  }

  /**
   * Đảo bút toán của một hình phạt bồi thường bị hủy: hoàn tiền cho bên bị phạt
   * và thu lại phần đã cộng cho người khiếu nại.
   *
   * Dùng `referenceType = PENALTY_REVERSAL` (khác `PENALTY` của lần thi hành)
   * để ví không dedupe nhầm với bút toán gốc; `transferToPlatform: false` để
   * quỹ nền tảng không bị cộng/trừ khi chỉ đảo giữa hai người dùng.
   */
  private async reverseCompensation(p: Penalty): Promise<void> {
    const penaltyId = p.id.toString();
    const amount = p.penaltyAmount ?? 0;
    if (!(amount > 0)) return;

    const c = await this.caseRepo.findByIdOrFail(p.penaltyCaseId);
    const ref = {
      referenceType: "PENALTY_REVERSAL",
      referenceId: penaltyId,
      transferToPlatform: false,
    };

    const [refund, reverse] = await Promise.all([
      this.integration.credit(
        p.penaltyTargetId,
        p.penaltyTargetType,
        amount,
        `OVERTURNED refund ${penaltyId}`,
        ref,
      ),
      this.integration.debit(
        c.caseReporterId,
        c.caseReporterType,
        amount,
        `OVERTURNED reversal ${penaltyId}`,
        ref,
      ),
    ]);

    const failures = [refund, reverse]
      .filter((r) => !r.ok)
      .map((r) => r.error ?? "không rõ lỗi");
    if (failures.length > 0) {
      throw new BadRequestException(
        `Chưa hủy được phạt vì chưa đảo được bút toán ví: ${failures.join(" · ")}. ` +
          "Hình phạt vẫn ở trạng thái APPEALED — bấm lại để thử lại.",
      );
    }
  }

  async waive(id: string, _user: AuthUser) {
    const p = await this.repo.findByIdOrFail(id);
    p.waive();
    await this.repo.save(p);
    return this.getEntityOrFail(id);
  }

  private mapRoleToActorType(roles: string[]): string {
    const r = new Set(roles);
    if (r.has("ADMIN")) return "ADMIN";
    if (r.has("DRIVER")) return "DRIVER";
    if (r.has("MERCHANT_OWNER") || r.has("MERCHANT")) return "MERCHANT";
    return "CONSUMER";
  }

  private async getEntityOrFail(id: string) {
    const entity = await this.repo.findEntityById(id);
    if (!entity) {
      throw new NotFoundException(`Penalty ${id} not found`);
    }
    return entity;
  }
}
