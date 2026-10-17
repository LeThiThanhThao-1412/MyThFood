import { readFileSync } from "fs";
import { join } from "path";
import PDFDocument from "pdfkit";
import type { Order } from "../domain/order.aggregate";

// Font Arial được bundle qua nest-cli `assets` -> dist/assets/fonts/arial.ttf
const FONT_PATH = join(__dirname, "../../../assets/fonts/arial.ttf");

const ORANGE = "#ff6b35";
const DARK = "#1a1a2e";
const GRAY = "#666666";
const LIGHT = "#999999";

function moneyPdf(value: unknown): string {
  return `${Number(value || 0).toLocaleString("vi-VN")} đ`;
}

export interface InvoiceAdjustment {
  created_at: Date | string;
  before_total: number | string;
  after_total: number | string;
  delta_amount: number | string;
  money_status: string;
  before_items?: unknown;
  after_items?: unknown;
}

const MONEY_STATUS_LABELS: Record<string, string> = {
  NONE: "Không phát sinh",
  NOT_REQUIRED: "Không cần thu/hoàn",
  CHARGED: "Đã thu khoản chênh lệch",
  REFUNDED: "Đã hoàn vào ví khách",
  FAILED: "Hoàn tiền lỗi - cần đối soát",
  AWAITING_PAYMENT: "Chờ khách thanh toán",
};

function summarizeInvoiceItems(
  beforeItems: unknown,
  afterItems: unknown,
): { removed: string; added: string } {
  const toCount = (value: unknown): Map<string, number> => {
    const map = new Map<string, number>();
    if (!Array.isArray(value)) return map;
    for (const raw of value as Array<Record<string, unknown>>) {
      const name = String(raw?.name ?? "");
      if (!name) continue;
      const qty = Number(raw?.quantity ?? 0);
      map.set(name, (map.get(name) ?? 0) + qty);
    }
    return map;
  };

  const before = toCount(beforeItems);
  const after = toCount(afterItems);
  const removed: string[] = [];
  const added: string[] = [];

  for (const [name, qty] of before) {
    const diff = qty - (after.get(name) ?? 0);
    if (diff > 0) removed.push(`${name} ×${diff}`);
  }
  for (const [name, qty] of after) {
    const diff = qty - (before.get(name) ?? 0);
    if (diff > 0) added.push(`${name} ×${diff}`);
  }

  return { removed: removed.join(", "), added: added.join(", ") };
}

