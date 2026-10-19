"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@mythfood/frontend-shared";
import { httpClient } from "@mythfood/api-client";
import AdminShell from "../../components/AdminShell";

interface UserItem {
  id: string;
  phone: string;
  fullName: string;
  email?: string;
  roles: string[];
  status: string;
  suspendedUntil?: string | null;
  suspendedAt?: string | null;
  suspendReason?: string | null;
  rejectedAt?: string | null;
  rejectReason?: string | null;
  rejectionDeleteAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { isAuthenticated, token } = useAuthStore();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [skip, setSkip] = useState(0);
  const take = 20;

  const [lockTarget, setLockTarget] = useState<UserItem | null>(null);
  const [lockDays, setLockDays] = useState(3);
  const [lockReason, setLockReason] = useState("");

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    loadUsers();
  }, [isAuthenticated, skip, roleFilter, statusFilter]);

  async function loadUsers() {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        skip: String(skip),
        take: String(take),
      });
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await httpClient.get<any>(
        3001,
        `/auth/users?${params.toString()}`,
      );
      setUsers(res.items || []);
      setTotal(res.total || 0);
    } catch {
      setError("Không thể tải danh sách users");
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, newStatus: string) {
    try {
      await httpClient.patch(3001, `/auth/users/${id}/status`, {
        status: newStatus,
      });
      setUsers(
        users.map((u) => (u.id === id ? { ...u, status: newStatus } : u)),
      );
    } catch {
      setError("Không thể cập nhật trạng thái");
    }
  }

  async function handleUnlock(id: string) {
    try {
      await httpClient.patch(3001, `/auth/users/${id}/unlock`, {});
      setUsers(
        users.map((u) =>
          u.id === id
            ? {
                ...u,
                status: "ACTIVE",
                suspendedUntil: null,
                suspendReason: null,
                rejectedAt: null,
                rejectReason: null,
                rejectionDeleteAt: null,
              }
            : u,
        ),
      );
    } catch {
      setError("Không thể mở khóa tài khoản");
    }
  }

  async function handleLock(id: string, durationDays: number, reason: string) {
    try {
      await httpClient.patch(3001, `/auth/users/${id}/status`, {
        status: "SUSPENDED",
        durationDays: durationDays > 0 ? durationDays : undefined,
        reason: reason || undefined,
      });
      loadUsers();
    } catch {
      setError("Không thể khóa tài khoản");
    }
  }

  const statusBadge = (status: string) => {
    const m: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-700",
      INACTIVE: "bg-yellow-100 text-yellow-700",
      SUSPENDED: "bg-red-100 text-red-700",
      BANNED: "bg-gray-800 text-white",
      REJECTED: "bg-gray-200 text-gray-700",
    };
    return (
      <span
        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m[status] || "bg-gray-100 text-gray-600"}`}
      >
        {status}
      </span>
    );
  };

  const roleBadge = (roles: string[]) =>
    roles.map((r) => (
      <span
        key={r}
        className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-600 mr-1"
      >
        {r}
      </span>
    ));

  if (!isAuthenticated) return null;

  return (
    <AdminShell title="👥 Quản lý Người dùng">
      <div className="space-y-4">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên/SĐT..."
            className="border rounded-lg px-3 py-2 text-sm w-48"
            onKeyDown={(e) => e.key === "Enter" && (setSkip(0), loadUsers())}
          />
          <select
            value={roleFilter}
            onChange={(e) => {
              setRoleFilter(e.target.value);
              setSkip(0);
            }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Tất cả Role</option>
            <option value="CONSUMER">CONSUMER</option>
            <option value="MERCHANT_OWNER">MERCHANT_OWNER</option>
            <option value="DRIVER">DRIVER</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSkip(0);
            }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Tất cả Status</option>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="SUSPENDED">SUSPENDED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="BANNED">BANNED</option>
          </select>
          <button
            onClick={() => {
              setSkip(0);
              loadUsers();
            }}
            className="bg-[#ff6b35] text-white px-4 py-2 rounded-lg text-sm hover:bg-[#e55a2b]"
          >
            Tìm kiếm
          </button>
          <span className="text-sm text-gray-500 ml-auto self-center">
            {total.toLocaleString("vi-VN")} users
          </span>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm mb-4">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            Không tìm thấy user nào
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Phone
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Tên
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Roles
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium">{u.phone}</td>
                    <td className="px-4 py-3 text-sm">{u.fullName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {u.email || "-"}
                    </td>
                    <td className="px-4 py-3">{roleBadge(u.roles)}</td>
                    <td className="px-4 py-3">
                      {statusBadge(u.status)}
                      {u.status === "SUSPENDED" && u.suspendedUntil && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Khóa đến:{" "}
                          {new Date(u.suspendedUntil).toLocaleString("vi-VN")}
                        </p>
                      )}
                      {u.suspendReason && (
                        <p className="text-[10px] text-gray-400">
                          Lý do: {u.suspendReason}
                        </p>
                      )}
                      {u.status === "REJECTED" && (
                        <>
                          {u.rejectReason && (
                            <p className="text-[10px] text-gray-400">
                              Lý do từ chối: {u.rejectReason}
                            </p>
                          )}
                          {u.rejectionDeleteAt && (
                            <p className="text-[10px] text-red-400">
                              Xóa sau:{" "}
                              {new Date(u.rejectionDeleteAt).toLocaleString(
                                "vi-VN",
                              )}
                            </p>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1.5 justify-end">
                        {u.status === "ACTIVE" && (
                          <button
                            onClick={() => setLockTarget(u)}
                            className="bg-[#e74c3c] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600"
                          >
                            Khóa
                          </button>
                        )}
                        {u.status === "INACTIVE" && (
                          <button
                            onClick={() => handleStatusChange(u.id, "ACTIVE")}
                            className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600"
                          >
                            Kích hoạt
                          </button>
                        )}
                        {u.status === "SUSPENDED" && (
                          <button
                            onClick={() => handleUnlock(u.id)}
                            className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600"
                          >
                            Mở khóa
                          </button>
                        )}
                        {u.status === "REJECTED" && (
                          <button
                            onClick={() => handleUnlock(u.id)}
                            className="bg-[#2ecc71] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-600"
                          >
                            Bỏ từ chối
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center p-4 border-t">
              <button
                disabled={skip === 0}
                onClick={() => setSkip(Math.max(0, skip - take))}
                className="text-sm text-gray-500 disabled:opacity-30"
              >
                ← Trước
              </button>
              <span className="text-sm text-gray-400">
                {skip + 1}-{Math.min(skip + take, total)} / {total}
              </span>
              <button
                disabled={skip + take >= total}
                onClick={() => setSkip(skip + take)}
                className="text-sm text-gray-500 disabled:opacity-30"
              >
                Sau →
              </button>
            </div>
          </div>
        )}
      </div>

      {lockTarget && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setLockTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg text-gray-800 mb-1">
              🔒 Khóa tài khoản
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {lockTarget.fullName} · {lockTarget.phone}
            </p>

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Thời hạn khóa (ngày, để 0 = vô thời hạn)
            </label>
            <input
              type="number"
              min={0}
              value={lockDays}
              onChange={(e) => setLockDays(Number(e.target.value))}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
            />

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Lý do
            </label>
            <input
              value={lockReason}
              onChange={(e) => setLockReason(e.target.value)}
              placeholder="Vi phạm điều khoản..."
              className="w-full border rounded-lg px-3 py-2 text-sm mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={async () => {
                  await handleLock(lockTarget.id, lockDays, lockReason);
                  setLockTarget(null);
                }}
                className="flex-1 bg-[#e74c3c] text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-600"
              >
                Xác nhận khóa
              </button>
              <button
                onClick={() => setLockTarget(null)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
