/**
 * Chính sách ẩn danh PII cho ngữ cảnh gửi LLM.
 *
 * Nguyên tắc: giữ **dữ liệu nghiệp vụ** (tên món/quán, giá, mã khuyến mãi,
 * rating, nội dung đánh giá đã scrub) và loại bỏ **dữ liệu cá nhân** (tên
 * người, SĐT, email, CCCD, địa chỉ, toạ độ, thông tin thanh toán).
 *
 * Danh sách key được khai báo theo dạng đã chuẩn hoá (bỏ `_`, `-`, khoảng
 * trắng, lowercase) để bắt được cả camelCase lẫn snake_case.
 */

export type PiiMode = "off" | "shadow" | "enforce";

/** Chuẩn hoá tên key: `full_name` / `full-name` / `fullName` → `fullname`. */
export function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, "").toLowerCase();
}

/** Key bị loại bỏ hoàn toàn khỏi ngữ cảnh. */
const BLOCKED_EXACT = new Set<string>([
  "fullname",
  "displayname",
  "username",
  "consumername",
  "customername",
  "drivername",
  "ownername",
  "recipientname",
  "contactname",
  "phone",
  "phonenumber",
  "contactphone",
  "merchantphone",
  "email",
  "merchantemail",
  "avatar",
  "avatars",
  "dateofbirth",
  "dob",
  "gender",
  "idcard",
  "idcardnumber",
  "cccd",
  "cmnd",
  "driverlicense",
  "driverlicensenumber",
  "vehicleregistrationnumber",
  "licenseplate",
  "insurance",
  "insurancenumber",
  "criminalrecordurl",
  "address",
  "addresses",
  "deliveryaddress",
  "pickupaddress",
  "homeaddress",
  "merchantaddress",
  "paymentmethods",
  "paymentmethoddetail",
  "bankaccount",
  "bankaccountnumber",
  "accountnumber",
  "stripepaymentintentid",
  "stripetransfermerchantid",
  "stripetransferdriverid",
  "transactionid",
  "password",
  "passwordhash",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "secret",
  "otp",
  "latitude",
  "longitude",
  "lat",
  "lng",
  "deliverylatitude",
  "deliverylongitude",
  "currentlatitude",
  "currentlongitude",
  "merchantlatitude",
  "merchantlongitude",
  "pickuplatitude",
  "pickuplongitude",
  "ipaddress",
  "deviceid",
]);

const BLOCKED_SUFFIXES = [
  "phone",
  "phonenumber",
  "email",
  "address",
  "addresses",
  "fullname",
  "avatar",
  "dateofbirth",
  "idcardnumber",
  "bankaccount",
  "accountnumber",
  "password",
  "token",
  "secret",
  "apikey",
];

export function isBlockedKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (BLOCKED_EXACT.has(normalized)) return true;
  return BLOCKED_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

/**
 * Key chứa ID người dùng → thay bằng pseudonym ổn định, không đưa UUID thật.
 * `orderId` / `caseId` / `menuItemId`… là mã chứng từ nghiệp vụ nên giữ nguyên.
 */
export function idPrefixForKey(key: string): string | null {
  const normalized = normalizeKey(key);
  if (normalized.endsWith("consumerid") || normalized.endsWith("customerid")) {
    return "KH";
  }
  if (normalized.endsWith("driverid")) return "TX";
  if (normalized.endsWith("merchantid")) return "NH";
  if (
    normalized.endsWith("userid") ||
    normalized === "reporterid" ||
    normalized === "respondentid" ||
    normalized === "actorid" ||
    normalized === "senderid" ||
    normalized === "ownerid" ||
    normalized === "createdby" ||
    normalized === "reviewedby" ||
    normalized === "changedby"
  ) {
    return "ND";
  }
  return null;
}

/**
 * Key mà giá trị KHÔNG được chạy regex PII (mã đơn, UUID, URL ảnh, mã KM…).
 * Tránh việc regex 9–12 chữ số cắt nhầm một phần UUID/mã đơn.
 */
export const NO_TEXT_SCRUB_KEYS = new Set<string>(
  [
    "id",
    "orderid",
    "caseid",
    "menuitemid",
    "promotionid",
    "flashsaleid",
    "flashsaleitemid",
    "reviewid",
    "conversationid",
    "batchid",
    "orderNumber",
    "casenumber",
    "code",
    "url",
    "imageurl",
    "images",
    "photoUrl",
    "deliveryproofphotourl",
    "menuItemName",
  ].map(normalizeKey),
);

/** Mẫu PII trong văn bản tự do (mô tả, chat, đánh giá, ghi chú). */
export const PII_TEXT_PATTERNS: Array<{
  kind: string;
  pattern: RegExp;
  replacement: string;
}> = [
  {
    kind: "email",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    replacement: "[EMAIL_ẨN]",
  },
  {
    kind: "phone",
    pattern: /(?<![\d+])(?:\+84|0)(?:[\s.\-]?\d){9,10}(?!\d)/g,
    replacement: "[SĐT_ẨN]",
  },
  {
    kind: "nationalId",
    pattern: /(?<!\d)\d{12}(?!\d)/g,
    replacement: "[CCCD_ẨN]",
  },
  {
    kind: "bankAccount",
    pattern:
      /(?:stk|số tài khoản|so tai khoan|tài khoản|tai khoan|account)\s*[:#]?\s*\d{8,19}/gi,
    replacement: "[STK_ẨN]",
  },
];
