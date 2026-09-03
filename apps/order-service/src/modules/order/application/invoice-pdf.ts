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

export function buildInvoicePdf(
  order: Order,
  merchant: any | null,
  createdAt: Date | null,
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
      .text("HÓA ĐƠN THANH TOÁN", left, y, { width, align: "center" });
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
      ["Mã đơn hàng", `#${order.id.toString()}`],
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
    doc.fillColor(LIGHT).fontSize(9).text("MÓN ĂN", left, y, { width: width * 0.5 });
    doc.text("SL", left + width * 0.5, y, { width: width * 0.1, align: "center" });
    doc.text("ĐƠN GIÁ", left + width * 0.6, y, { width: width * 0.2, align: "right" });
    doc.text("THÀNH TIỀN", left + width * 0.8, y, { width: width * 0.2, align: "right" });
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

    // ---------- Totals ----------
    const totals: [string, string][] = [
      ["Tạm tính", moneyPdf(order.orderSubtotal)],
      ["Phí giao hàng", moneyPdf(order.orderDeliveryFee)],
      ["Phí dịch vụ", moneyPdf(order.orderServiceFee)],
    ];
    if (Number(order.orderDiscount) > 0) {
      totals.push(["Giảm giá", `-${moneyPdf(order.orderDiscount)}`]);
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
    doc.fillColor(ORANGE).fontSize(13).text("Tổng cộng", left, y, { width: 150 });
    doc.text(moneyPdf(order.orderTotalAmount), left + 150, y, {
      width: width - 150,
      align: "right",
    });

    // ---------- Footer ----------
    doc
      .fillColor(LIGHT)
      .fontSize(9)
      .text("Cảm ơn quý khách đã đặt hàng. Hẹn gặp lại!", left, doc.page.height - 70, {
        width,
        align: "center",
      });

    doc.end();
  });
}
