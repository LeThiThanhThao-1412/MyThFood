"use client";

import type {
  MenuItemOptionGroup,
  OptionGroupType,
} from "@mythfood/api-client";

const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const TYPE_LABELS: Record<OptionGroupType, string> = {
  CHOICE: "🔘 Chọn 1 (radio)",
  MULTI_CHOICE: "☑️ Chọn nhiều (checkbox)",
  TOGGLE: "🔛 Bật/tắt (switch)",
  QUANTITY: "🔢 Số lượng (stepper)",
};

interface Props {
  value: MenuItemOptionGroup[];
  onChange: (groups: MenuItemOptionGroup[]) => void;
}

export default function OptionGroupEditor({ value, onChange }: Props) {
  const groups = value ?? [];

  const patchGroup = (id: string, patch: Partial<MenuItemOptionGroup>) => {
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const patchOption = (
    gid: string,
    oid: string,
    patch: Record<string, unknown>,
  ) => {
    onChange(
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              options: g.options.map((o) =>
                o.id === oid ? { ...o, ...patch } : o,
              ),
            }
          : g,
      ),
    );
  };

  const addGroup = () => {
    onChange([
      ...groups,
      {
        id: uid(),
        name: "",
        type: "CHOICE",
        required: true,
        options: [{ id: uid(), name: "", priceDelta: 0 }],
      },
    ]);
  };

  const removeGroup = (id: string) =>
    onChange(groups.filter((g) => g.id !== id));

  const addOption = (gid: string) =>
    onChange(
      groups.map((g) =>
        g.id === gid
          ? {
              ...g,
              options: [...g.options, { id: uid(), name: "", priceDelta: 0 }],
            }
          : g,
      ),
    );

  const removeOption = (gid: string, oid: string) =>
    onChange(
      groups.map((g) =>
        g.id === gid
          ? { ...g, options: g.options.filter((o) => o.id !== oid) }
          : g,
      ),
    );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">
          🧩 Nhóm tùy chọn (tùy biến món)
        </span>
        <button
          type="button"
          onClick={addGroup}
          className="text-xs bg-[#ff6b35] text-white px-3 py-1.5 rounded-lg font-semibold hover:bg-orange-600 transition"
        >
          + Thêm nhóm
        </button>
      </div>

      {groups.length === 0 && (
        <p className="text-xs text-gray-400">
          Chưa có nhóm tùy chọn. Món sẽ được thêm thẳng vào giỏ hàng.
        </p>
      )}

      {groups.map((g) => (
        <div
          key={g.id}
          className="border border-gray-200 rounded-xl p-3 space-y-2 bg-gray-50"
        >
          <div className="flex gap-2">
            <input
              value={g.name}
              onChange={(e) => patchGroup(g.id, { name: e.target.value })}
              placeholder="Tên nhóm (VD: Vị)"
              className="flex-1 bg-white rounded-lg px-3 py-2 text-sm border outline-none focus:border-[#ff6b35]"
            />
            <select
              value={g.type}
              onChange={(e) =>
                patchGroup(g.id, { type: e.target.value as OptionGroupType })
              }
              className="bg-white rounded-lg px-2 py-2 text-sm border outline-none"
            >
              {(Object.keys(TYPE_LABELS) as OptionGroupType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeGroup(g.id)}
              className="text-red-500 text-xs font-semibold shrink-0"
            >
              ✕
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={g.required}
              onChange={(e) => patchGroup(g.id, { required: e.target.checked })}
            />
            Bắt buộc chọn
          </label>

          {g.type === "TOGGLE" ? (
            <div className="space-y-1">
              {g.options.slice(0, 1).map((o) => (
                <div key={o.id} className="flex gap-2">
                  <input
                    value={o.name}
                    onChange={(e) =>
                      patchOption(g.id, o.id, { name: e.target.value })
                    }
                    placeholder="Tên (VD: Có hành)"
                    className="flex-1 bg-white rounded-lg px-3 py-2 text-sm border outline-none focus:border-[#ff6b35]"
                  />
                  <input
                    type="number"
                    value={o.priceDelta}
                    onChange={(e) =>
                      patchOption(g.id, o.id, {
                        priceDelta: Number(e.target.value),
                      })
                    }
                    placeholder="+/-đ"
                    className="w-24 bg-white rounded-lg px-2 py-2 text-sm border outline-none"
                  />
                </div>
              ))}
              <p className="text-[10px] text-gray-400">
                Toggle chỉ có 1 lựa chọn (bật = cộng giá).
              </p>
            </div>
          ) : (
            <>
              {g.options.map((o) => (
                <div key={o.id} className="flex gap-2">
                  <input
                    value={o.name}
                    onChange={(e) =>
                      patchOption(g.id, o.id, { name: e.target.value })
                    }
                    placeholder="Tên tùy chọn (VD: Cay vừa)"
                    className="flex-1 bg-white rounded-lg px-3 py-2 text-sm border outline-none focus:border-[#ff6b35]"
                  />
                  <input
                    type="number"
                    value={o.priceDelta}
                    onChange={(e) =>
                      patchOption(g.id, o.id, {
                        priceDelta: Number(e.target.value),
                      })
                    }
                    placeholder="+/-đ"
                    className="w-24 bg-white rounded-lg px-2 py-2 text-sm border outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(g.id, o.id)}
                    className="text-red-400 text-sm shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addOption(g.id)}
                className="text-xs text-[#ff6b35] font-semibold"
              >
                + Thêm tùy chọn
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