export function buildInvoicePdf(
  order: Order,
  merchant: any | null,
  createdAt: Date | null,
  adjustments: InvoiceAdjustment[] = [],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 45, bottom: 45, left: 45, right: 45 },
      bufferPages: true,
      info: { Title: `Hoa don ${order.id.toString().slice(0, 8)}` },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let font: Buffer;
    try {
      font = readFileSync(FONT_PATH);
    } catch (err) {
      reject(err);
      return;
    }
    doc.registerFont("VNI", font);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    const orderTypeLabel =
      order.orderTypeValue === "PICKUP" ? "Lấy tại quán" : "Giao hàng tận nơi";
    const paymentLabel =
      order.orderPaymentMethod === "CREDIT_CARD"
        ? "Thẻ tín dụng"
        : order.orderPaymentMethod === "WALLET"
          ? "Ví điện tử"
          : "Tiền mặt (COD)";
    const createdAtLabel = createdAt
      ? createdAt.toLocaleString("vi-VN")
      : order.createdAt.toLocaleString("vi-VN");

    // ---------- Header ----------
    doc.font("VNI");
    doc
      .fillColor(ORANGE)
      .fontSize(19)
      .text(merchant?.name || "Nhà hàng", left, 45, { width, ellipsis: true });
    let y = doc.y + 4;
    doc
      .fillColor(GRAY)
      .fontSize(9)
      .text(merchant?.address || "", left, y, { width });
    y = doc.y + 2;
    if (merchant?.phone) {
      doc
        .fillColor(GRAY)
        .fontSize(9)
        .text(`Điện thoại: ${merchant.phone}`, left, y, { width });
      y = doc.y + 2;
    }

    y += 10;
    doc
      .fillColor(DARK)
      .fontSize(15)
      .text("HÓA ĐƠN BÁN HÀNG", left, y, { width, align: "center" });
    y = doc.y + 6;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(1)
      .strokeColor("#e5e5e5")
      .stroke();
    y += 14;

    // ---------- Order info ----------
    const info: [string, string][] = [
      ["Mã đơn hàng", `#${order.id.toString()} (v${order.orderItemsVersion})`],
      ["Ngày tạo", createdAtLabel],
      ["Loại đơn", orderTypeLabel],
      ["Thanh toán", paymentLabel],
    ];
    if (order.orderDeliveryAddress) {
      info.push(["Địa chỉ giao", order.orderDeliveryAddress]);
    }
    if (order.orderNotes) {
      info.push(["Ghi chú", order.orderNotes]);
    }

    for (const [key, value] of info) {
      doc.fillColor(GRAY).fontSize(10).text(key, left, y, { width: 150 });
      doc
        .fillColor(DARK)
        .fontSize(10)
        .text(value, left + 150, y, { width: width - 150, align: "right" });
      y += 16;
    }

    y += 6;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(1)
      .strokeColor("#e5e5e5")
      .stroke();
    y += 12;

    // ---------- Items header ----------
    doc
      .fillColor(LIGHT)
      .fontSize(9)
      .text("MÓN ĂN", left, y, { width: width * 0.5 });
    doc.text("SL", left + width * 0.5, y, {
      width: width * 0.1,
      align: "center",
    });
    doc.text("ĐƠN GIÁ", left + width * 0.6, y, {
      width: width * 0.2,
      align: "right",
    });
    doc.text("THÀNH TIỀN", left + width * 0.8, y, {
      width: width * 0.2,
      align: "right",
    });
    y += 14;

    // ---------- Items ----------
    for (const item of order.orderItems) {
      doc
        .fillColor(DARK)
        .fontSize(10)
        .text(item.name, left, y, { width: width * 0.5 });
      doc.text(`${item.quantity}`, left + width * 0.5, y, {
        width: width * 0.1,
        align: "center",
      });
      doc.text(moneyPdf(item.unitPrice), left + width * 0.6, y, {
        width: width * 0.2,
        align: "right",
      });
      doc.text(moneyPdf(item.subtotal), left + width * 0.8, y, {
        width: width * 0.2,
        align: "right",
      });
      y += 15;

      for (const opt of item.options || []) {
        const qty = Number(opt?.quantity || 1);
        const delta = Number(opt?.priceDelta || 0);
        const label = qty > 1 ? `${opt?.name} ×${qty}` : opt?.name;
        const deltaTxt =
          delta !== 0 ? ` (${delta > 0 ? "+" : ""}${moneyPdf(delta)})` : "";
        doc
          .fillColor(LIGHT)
          .fontSize(9)
          .text(`  ↳ ${label}${deltaTxt}`, left, y, { width: width * 0.65 });
        y += 12;
      }
      if (item.specialInstructions) {
        doc
          .fillColor(LIGHT)
          .fontSize(9)
          .text(`  Ghi chú: ${item.specialInstructions}`, left, y, {
            width: width * 0.65,
          });
        y += 12;
      }
    }

    y += 4;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(1)
      .strokeColor("#e5e5e5")
      .stroke();
    y += 12;

    // ---------- Adjustments (điều chỉnh món đã được khách xác nhận) ----------
    if (adjustments.length > 0) {
      doc.fillColor(DARK).fontSize(11).text("ĐIỀU CHỈNH ĐƠN HÀNG", left, y, {
        width,
      });
      y = doc.y + 4;

      adjustments.forEach((adjustment, index) => {
        if (y > doc.page.height - 170) {
          doc.addPage();
          y = doc.page.margins.top;
        }
        const when = new Date(adjustment.created_at).toLocaleString("vi-VN");
        const beforeTotal = Number(adjustment.before_total || 0);
        const afterTotal = Number(adjustment.after_total || 0);
        const delta = Number(adjustment.delta_amount || 0);
        const deltaLabel = `${delta >= 0 ? "+" : "-"}${moneyPdf(Math.abs(delta))}`;

        doc
          .fillColor(GRAY)
          .fontSize(9)
          .text(`#${index + 1} ${when}`, left, y, { width: width * 0.42 });
        doc
          .fillColor(DARK)
          .fontSize(9)
          .text(
            `${moneyPdf(beforeTotal)} → ${moneyPdf(afterTotal)} (${deltaLabel})`,
            left + width * 0.42,
            y,
            { width: width * 0.58, align: "right" },
          );
        y = doc.y + 2;

        const { removed, added } = summarizeInvoiceItems(
          adjustment.before_items,
          adjustment.after_items,
        );
        if (removed) {
          doc
            .fillColor(LIGHT)
            .fontSize(8)
            .text(`  Bỏ: ${removed}`, left, y, { width });
          y = doc.y + 1;
        }
        if (added) {
          doc
            .fillColor(LIGHT)
            .fontSize(8)
            .text(`  Thêm: ${added}`, left, y, { width });
          y = doc.y + 1;
        }
        doc
          .fillColor(LIGHT)
          .fontSize(8)
          .text(
            `  Thanh toán: ${MONEY_STATUS_LABELS[adjustment.money_status] ?? adjustment.money_status}`,
            left,
            y,
            { width },
          );
        y = doc.y + 4;
      });

      y += 4;
      doc
        .moveTo(left, y)
        .lineTo(right, y)
        .lineWidth(1)
        .strokeColor("#e5e5e5")
        .stroke();
      y += 12;
    }

    // ---------- Totals ----------
    // Hóa đơn bán tại quán: chỉ ghi nhận giá món + giảm giá flash sale DO QUÁN TẠO
    // (MERCHANT) + mã giảm của quán. Không ghi phí giao hàng, phí dịch vụ (nền tảng),
    // mã giảm do hệ thống tài trợ hay flash sale do nền tảng tài trợ (PLATFORM).
    let merchantFlashSaleDiscount = 0;
    let shopSubtotal = 0;
    let originalSubtotal = 0;
    for (const item of order.orderItems) {
      const original = Number(item.originalPrice ?? 0);
      const sale = Number(item.unitPrice ?? 0);
      const qty = Number(item.quantity ?? 1);
      if (original <= sale) {
        // Món thường (không flash sale hoặc không có chiết khấu).
        originalSubtotal += sale * qty;
        shopSubtotal += sale * qty;
        continue;
      }
      // Món đang flash sale: xác định nguồn tài trợ (mặc định MERCHANT cho đơn cũ).
      const fundedBy = item.flashSaleFundedBy ?? "MERCHANT";
      originalSubtotal += original * qty;
      if (fundedBy === "MERCHANT") {
        merchantFlashSaleDiscount += (original - sale) * qty;
        shopSubtotal += sale * qty;
      } else {
        // PLATFORM tài trợ: quán vẫn bán đúng giá gốc (nền tảng chịu phần giảm).
        shopSubtotal += original * qty;
      }
    }

    const merchantDiscount =
      order.orderDiscountFundedBy === "MERCHANT"
        ? Number(order.orderDiscount)
        : 0;
    const shopTotal = Math.max(0, shopSubtotal - merchantDiscount);

    const totals: [string, string][] = [];
    if (merchantFlashSaleDiscount > 0) {
      totals.push(["Giá gốc", moneyPdf(originalSubtotal)]);
      totals.push([
        "Giảm giá Flash Sale (quán)",
        `-${moneyPdf(merchantFlashSaleDiscount)}`,
      ]);
    }
    totals.push(["Tạm tính", moneyPdf(shopSubtotal)]);
    if (merchantDiscount > 0) {
      totals.push(["Mã giảm giá của quán", `-${moneyPdf(merchantDiscount)}`]);
    }
    for (const [key, value] of totals) {
      doc.fillColor(GRAY).fontSize(10).text(key, left, y, { width: 150 });
      doc
        .fillColor(DARK)
        .fontSize(10)
        .text(value, left + 150, y, { width: width - 150, align: "right" });
      y += 16;
    }

    y += 2;
    doc
      .moveTo(left, y)
      .lineTo(right, y)
      .lineWidth(1.2)
      .strokeColor(DARK)
      .stroke();
    y += 8;
    doc
      .fillColor(ORANGE)
      .fontSize(13)
      .text("Tổng cộng", left, y, { width: 150 });
    doc.text(moneyPdf(shopTotal), left + 150, y, {
      width: width - 150,
      align: "right",
    });

    // ---------- Footer ----------
    doc
      .fillColor(LIGHT)
      .fontSize(9)
      .text(
        "Cảm ơn quý khách đã đặt hàng. Hẹn gặp lại!",
        left,
        doc.page.height - 70,
        {
          width,
          align: "center",
        },
      );

    doc.end();
  });
}
