// ============================================================================
// MyThFood - Menu bulk import (parse Excel/CSV -> { categories, items })
// Định dạng "long format": 1 dòng = 1 tùy chọn. Các dòng cùng Tên món được gộp
// thành 1 món; các dòng cùng (Tên món + Nhóm tùy chọn) gộp thành 1 nhóm tùy chọn.
// ============================================================================

export interface MenuImportPayload {
  categories: { name: string; sortOrder: number }[];
  items: any[];
}

interface RawRow {
  danhMuc?: unknown;
  tenMon?: unknown;
  gia?: unknown;
  moTa?: unknown;
  nhomTuyChon?: unknown;
  loaiTuyChon?: unknown;
  tuyChon?: unknown;
  giaTuyChon?: unknown;
  macDinh?: unknown;
}

const HEADER_MAP: Record<string, keyof RawRow> = {
  danhmuc: "danhMuc",
  loaimon: "danhMuc",
  category: "danhMuc",
  tenmon: "tenMon",
  mon: "tenMon",
  ten: "tenMon",
  name: "tenMon",
  gia: "gia",
  giamon: "gia",
  price: "gia",
  mota: "moTa",
  motamon: "moTa",
  description: "moTa",
  nhomtuychon: "nhomTuyChon",
  nhomtuy: "nhomTuyChon",
  nhom: "nhomTuyChon",
  group: "nhomTuyChon",
  optiongroup: "nhomTuyChon",
  loaituychon: "loaiTuyChon",
  loai: "loaiTuyChon",
  type: "loaiTuyChon",
  tuychon: "tuyChon",
  tuchon: "tuyChon",
  tentuychon: "tuyChon",
  option: "tuyChon",
  giatuychon: "giaTuyChon",
  giatuy: "giaTuyChon",
  giatuchon: "giaTuyChon",
  pricedelta: "giaTuyChon",
  macdinh: "macDinh",
  isdefault: "macDinh",
  default: "macDinh",
};

function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const cleaned = String(v ?? "")
    .trim()
    .replace(/[^\d.,\-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

function toBool(v: unknown): boolean {
  const s = String(v ?? "")
    .trim()
    .toLowerCase();
  return ["true", "1", "yes", "x", "co", "có", "mac dinh", "mặc định"].includes(
    s,
  );
}

function normalizeType(v: unknown): string {
  const s = String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (["CHOICE", "CHON1", "SINGLE", "RADIO"].includes(s)) return "CHOICE";
  if (
    ["MULTI_CHOICE", "MULTICHOICE", "CHONNHIEU", "MULTI", "CHECKBOX"].includes(
      s,
    )
  )
    return "MULTI_CHOICE";
  if (["TOGGLE", "BATTAT"].includes(s)) return "TOGGLE";
  if (["QUANTITY", "SOLUONG"].includes(s)) return "QUANTITY";
  return "MULTI_CHOICE";
}

/** Parser CSV đơn giản, hỗ trợ dấu nháy kép và dấu phẩy trong trường. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // bỏ qua
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export async function parseMenuFile(file: File): Promise<MenuImportPayload> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const isExcel = ["xlsx", "xls"].includes(ext);

  let grid: unknown[][];
  if (isExcel) {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    grid = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: "",
    }) as unknown[][];
  } else {
    const text = await file.text();
    grid = parseCsv(text);
  }

  if (grid.length === 0) {
    return { categories: [], items: [] };
  }

  const headers = (grid[0] || []).map((h) => norm(h));
  const fieldByCol = headers.map((h) => HEADER_MAP[h] || null);

  const rows: RawRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cells = grid[i] || [];
    const row: RawRow = {};
    let hasAny = false;
    for (let c = 0; c < cells.length; c++) {
      const field = fieldByCol[c];
      if (!field) continue;
      const val = cells[c];
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        hasAny = true;
      }
      row[field] = val;
    }
    if (hasAny) rows.push(row);
  }

  const itemMap = new Map<string, any>();
  const itemOrder: string[] = [];
  const categoryOrder: string[] = [];

  for (const r of rows) {
    const name = String(r.tenMon ?? "").trim();
    if (!name) continue;

    let item = itemMap.get(name);
    if (!item) {
      const cat = String(r.danhMuc ?? "").trim();
      item = {
        category: cat,
        name,
        price: toNumber(r.gia),
        description: String(r.moTa ?? "").trim() || undefined,
        optionGroups: [],
      };
      itemMap.set(name, item);
      itemOrder.push(name);
      if (cat && !categoryOrder.includes(cat)) categoryOrder.push(cat);
    }

    const groupName = String(r.nhomTuyChon ?? "").trim();
    const optionName = String(r.tuyChon ?? "").trim();
    if (!groupName || !optionName) continue;

    let group = item.optionGroups.find((g: any) => g.name === groupName);
    if (!group) {
      const type = normalizeType(r.loaiTuyChon);
      group = {
        name: groupName,
        type,
        required: type === "CHOICE",
        options: [],
      };
      item.optionGroups.push(group);
    }
    group.options.push({
      name: optionName,
      priceDelta: toNumber(r.giaTuyChon),
      isDefault: toBool(r.macDinh),
    });
  }

  return {
    categories: categoryOrder.map((name, i) => ({ name, sortOrder: i })),
    items: itemOrder.map((n) => itemMap.get(n)),
  };
}

export const MENU_TEMPLATE_CSV = [
  "DanhMuc,TenMon,Gia,MoTa,NhomTuyChon,LoaiTuyChon,TuyChon,GiaTuyChon,MacDinh",
  "Món chính,Phở Bò Tái,50000,Nước dùng hầm 12 giờ,Kích cỡ,CHOICE,Nhỏ,0,TRUE",
  "Món chính,Phở Bò Tái,50000,Nước dùng hầm 12 giờ,Kích cỡ,CHOICE,Lớn,20000,",
  "Món chính,Phở Bò Tái,50000,Nước dùng hầm 12 giờ,Topping,MULTI_CHOICE,Bò viên,15000,",
  "Đồ uống,Trà Đá,5000,Trà đá mát lạnh,,,,",
].join("\r\n");

export function downloadMenuTemplate() {
  const blob = new Blob(["\ufeff" + MENU_TEMPLATE_CSV], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "menu-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
