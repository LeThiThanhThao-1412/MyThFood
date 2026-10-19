"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { driverApi, walletApi } from "@mythfood/api-client";
import { useAuthStore } from "@mythfood/frontend-shared";
import { formatDateTime, formatVnd } from "../../lib/format";
import AdminShell from "../../components/AdminShell";
import ReasonDialog from "../../components/ReasonDialog";

const VEHICLE_TYPE_LABEL: Record<string, string> = {
  MOTORBIKE: "Xe máy",
  CAR: "Ô tô",
  BICYCLE: "Xe đạp",
  MOTO: "Xe máy",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Hoạt động", cls: "bg-green-100 text-green-700" },
  INACTIVE: { label: "Chờ duyệt", cls: "bg-yellow-100 text-yellow-700" },
  SUSPENDED: { label: "Bị khóa", cls: "bg-red-100 text-red-700" },
  REJECTED: { label: "Từ chối", cls: "bg-gray-200 text-gray-700" },
};

const ONLINE_BADGE: Record<string, { label: string; cls: string }> = {
  ONLINE: { label: "Trực tuyến", cls: "bg-blue-100 text-blue-700" },
  OFFLINE: { label: "Ngoại tuyến", cls: "bg-gray-100 text-gray-500" },
};

export default function AdminDriversPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  const [drivers, setDrivers] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<any>(null);
  const [actionMsg, setActionMsg] = useState("");
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [dialogLoading, setDialogLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, statusFilter]);

  // Lấy số dư ví thật từ wallet-service khi mở chi tiết tài xế.
  useEffect(() => {
    if (!selected?.id) {
      setWalletBalance(null);
      return;
    }
    let active = true;
    walletApi
      .getBalance(selected.id, "DRIVER")
      .then((r: any) => {
        if (active) setWalletBalance(Number(r?.balance ?? 0));
      })
      .catch(() => {
        if (active) setWalletBalance(null);
      });
    return () => {
      active = false;
    };
  }, [selected?.id]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [dRes, sRes] = await Promise.all([
        driverApi.list(statusFilter ? { status: statusFilter } : {}),
        driverApi.getDriverStats().catch(() => null),
      ]);
      setDrivers((dRes as any)?.data || []);
      if (sRes) setStats((sRes as any)?.data ?? sRes);
    } catch {
      setError("Không thể tải danh sách tài xế");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(fn: () => Promise<any>, okMsg: string) {
    setActionMsg("");
    try {
      await fn();
      setActionMsg("✅ " + okMsg);
      setSelected(null);
      load();
    } catch (e: any) {
      setActionMsg("❌ " + (e?.message || "Thao tác thất bại"));
    }
  }

  async function confirmReject(reason: string) {
    if (!rejectTarget) return;
    setDialogLoading(true);
    await runAction(
      () => driverApi.reject(rejectTarget.id, reason),
      "Đã từ chối hồ sơ tài xế",
    );
    setDialogLoading(false);
    setRejectTarget(null);
  }

  const selectedStatus = STATUS_BADGE[selected?.status] || {
    label: selected?.status || "-",
    cls: "bg-gray-100 text-gray-600",
  };

  return (
    <AdminShell title="🛵 Quản lý Tài xế">
      <div className="space-y-4">
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Tổng tài xế", value: stats.totalDrivers ?? 0 },
              { label: "Đang hoạt động", value: stats.activeDrivers ?? 0 },
              { label: "Trực tuyến", value: stats.onlineDrivers ?? 0 },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl shadow-sm p-5">
                <p className="text-xs text-gray-400">{s.label}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          {["", "ACTIVE", "INACTIVE", "SUSPENDED", "REJECTED"].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                statusFilter === s
                  ? "bg-[#ff6b35] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s === "" ? "Tất cả" : STATUS_BADGE[s]?.label || s}
            </button>
          ))}
        </div>

        {actionMsg && (
          <div className="bg-white rounded-xl p-3 mb-4 text-sm">
            {actionMsg}
          </div>
        )}
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
        ) : drivers.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            🛵 Chưa có tài xế nào đăng ký
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
                    SĐT
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden lg:table-cell">
                    Biển số
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Trạng thái
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase hidden md:table-cell">
                    Online
                  </th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 uppercase">
                    Hành động
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {drivers.map((d: any) => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-800">
                        {d.fullName}
                      </p>
                      <p className="text-xs text-gray-400">{d.email}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden md:table-cell">
                      {d.phoneNumber}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 hidden lg:table-cell">
                      {d.vehicleRegistrationNumber || "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[d.status]?.cls || "bg-gray-100 text-gray-600"}`}
                      >
                        {STATUS_BADGE[d.status]?.label || d.status}
                      </span>
                      {d.status === "REJECTED" && d.rejectReason && (
                        <p className="mt-1 max-w-[180px] text-[10px] text-red-500">
                          Lý do: {d.rejectReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${ONLINE_BADGE[d.onlineStatus]?.cls || "bg-gray-100 text-gray-500"}`}
                      >
                        {ONLINE_BADGE[d.onlineStatus]?.label || d.onlineStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelected(d)}
                        className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-semibold hover:bg-blue-100"
                      >
                        Xem / Duyệt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-800">
                    {selected.fullName}
                  </h2>
                  <p className="text-sm text-gray-400">{selected.email}</p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold ${selectedStatus.cls}`}
                >
                  {selectedStatus.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <Info label="SĐT" value={selected.phoneNumber} />
                <Info label="CMND/CCCD" value={selected.idCardNumber} />
                <Info
                  label="Giấy phép lái xe"
                  value={selected.driverLicenseNumber}
                />
                <Info
                  label="Biển số xe"
                  value={selected.vehicleRegistrationNumber}
                />
                <Info label="Bảo hiểm" value={selected.insuranceNumber} />
                <Info
                  label="Loại xe"
                  value={
                    selected.vehicleType
                      ? (VEHICLE_TYPE_LABEL[selected.vehicleType] ??
                        selected.vehicleType)
                      : "—"
                  }
                />
                <Info label="Điểm uy tín" value={selected.reputationScore} />
                <Info
                  label="Đánh giá"
                  value={`${selected.rating ?? 0} ⭐ (${selected.totalRatings ?? 0})`}
                />
                <Info label="Tổng đơn" value={selected.totalOrders} />
                <Info
                  label="Đào tạo xong"
                  value={selected.isTrainingCompleted ? "✅ Có" : "❌ Chưa"}
                />
                <Info
                  label="Số dư ví"
                  value={walletBalance != null ? formatVnd(walletBalance) : "—"}
                />
                <Info
                  label="Ví credit"
                  value={formatVnd(selected.creditWalletBalance)}
                />
                <Info
                  label="Ngày đăng ký"
                  value={formatDateTime(selected.createdAt)}
                />
                <Info
                  label="Khóa đến"
                  value={
                    selected.acceptBlockedUntil
                      ? formatDateTime(selected.acceptBlockedUntil)
                      : "-"
                  }
                />
              </div>

              {selected.status === "REJECTED" && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  <p className="font-semibold">Hồ sơ đã bị từ chối</p>
                  {selected.rejectReason && (
                    <p className="mt-1">Lý do: {selected.rejectReason}</p>
                  )}
                  {selected.rejectedAt && (
                    <p className="mt-1">
                      Từ chối lúc: {formatDateTime(selected.rejectedAt)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-red-600">
                    Tài khoản đăng nhập của tài xế sẽ bị xóa sau 3 ngày kể từ
                    khi bị từ chối.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2 flex-wrap">
                {selected.status === "INACTIVE" &&
                  !selected.isTrainingCompleted && (
                    <button
                      onClick={() =>
                        runAction(
                          () => driverApi.completeTraining(selected.id),
                          "Đã hoàn tất đào tạo",
                        )
                      }
                      className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700"
                    >
                      ✅ Hoàn tất đào tạo
                    </button>
                  )}
                {selected.status === "INACTIVE" &&
                  selected.isTrainingCompleted && (
                    <button
                      onClick={() =>
                        runAction(
                          () => driverApi.activate(selected.id),
                          "Đã kích hoạt tài xế",
                        )
                      }
                      className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700"
                    >
                      🟢 Kích hoạt
                    </button>
                  )}
                {selected.status === "INACTIVE" && (
                  <button
                    onClick={() => setRejectTarget(selected)}
                    className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-red-700"
                  >
                    ❌ Từ chối hồ sơ
                  </button>
                )}
                {selected.status === "ACTIVE" && (
                  <Link
                    href="/users"
                    className="flex-1 text-center bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200"
                  >
                    🔒 Khóa tài khoản tại trang Người dùng
                  </Link>
                )}
                {selected.status === "SUSPENDED" && (
                  <Link
                    href="/users"
                    className="flex-1 text-center bg-gray-100 text-gray-600 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-200"
                  >
                    🔓 Mở khóa tại trang Người dùng
                  </Link>
                )}
                {selected.status === "REJECTED" &&
                  !selected.isTrainingCompleted && (
                    <button
                      onClick={() =>
                        runAction(
                          () => driverApi.completeTraining(selected.id),
                          "Đã hoàn tất đào tạo",
                        )
                      }
                      className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700"
                    >
                      ✅ Hoàn tất đào tạo
                    </button>
                  )}
                {selected.status === "REJECTED" &&
                  selected.isTrainingCompleted && (
                    <button
                      onClick={() =>
                        runAction(
                          () => driverApi.activate(selected.id),
                          "Đã kích hoạt lại tài xế",
                        )
                      }
                      className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700"
                    >
                      🟢 Kích hoạt lại
                    </button>
                  )}
                <button
                  onClick={() => setSelected(null)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ReasonDialog
        open={!!rejectTarget}
        title={`Từ chối hồ sơ tài xế "${rejectTarget?.fullName ?? ""}"`}
        description="Lý do sẽ hiển thị cho tài xế khi đăng nhập. Tài khoản bị xóa sau 3 ngày."
        confirmLabel="Từ chối hồ sơ"
        loading={dialogLoading}
        onCancel={() => setRejectTarget(null)}
        onConfirm={confirmReject}
      />
    </AdminShell>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-700 mt-0.5">{value ?? "-"}</p>
    </div>
  );
}
