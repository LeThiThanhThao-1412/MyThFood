"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { merchantApi } from "@mythfood/api-client";
import { useAuthStore, getFoodCategoryLabel } from "@mythfood/frontend-shared";
import AdminShell from "../../components/AdminShell";

const BADGE: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-red-100 text-red-700",
  SUSPENDED: "bg-gray-200 text-gray-600",
};
const LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  SUSPENDED: "Bị khóa",
};
const FILTERS = ["", "PENDING", "APPROVED", "SUSPENDED", "REJECTED"];

export default function AdminMerchantsPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const [merchants, setMerchants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, filter]);

  async function load() {
    setLoading(true);
    try {
      const res: any = await merchantApi.list({
        take: 500,
        status: filter || undefined,
      } as any);
      setMerchants(res.items || []);
    } catch {
    } finally {
      setLoading(false);
    }
  }

  async function act(fn: () => Promise<any>, ok: string) {
    setMsg("");
    try {
      await fn();
      setMsg("✅ " + ok);
      load();
    } catch (e: any) {
      setMsg("❌ " + (e?.message || "Thao tác thất bại"));
    }
  }

  return (
    <AdminShell title="🏪 Quản lý nhà hàng">
      <div className="space-y-4">
        {msg && <div className="bg-white rounded-xl p-3 text-sm">{msg}</div>}
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === f
                  ? "bg-[#ff6b35] text-white"
                  : "bg-white text-gray-600 shadow-sm hover:bg-gray-50"
              }`}
            >
              {f === "" ? "Tất cả" : LABEL[f]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : merchants.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            Không có nhà hàng nào
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Tên
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    Liên hệ
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">
                    Địa chỉ
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Trạng thái
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {merchants.map((m: any) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-400">
                        {getFoodCategoryLabel(m.primaryCategory)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                      <p>{m.email || "-"}</p>
                      <p className="text-xs">{m.phone || "-"}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {m.address}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${BADGE[m.status] || "bg-gray-100 text-gray-600"}`}
                      >
                        {LABEL[m.status] || m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <Link
                          href={`/merchants/${m.id}`}
                          className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-100"
                        >
                          Xem
                        </Link>
                        {m.status === "PENDING" && (
                          <>
                            <button
                              onClick={() =>
                                act(
                                  () => merchantApi.approve(m.id),
                                  "Đã phê duyệt",
                                )
                              }
                              className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700"
                            >
                              Duyệt
                            </button>
                            <button
                              onClick={() =>
                                act(
                                  () => merchantApi.reject(m.id),
                                  "Đã từ chối",
                                )
                              }
                              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-red-700"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                        {m.status === "REJECTED" && (
                          <button
                            onClick={() =>
                              act(
                                () => merchantApi.approve(m.id),
                                "Đã phê duyệt lại",
                              )
                            }
                            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700"
                          >
                            Duyệt lại
                          </button>
                        )}
                        {m.status === "SUSPENDED" && (
                          <button
                            onClick={() =>
                              act(
                                () => merchantApi.reactivate(m.id),
                                "Đã mở khóa",
                              )
                            }
                            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-green-700"
                          >
                            Mở khóa
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
