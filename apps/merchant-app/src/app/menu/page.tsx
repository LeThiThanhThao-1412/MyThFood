"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  merchantApi,
  uploadApi,
  type MenuItem,
  type MenuItemOptionGroup,
  type MenuCategory,
} from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import TopNav from "@/components/TopNav";
import OptionGroupEditor from "@/components/OptionGroupEditor";

const GRADIENT_BG = [
  "from-[#f093fb] to-[#f5576c]",
  "from-[#43e97b] to-[#38f9d7]",
  "from-[#fa709a] to-[#fee140]",
  "from-[#a18cd1] to-[#fbc2eb]",
  "from-[#ff6b35] to-[#ff8f65]",
  "from-[#fbc2eb] to-[#a6c1ee]",
];

export default function MenuPage() {
  const router = useRouter();
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const [merchant, setMerchant] = useState<any>(null);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add/Edit form
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    price: "",
    category: "",
    categoryId: "",
    description: "",
    imageUrl: "",
  });
  const [optionGroups, setOptionGroups] = useState<MenuItemOptionGroup[]>([]);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    async function load() {
      try {
        const res = await merchantApi.list({ take: 200 });
        const m = (res.items || []).find((m2: any) => m2.userId === user?.id);
        setMerchant(m);
        if (m) {
          const items = await merchantApi.getMenu(m.id, true);
          setMenuItems(Array.isArray(items) ? items : []);
          const cats = await merchantApi.getMenuCategories(m.id);
          setCategories(Array.isArray(cats) ? cats : []);
        }
      } catch (e: any) {
        console.error("Load menu error:", e);
        alert(
          "Lỗi tải thực đơn: " + (e?.message || "Không thể kết nối server"),
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [isAuthenticated, user, router]);

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadApi.uploadImage(file, "menu-items");
      setForm((prev) => ({ ...prev, imageUrl: res.data.url }));
    } catch {
      alert("Upload ảnh thất bại!");
    } finally {
      setUploading(false);
    }
  }

  async function handleAdd() {
    if (!merchant || !form.name || !form.price) return;
    setSaving(true);
    try {
      const created = await merchantApi.addMenuItem(merchant.id, {
        name: form.name,
        price: Number(form.price),
        category: form.category,
        categoryId: form.categoryId || undefined,
        description: form.description,
        imageUrl: form.imageUrl || undefined,
        optionGroups: optionGroups.length > 0 ? optionGroups : undefined,
      } as any);
      setMenuItems([...menuItems, created]);
      setShowForm(false);
      setForm({
        name: "",
        price: "",
        category: "",
        categoryId: "",
        description: "",
        imageUrl: "",
      });
      setOptionGroups([]);
    } catch (e: any) {
      alert("Lỗi thêm món: " + (e?.message || "Không thể kết nối server"));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate() {
    if (!merchant || !editing) return;
    setSaving(true);
    try {
      const updated = await merchantApi.updateMenuItem(
        merchant.id,
        editing.id,
        {
          name: form.name,
          price: Number(form.price),
          category: form.category,
          categoryId: form.categoryId || undefined,
          description: form.description,
          imageUrl: form.imageUrl || undefined,
          optionGroups: optionGroups.length > 0 ? optionGroups : undefined,
        } as any,
      );
      setMenuItems(menuItems.map((i) => (i.id === editing.id ? updated : i)));
      setEditing(null);
      setShowForm(false);
      setForm({
        name: "",
        price: "",
        category: "",
        categoryId: "",
        description: "",
        imageUrl: "",
      });
      setOptionGroups([]);
    } catch (e: any) {
      alert("Lỗi cập nhật: " + (e?.message || ""));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!merchant || !confirm("Xac nhan xoa mon nay?")) return;
    try {
      await merchantApi.deleteMenuItem(merchant.id, id);
      setMenuItems(menuItems.filter((i) => i.id !== id));
    } catch (e: any) {
      alert("Lỗi xóa: " + (e?.message || ""));
    }
  }

  async function handleToggle(item: any) {
    if (!merchant) return;
    try {
      const updated = await merchantApi.toggleMenuItem(merchant.id, item.id);
      setMenuItems(menuItems.map((i) => (i.id === item.id ? updated : i)));
    } catch (e: any) {
      alert("Lỗi: " + (e?.message || ""));
    }
  }

  async function handleAddCategory() {
    if (!merchant || !newCategoryName.trim()) return;
    try {
      const cat = await merchantApi.addMenuCategory(merchant.id, {
        name: newCategoryName.trim(),
        sortOrder: categories.length,
      });
      setCategories([...categories, cat]);
      setNewCategoryName("");
    } catch (e: any) {
      alert("Lỗi thêm danh mục: " + (e?.message || ""));
    }
  }

  async function handleRenameCategory(cat: any) {
    if (!merchant) return;
    const newName = prompt("Tên danh mục mới:", cat.name);
    if (!newName || !newName.trim()) return;
    try {
      const updated = await merchantApi.updateMenuCategory(
        merchant.id,
        cat.id,
        { name: newName.trim() },
      );
      setCategories(categories.map((c) => (c.id === cat.id ? updated : c)));
    } catch (e: any) {
      alert("Lỗi đổi tên: " + (e?.message || ""));
    }
  }

  async function handleDeleteCategory(catId: string) {
    if (!merchant || !confirm("Xóa danh mục này?")) return;
    try {
      await merchantApi.deleteMenuCategory(merchant.id, catId);
      setCategories(categories.filter((c) => c.id !== catId));
    } catch (e: any) {
      alert("Lỗi xóa danh mục: " + (e?.message || ""));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5]">
        <div className="animate-spin w-10 h-10 border-4 border-[#ff6b35] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!merchant) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f0f2f5] px-4">
        <div className="text-center bg-white rounded-2xl shadow-lg p-8 max-w-md">
          <p className="text-4xl mb-3">🏪</p>
          <p className="text-lg font-bold text-[#1a1a2e] mb-2">
            Chưa có nhà hàng
          </p>
          <p className="text-sm text-gray-500 mb-4">
            Đăng nhập bằng tài khoản chủ nhà hàng (
            {process.env.NEXT_PUBLIC_MERCHANT_PHONE || "+84902334455"})
          </p>
          <Link
            href="/register"
            className="inline-block bg-[#ff6b35] text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-orange-600 transition"
          >
            Đăng ký nhà hàng
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] max-w-[1400px] mx-auto pb-20 lg:pb-0 w-full">
      <TopNav />

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold text-[#1a1a2e]">
            🍽️ Quản lý thực đơn
          </h1>
          <button
            onClick={() => {
              setEditing(null);
              setForm({
                name: "",
                price: "",
                category: "",
                categoryId: "",
                description: "",
                imageUrl: "",
              });
              setOptionGroups([]);
              setShowForm(true);
            }}
            className="bg-[#ff6b35] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
          >
            + Thêm món
          </button>
        </div>

        {/* ===== Danh mục món ===== */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <h3 className="font-bold text-sm text-gray-700 mb-2">
            🗂️ Danh mục món
          </h3>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.length === 0 && (
              <p className="text-xs text-gray-400">
                Chưa có danh mục. Thêm danh mục (VD: Trà sữa, Trà trái cây, Nước
                ép...).
              </p>
            )}
            {categories.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 bg-[#fff7ed] border border-orange-100 text-[#ff6b35] text-xs font-medium rounded-full px-3 py-1.5"
              >
                {c.name}
                <button
                  onClick={() => handleRenameCategory(c)}
                  className="text-gray-400 hover:text-blue-500"
                  title="Đổi tên"
                >
                  ✏️
                </button>
                <button
                  onClick={() => handleDeleteCategory(c.id)}
                  className="text-gray-400 hover:text-red-500"
                  title="Xóa"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCategory();
              }}
              placeholder="Tên danh mục mới (VD: Trà sữa)"
              className="flex-1 bg-gray-50 rounded-xl px-4 py-2.5 text-sm border outline-none focus:border-[#ff6b35]"
            />
            <button
              onClick={handleAddCategory}
              className="bg-[#ff6b35] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
            >
              + Thêm
            </button>
          </div>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm p-5 space-y-3">
            <h3 className="font-bold text-lg">
              {editing ? "✏️ Sửa món" : "➕ Thêm món mới"}
            </h3>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tên món"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]"
            />
            <input
              type="number"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              placeholder="Giá (VND)"
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35]"
            />
            <select
              value={form.categoryId}
              onChange={(e) => {
                const id = e.target.value;
                const cat = categories.find((c) => c.id === id);
                setForm({ ...form, categoryId: id, category: cat?.name || "" });
              }}
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none"
            >
              <option value="">-- Chọn danh mục --</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="Mô tả món ăn"
              rows={2}
              className="w-full bg-gray-50 rounded-xl px-4 py-3 text-sm border outline-none focus:border-[#ff6b35] resize-none"
            />

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                📸 Ảnh món ăn
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageUpload}
                className="w-full text-sm p-2 border border-dashed border-gray-300 rounded-xl bg-gray-50"
              />
              {form.imageUrl && (
                <div className="mt-2 flex items-center gap-3">
                  <img
                    src={form.imageUrl}
                    alt="Preview"
                    className="w-20 h-20 object-cover rounded-lg border"
                  />
                  <div>
                    <p className="text-xs text-green-600 font-semibold">
                      ✅ Đã upload lên S3
                    </p>
                    <p className="text-xs text-gray-400 truncate max-w-[200px]">
                      {form.imageUrl}
                    </p>
                  </div>
                </div>
              )}
              {uploading && (
                <p className="text-xs text-blue-500 mt-1 animate-pulse">
                  ⏳ Đang upload lên S3...
                </p>
              )}
            </div>

            <OptionGroupEditor
              value={optionGroups}
              onChange={setOptionGroups}
            />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="flex-1 bg-gray-200 py-2.5 rounded-xl text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                onClick={editing ? handleUpdate : handleAdd}
                disabled={saving}
                className="flex-1 bg-[#ff6b35] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Thêm món"}
              </button>
            </div>
          </div>
        )}

        {menuItems.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-400">Chưa có món nào trong thực đơn</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {menuItems.map((item: any, idx: number) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl shadow-sm p-3 text-center hover:shadow-md transition"
              >
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    className="h-24 w-full object-cover rounded-lg mb-2"
                  />
                ) : (
                  <div
                    className={`h-24 bg-gradient-to-br ${GRADIENT_BG[idx % GRADIENT_BG.length]} rounded-lg mb-2 flex items-center justify-center text-3xl`}
                  >
                    🍽️
                  </div>
                )}
                <p className="text-sm font-semibold truncate">{item.name}</p>
                <p className="text-sm font-bold text-[#ff6b35]">
                  {item.price?.toLocaleString("vi-VN")}₫
                </p>
                <p className="text-xs text-gray-400">
                  {item.category || "Khác"}
                </p>
                <div className="flex gap-1 mt-2 justify-center">
                  <button
                    onClick={() => {
                      setEditing(item);
                      setForm({
                        name: item.name,
                        price: String(item.price),
                        category: item.category || "",
                        categoryId: item.categoryId || "",
                        description: item.description || "",
                        imageUrl: item.imageUrl || "",
                      });
                      setOptionGroups(item.optionGroups || []);
                      setShowForm(true);
                    }}
                    className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200 transition"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="text-xs bg-red-100 text-red-500 px-2 py-1 rounded hover:bg-red-200 transition"
                  >
                    Xóa
                  </button>
                  <button
                    onClick={() => handleToggle(item)}
                    className={`text-xs px-2 py-1 rounded transition ${item.isAvailable ? "bg-green-100 text-green-600 hover:bg-green-200" : "bg-gray-200 text-gray-500 hover:bg-gray-300"}`}
                  >
                    {item.isAvailable ? "Đang bán" : "Hết món"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
