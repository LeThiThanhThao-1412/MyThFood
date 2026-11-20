/**
 * Giá flash sale server trả về cho một món (promotion-service).
 */
export interface FlashSalePricingInfo {
  /** Giá gốc (giá thường) của món. */
  originalPrice: number;
  /** Giá flash sale. */
  salePrice: number;
  /** Nguồn tài trợ: MERCHANT | PLATFORM | null. */
  fundedBy: string | null;
  /** Số phần được hưởng giá flash sale (đã giới hạn theo limitPerUser + tồn). */
  saleQuantity: number;
}

export interface FlashSaleLineInput {
  quantity: number;
  unitPrice: number;
}

export interface FlashSaleLineSplit {
  quantity: number;
  unitPrice: number;
  /** Giá gốc — chỉ set cho dòng được hưởng giá sale (dùng cho hóa đơn/settlement). */
  originalPrice: number | null;
  flashSaleFundedBy: string | null;
}

/**
 * Tách một món trong đơn thành tối đa 2 dòng:
 * - `saleQuantity` phần đầu được hưởng giá flash sale;
 * - phần còn lại (`quantity - saleQuantity`) tính theo giá thường.
 *
 * Nhờ vậy khách không bị chặn đặt hàng khi vượt giới hạn "x suất/khách" mà chỉ
 * mất ưu đãi cho phần vượt. Khi món không có flash sale (server không trả về
 * giá) thì giữ nguyên giá client gửi; khi khách đã hết suất / flash sale hết
 * suất thì tính toàn bộ theo giá gốc do server trả về.
 */
export function splitFlashSaleLines(
  item: FlashSaleLineInput,
  pricing?: FlashSalePricingInfo | null,
): FlashSaleLineSplit[] {
  // Không có flash sale → giữ nguyên giá client gửi (giá thường).
  if (!pricing) {
    return [
      {
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        originalPrice: null,
        flashSaleFundedBy: null,
      },
    ];
  }

  const saleQuantity = Math.max(
    0,
    Math.min(item.quantity, pricing.saleQuantity ?? 0),
  );

  // Có flash sale nhưng khách đã hết suất / flash sale hết suất → giá thường
  // (giá gốc do server biết), không tin giá sale client gửi.
  if (saleQuantity <= 0) {
    return [
      {
        quantity: item.quantity,
        unitPrice: pricing.originalPrice,
        originalPrice: null,
        flashSaleFundedBy: null,
      },
    ];
  }

  const lines: FlashSaleLineSplit[] = [
    {
      quantity: saleQuantity,
      unitPrice: pricing.salePrice,
      originalPrice: pricing.originalPrice,
      flashSaleFundedBy: pricing.fundedBy,
    },
  ];

  const regularQuantity = item.quantity - saleQuantity;
  if (regularQuantity > 0) {
    lines.push({
      quantity: regularQuantity,
      // Phần vượt giới hạn tính theo giá gốc (giá thường).
      unitPrice: pricing.originalPrice,
      originalPrice: null,
      flashSaleFundedBy: null,
    });
  }

  return lines;
}
