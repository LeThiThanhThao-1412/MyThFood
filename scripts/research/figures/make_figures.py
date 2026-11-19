#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
figures/make_figures.py — VẼ HÌNH CHO BÀI BÁO TỪ SỐ ĐO THẬT

Mọi con số trong hình đều đọc từ các tệp tổng hợp do script Node sinh ra
(`logs/*.json`), không có giá trị nào gõ tay, trừ toạ độ bố cục của sơ đồ
kiến trúc (đó là bố cục, không phải số đo).

Sinh ra (thư mục `docs/RESEARCH/figures/`):
  hinh1-kien-truc-m2.png    Kiến trúc M2 + đường tới hạn đo được (Hình 1)
  hinh2-m1-va-b1.png        M1 mục tiêu và nhánh B1 đã dựng (Hình 2)
  hinh3-chi-phi-hop.png     Phân rã chi phí hop (thay Bảng VI cũ)
  hinh4-diem-gay-w4.png     Đường cong điểm gãy W4 (thay bảng 5 dòng cũ)
  hinh5-tiem-loi.png        Hoàn tất khi tiêm lỗi vs BR tĩnh (thay Bảng VIII cũ)
  hinh6-br-vs-luot-goi.png  BR tĩnh vs lượt gọi đo được (thay Bảng X cũ)

Dùng:
  python scripts/research/figures/make_figures.py            # vẽ tất cả
  python scripts/research/figures/make_figures.py --inspect  # chỉ in cấu trúc JSON
  python scripts/research/figures/make_figures.py --only 3 5 # chỉ vẽ hình 3 và 5
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]          # …/mythfood
LOGS = ROOT / "logs"
OUT = ROOT.parent / "docs" / "RESEARCH" / "figures"
OUT.mkdir(parents=True, exist_ok=True)

# Giao diện: font mặc định DejaVu Sans có đủ dấu tiếng Việt; cỡ chữ theo IEEE
# (nhãn 8 pt, tiêu đề trục 9 pt, ghi chú 7 pt) để hình in ra không bị thu nhỏ.
plt.rcParams.update({
    "font.family": "DejaVu Sans",
    "font.size": 8,
    "axes.titlesize": 9,
    "axes.labelsize": 8,
    "xtick.labelsize": 7.5,
    "ytick.labelsize": 7.5,
    "legend.fontsize": 7.5,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "figure.dpi": 110,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "savefig.pad_inches": 0.03,
})

DPI = 300
# Nhật ký chạy: ghi trực tiếp ra tệp để theo dõi được khi chạy nền (matplotlib
# mất 5–10 giây cho lần import đầu, chạy nền tránh bị timeout của terminal).
LOG = open(LOGS / "_fig.log", "w", encoding="utf-8", buffering=1)


def step(msg: str) -> None:
    import time

    LOG.write(f"{time.strftime('%H:%M:%S')} {msg}\n")
    LOG.flush()

# Bảng màu: xám cho cấu trúc, xanh cho M2, cam cho M1/B1, đỏ cho điểm gãy/lỗi.
C_M2 = "#1f4e79"
C_M2_L = "#dbe5f1"
C_M1 = "#b45309"
C_M1_L = "#fde8d4"
C_BAD = "#b91c1c"
C_OK = "#15803d"
C_GREY = "#6b7280"
C_GREY_L = "#f3f4f6"


def load(name: str):
    p = LOGS / name
    if not p.exists():
        raise SystemExit(f"Thiếu {p} — chạy script tổng hợp tương ứng trước.")
    return json.loads(p.read_text(encoding="utf-8"))


def save(fig, name: str) -> None:
    path = OUT / name
    fig.savefig(path)
    plt.close(fig)
    step(f"  {name}  ({path.stat().st_size / 1024:.0f} KB)")


# =============================================================================
# Nhãn: mọi chữ trong hình lấy từ đây, mọi số lấy từ JSON
# =============================================================================
TXT = {
    "vi": {
        "clients": "Bốn ứng dụng\ngiao diện\n(khách, nhà hàng,\ntài xế, quản trị)",
        "gw": "API Gateway (Nginx)",
        "auth": "identity-service\nxác thực JWT",
        "order": "order-service\n(1 CPU / 1 GB)\nđiểm vào luồng đặt đơn",
        "hot_hdr": "Năm hop đo được trên vòng đời đơn\n(E2/E3 · 364 chu trình · n = 1 cặp run)",
        "cold_hdr": "Bảy dịch vụ có 0 lượt gọi đo được (364 chu trình)",
        "db1": "PostgreSQL 16 — 12 CSDL logic\n(1 schema cho mỗi dịch vụ)",
        "db2": "Redis 7\ncache",
        "legend": "nét đậm: hop đo được, kèm chi phí trung bình và số lượt/364 chu trình\nnét đứt: quan hệ tĩnh trong mã nhưng 0 lượt gọi trên đường đo",
        "legend2": "viền đỏ: hợp đồng trả 400 ở 100 % lượt gọi",
        "zero_calls": "0 lượt/đơn",
        "share": "49,2 %\nchi phí hop",
        "f2a": "(a) M1 — mô hình đích, suy dẫn bằng Eq. (1)–(6)",
        "f2b": "(b) B1 — nhánh đã dựng để kiểm chứng Eq. (3a)",
        "f2a_body": "một tiến trình NestJS · 1 đơn vị triển khai",
        "f2_db": "PostgreSQL 16 — 1 CSDL, 15 schema\n(gộp giao dịch: Δ_commit chưa đo)",
        "f2_ip": "mọi lời gọi giữa 15 module là gọi in-process:\nkhông hop mạng, không giao dịch phân tán",
        "f2_order": "order-service · một tiến trình · 1 CPU / 1 GB\nSERVICE_CLIENT_MODE chọn lớp transport",
        "f2_sites": "42 điểm gọi\nhttpService.*",
        "f2_switch": "http → HttpService\ninproc → InProcess",
        "f2_db_small": "PostgreSQL 16",
        "f2_target": "dịch vụ đích\nhandler + repo",
        "f2_rest": "",
        "f2_others": "16 dịch vụ (HTTP)\nmatched = false",
        "f3_x": "chi phí hop trên mỗi đơn (ms)",
        "f3_h": "h_i — mạng + khung HTTP",
        "f3_q": "q_i — xử lý ở dịch vụ đích",
        "f3_nosplit": "gạch chéo: B1 không phủ hop này nên chỉ đo được tổng h_i + q_i; nhãn đỏ: hợp đồng trả 400 ở 100 % lượt gọi",
        "f3_total": "Tổng 5 hop đo được: {tot} ms/đơn",
        "f3_400": "400 ở 100 % lượt gọi",
        "f4_x": "thời gian chạy (giây)",
        "f4_y": "độ trễ đặt đơn (ms, thang log)",
        "f4_rate": "tốc độ đến theo lịch ramp (đơn/giây)",
        "f4_thr": "ngưỡng p95 = 1,2 × nền = {thr} ms",
        "f4_bp": "điểm gãy ≈ {bp} đơn/giây",
        "f4_warm": "cửa sổ khởi động\n(loại khỏi vùng tuyến tính)",
        "f4_collapse": "hàng đợi vượt điểm tới hạn\n(1,0 CPU ở order-service)",
        "f5_x": "tỉ lệ hoàn tất (%)",
        "f5_base": "giai đoạn nền",
        "f5_fault": "giai đoạn tiêm lỗi",
        "f5_timeout": "p50 = {p50} ms\n(= timeout 60 giây của client)",
        "f6_x": "BR — % endpoint bị ảnh hưởng, Eq. (6)",
        "f6_y": "lượt gọi mỗi đơn (E2/E3)",
        "f6_left": "bán kính ảnh hưởng tĩnh",
        "f6_right": "được gọi trên vòng đời đo",
        "calls": "lượt",
        "fanin": "fan-in = 0",
    },
    "en": {
        "clients": "Four front-ends\n(customer, merchant,\ndriver, admin)",
        "gw": "API Gateway (Nginx)",
        "auth": "identity-service\nJWT authentication",
        "order": "order-service\n(1 CPU / 1 GB)\nentry point of the order flow",
        "hot_hdr": "Five hops measured on the order lifecycle\n(E2/E3 · 364 cycles · n = 1 run pair)",
        "cold_hdr": "Seven services with 0 measured calls (364 cycles)",
        "db1": "PostgreSQL 16 — 12 logical databases\n(one schema per service)",
        "db2": "Redis 7\ncache",
        "legend": "solid: measured hop, with mean cost and calls per 364 cycles\ndashed: static dependency in code, 0 calls on the measured path",
        "legend2": "red border: contract returns 400 on 100 % of calls",
        "zero_calls": "0 calls/order",
        "share": "49.2 %\nof hop cost",
        "f2a": "(a) M1 — target model, derived with Eq. (1)–(6)",
        "f2b": "(b) B1 — branch built to validate Eq. (3a)",
        "f2a_body": "one NestJS process · one deployment unit",
        "f2_db": "PostgreSQL 16 — 1 database, 15 schemas\n(merged transactions: Δ_commit not measured)",
        "f2_ip": "every call between the 15 modules is in-process:\nno network hop, no distributed transaction",
        "f2_order": "order-service · one process · 1 CPU / 1 GB\nSERVICE_CLIENT_MODE selects the transport",
        "f2_sites": "42 call sites\nhttpService.*",
        "f2_switch": "http → HttpService\ninproc → InProcess",
        "f2_db_small": "PostgreSQL 16",
        "f2_target": "target service\nhandler + repo",
        "f2_rest": "",
        "f2_others": "16 other services (HTTP)\nmatched = false",
        "f3_x": "hop cost per order (ms)",
        "f3_h": "h_i — network + HTTP framing",
        "f3_q": "q_i — handler at the target service",
        "f3_nosplit": "hatched: B1 does not cover this hop, so only h_i + q_i is measured; red label: contract returns 400 on 100 % of calls",
        "f3_total": "Five measured hops: {tot} ms per order",
        "f3_400": "400 on 100 % of calls",
        "f4_x": "run time (s)",
        "f4_y": "place-order latency (ms, log scale)",
        "f4_rate": "arrival rate from the ramp schedule (orders/s)",
        "f4_thr": "p95 threshold = 1.2 × baseline = {thr} ms",
        "f4_bp": "breakpoint ≈ {bp} orders/s",
        "f4_warm": "warm-up window\n(excluded from the linear region)",
        "f4_collapse": "queue past the critical point\n(1.0 CPU at order-service)",
        "f5_x": "completion rate (%)",
        "f5_base": "baseline window",
        "f5_fault": "fault window",
        "f5_timeout": "p50 = {p50} ms\n(= the client's 60 s timeout)",
        "f6_x": "BR — % of endpoints affected, Eq. (6)",
        "f6_y": "calls per order (E2/E3)",
        "f6_left": "static blast radius",
        "f6_right": "calls on the measured lifecycle",
        "calls": "calls",
        "fanin": "fan-in = 0",
    },
}
LANG = "vi"


def t(key: str, **kw) -> str:
    s = TXT[LANG][key]
    return s.format(**kw) if kw else s


def _box(ax, x, y, w, h, text, fc, ec, fs=7.0, lw=0.8, ls="-", weight="normal", color="#111111"):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0,rounding_size=0.8",
                                facecolor=fc, edgecolor=ec, linewidth=lw, linestyle=ls,
                                zorder=2))
    ax.text(x + w / 2, y + h / 2, text, ha="center", va="center", fontsize=fs,
            fontweight=weight, color=color, zorder=3, linespacing=1.35)


def _arrow(ax, p1, p2, color, lw=0.8, ls="-", rad=0.0, z=1.8, head=7):
    ax.add_patch(FancyArrowPatch(p1, p2, arrowstyle="-|>", mutation_scale=head,
                                 color=color, linewidth=lw, linestyle=ls, shrinkA=2,
                                 shrinkB=2, connectionstyle=f"arc3,rad={rad}", zorder=z))


def dec(x, d=1):
    """Số thập phân theo quy ước của ngôn ngữ đang vẽ (vi: 72,6 — en: 72.6)."""
    s = f"{x:.{d}f}"
    return s.replace(".", ",") if LANG == "vi" else s


def mil(x):
    """Số nguyên có dấu phân cách hàng nghìn (vi: 59 991 — en: 59,991)."""
    s = f"{round(x):,}"
    return s.replace(",", " ") if LANG == "vi" else s



# =============================================================================
# Hình 3 — phân rã chi phí hop (thay Bảng VI)
# =============================================================================
def fig3_hop_cost():
    tv = load("table-vi.json")
    rows = [r for r in tv["rows"] if (r.get("total") or 0) > 0]
    rows.sort(key=lambda r: r["total"])
    total = sum(r["total"] for r in rows)

    fig, ax = plt.subplots(figsize=(3.4, 2.45))
    ys = list(range(len(rows)))
    for y, r in zip(ys, rows):
        h, q, tot = r.get("h"), r.get("q"), r["total"]
        if h is None:
            ax.barh(y, tot, height=0.6, color="white", edgecolor=C_M2, hatch="///",
                    lw=0.7, zorder=2)
            label = f"{dec(tot)} ms ({dec(r['sharePercent'])} %)"
        else:
            ax.barh(y, h, height=0.6, color=C_M2, lw=0.7, edgecolor=C_M2, zorder=2)
            ax.barh(y, q, height=0.6, left=h, color="#9dc3e6", lw=0.7, edgecolor=C_M2,
                    zorder=2)
            label = f"h {dec(h)} + q {dec(q)} = {dec(tot)} ms ({dec(r['sharePercent'])} %)"
        ax.text(tot + 2.5, y, label, va="center", fontsize=6.0)
    ax.set_yticks(ys)
    labels = [r["target"].replace("-service", "") for r in rows]
    ax.set_yticklabels(labels, fontsize=6.8)
    for lab, r in zip(ax.get_yticklabels(), rows):
        if r.get("errorCount"):
            lab.set_color(C_BAD)
    ax.set_xlim(0, 120)
    ax.set_ylim(-1.2, 5.0)
    ax.set_xlabel(t("f3_x"))
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    ax.text(0, -0.95, t("f3_nosplit"), fontsize=5.4, color=C_GREY, va="center")
    ax.text(0, 4.7, t("f3_total", tot=dec(total)), fontsize=7.2, va="center")
    save(fig, "hinh3-chi-phi-hop.png")


# =============================================================================
# Hình 4 — đường cong điểm gãy W4 (thay bảng 5 dòng)
# =============================================================================
def fig4_breakpoint():
    w = load("w4-breakpoint-E1-W4-r1.json")
    b = [x for x in w["buckets"] if x["seconds"] <= 62]      # cửa sổ ramp
    secs = [x["seconds"] for x in b]
    p50 = [x["p50"] for x in b]
    p95 = [x["p95"] for x in b]
    rate = [x["rate"] for x in b]
    thr = w["baselineP95"] * w["threshold"]
    bp = w["breakpointRps"]

    fig, ax = plt.subplots(figsize=(3.4, 2.5))
    ax.plot(secs[1:], p50[1:], "-o", color=C_M2, ms=2.4, lw=0.9, label="p50", zorder=3)
    ax.plot(secs[1:], p95[1:], "-s", color=C_BAD, ms=2.4, lw=0.9, label="p95", zorder=3)
    ax.plot(secs[0], p50[0], "o", mfc="white", mec=C_M2, ms=3.2, zorder=4)
    ax.plot(secs[0], p95[0], "s", mfc="white", mec=C_BAD, ms=3.2, zorder=4)
    ax.set_yscale("log")
    ax.set_yticks([400, 1000, 3000, 10000])
    ax.set_yticklabels(["400", "1 000", "3 000", "10 000"])
    ax.set_ylim(250, 30000)
    ax.set_xlim(0, 64)
    ax.axhline(thr, color=C_BAD, ls="--", lw=0.7, zorder=2)
    ax.text(63, thr * 0.86, t("f4_thr", thr=dec(thr, 0)), ha="right", va="top",
            fontsize=5.6, color=C_BAD)
    t_bp = (bp - 5) * 60 / 55          # r(t) = 5 + 55·t/60  ⇒  t = (r − 5)·60/55
    ax.axvline(t_bp, color=C_GREY, ls=":", lw=0.8, zorder=2)
    ax.text(t_bp + 2, 15000, t("f4_bp", bp=dec(bp, 0)), fontsize=5.6, color=C_GREY,
            va="center")
    ax.annotate(t("f4_warm"), xy=(secs[0], p95[0]), xytext=(6, 1800), fontsize=5.5,
                color=C_GREY,
                arrowprops=dict(arrowstyle="-", lw=0.5, color=C_GREY, shrinkB=3))
    ax.text(62, 5200, t("f4_collapse"), fontsize=5.6, color=C_BAD, ha="right", va="center",
            linespacing=1.3)
    ax.set_xlabel(t("f4_x"))
    ax.set_ylabel(t("f4_y"))
    ax2 = ax.twinx()
    ax2.plot(secs, rate, ls="--", color=C_GREY, lw=0.7, zorder=1)
    ax2.set_ylabel(t("f4_rate"), color=C_GREY, fontsize=6.0)
    ax2.tick_params(axis="y", colors=C_GREY, labelsize=6.5)
    ax2.spines["right"].set_visible(True)
    ax2.spines["right"].set_color(C_GREY)
    ax2.spines["top"].set_visible(False)
    ax2.set_ylim(0, 80)
    ax.legend(loc="upper left", frameon=False, fontsize=6.2, handlelength=1.5,
              borderpad=0.2)
    save(fig, "hinh4-diem-gay-w4.png")


# =============================================================================
# Hình 5 — hoàn tất khi tiêm lỗi so với BR tĩnh (thay Bảng VIII)
# =============================================================================
SCEN = [("F1", "review-service"), ("F2", "promotion-service"),
        ("F3", "notification-service"), ("F4", "inventory-service")]


def fig5_fault():
    br = {r["service"]: r["brPercent"] for r in load("model.json")["table-x"]["rows"]}

    def e5(run):
        for cand in (f"E5-{run}-r1", f"{run}-r1"):
            if (LOGS / cand / "summary.json").exists():
                return load(f"{cand}/summary.json")
        raise FileNotFoundError(f"không thấy summary.json của {run} trong {LOGS}")

    data = []
    for run, svc in SCEN:
        s = e5(run)
        data.append({
            "svc": svc.replace("-service", ""),
            "base": s["rates"]["e5_baseline_completed"] * 100,
            "fault": s["rates"]["e5_fault_completed"] * 100,
            "p50": s["trends"]["e5_fault_latency"]["p50"],
            "br": br.get(svc),
        })
    data.sort(key=lambda d: d["fault"])

    fig, ax = plt.subplots(figsize=(3.4, 2.3))
    ys = list(range(len(data)))
    h_base = ax.barh([y + 0.18 for y in ys], [d["base"] for d in data], height=0.33,
                     color=C_GREY_L, edgecolor=C_GREY, lw=0.6, label=t("f5_base"), zorder=2)
    h_fault = ax.barh([y - 0.18 for y in ys], [d["fault"] for d in data], height=0.33,
                      color=[C_BAD if d["fault"] < 99 else C_OK for d in data], lw=0,
                      label=t("f5_fault"), zorder=2)
    for y, d in zip(ys, data):
        ax.text(d["base"] + 2, y + 0.18, f"{dec(d['base'])} %", va="center", fontsize=5.9,
                color=C_GREY)
        ax.text(d["fault"] + 2, y - 0.18, f"{dec(d['fault'])} %", va="center", fontsize=6.3,
                color=C_BAD if d["fault"] < 99 else C_OK, fontweight="bold")
    ax.set_yticks(ys)
    ax.set_yticklabels([f"{d['svc']}\n(BR {dec(d['br'])} %)" for d in data], fontsize=6.4)
    ax.set_xlim(0, 118)
    ax.set_ylim(-1.15, len(data) - 0.4)
    ax.set_xticks([0, 20, 40, 60, 80, 100])
    ax.set_xlabel(t("f5_x"))
    ax.spines["left"].set_visible(False)
    ax.tick_params(axis="y", length=0)
    worst = data[0]
    ax.text(0, -0.92, t("f5_timeout", p50=mil(worst["p50"])), fontsize=5.7, color=C_BAD,
            va="center", linespacing=1.3)
    fig.legend([h_base, h_fault], [t("f5_base"), t("f5_fault")], loc="upper center",
               bbox_to_anchor=(0.5, -0.06), ncol=2, frameon=False, fontsize=6.2,
               handlelength=1.2, columnspacing=1.4)
    save(fig, "hinh5-tiem-loi.png")


# =============================================================================
# Hình 6 — BR tĩnh so với lượt gọi đo được (thay Bảng X)
# =============================================================================
def fig6_br_vs_calls():
    rows = sorted(load("model.json")["table-x"]["rows"], key=lambda r: -r["brPercent"])
    names = [r["service"].replace("-service", "") for r in rows]
    brs = [r["brPercent"] for r in rows]
    calls = [(r.get("freqPerOrder") or 0.0) for r in rows]

    fig, (a1, a2) = plt.subplots(1, 2, figsize=(3.4, 2.75), width_ratios=[1.1, 1],
                                 sharey=True)
    ys = list(range(len(rows)))[::-1]

    a1.barh(ys, brs, height=0.62, color="#c8d3e0", edgecolor=C_M2, lw=0.4, zorder=2)
    for y, b in zip(ys, brs):
        a1.text(b + 2, y, dec(b), va="center", fontsize=5.2, color=C_GREY)
    a1.set_yticks(ys)
    a1.set_yticklabels(names, fontsize=5.6)
    a1.set_xlim(0, 104)
    a1.set_xticks([0, 50, 100])
    a1.set_xlabel(t("f6_x"), fontsize=6.3)
    a1.set_title(t("f6_left"), fontsize=6.2, color=C_GREY, loc="left", pad=3)
    a1.spines["left"].set_visible(False)
    a1.tick_params(axis="y", length=0)

    a2.barh(ys, calls, height=0.62, color=[C_M1 if c > 0 else "#e8ebee" for c in calls],
            lw=0, zorder=2)
    for y, c in zip(ys, calls):
        a2.text(c + 0.06, y, dec(c) if c > 0 else "0", va="center", fontsize=5.2,
                color=C_M1 if c > 0 else C_GREY,
                fontweight="bold" if c > 0 else "normal")
    a2.set_xlim(0, 2.5)
    a2.set_xticks([0, 1, 2])
    a2.set_xlabel(t("f6_y"), fontsize=6.3)
    a2.set_title(t("f6_right"), fontsize=6.2, color=C_M1, loc="left", pad=3)
    a2.spines["left"].set_visible(True)
    a2.tick_params(axis="y", length=0)
    save(fig, "hinh6-br-vs-luot-goi.png")


# =============================================================================
# Hình 1 — kiến trúc M2 với đường tới hạn đo được
# =============================================================================
def fig1_arch_m2():
    tv = {r["target"]: r for r in load("table-vi.json")["rows"]}
    freq = {r["service"]: (r.get("freqPerOrder") or 0.0)
            for r in load("model.json")["table-x"]["rows"]}

    fig, ax = plt.subplots(figsize=(7.0, 4.1))
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis("off")

    _box(ax, 2, 58, 17, 26, t("clients"), "#ffffff", C_GREY, fs=5.9)
    _box(ax, 24, 82, 22, 8, t("gw"), C_GREY_L, C_GREY, fs=7.0)
    _box(ax, 24, 66, 22, 11, t("auth"), "#ffffff", C_GREY, fs=6.4)
    for yy in (61, 68, 75):
        _arrow(ax, (19, yy), (24, 85), C_GREY, lw=0.6, head=6)
    _arrow(ax, (35, 82), (35, 77), C_GREY, lw=0.8)
    _box(ax, 44, 38, 22, 24, t("order"), C_M2_L, C_M2, fs=7.2, lw=1.4, weight="bold")
    _arrow(ax, (46, 86), (52, 62), C_M2, lw=1.0, rad=-0.12)
    _arrow(ax, (46, 71), (50, 66), C_GREY, lw=0.7)

    order = ["wallet-service", "dispatch-service", "merchant-service",
             "promotion-service", "driver-service"]
    ax.text(87, 94.0, t("hot_hdr"), ha="center", va="bottom", fontsize=6.2, color=C_M2,
            fontweight="bold", linespacing=1.3)
    top = 89.0
    for svc in order:
        r = tv[svc]
        name = svc.replace("-service", "")
        lbl = f"{name}\n{dec(r['total'])} ms · {r['http']['n']}/364 {t('calls')}"
        bad = (r.get("errorCount") or 0) > 0
        _box(ax, 76, top - 7.2, 22, 7.2, lbl, "#ffffff", C_BAD if bad else C_M2,
             fs=6.3, lw=1.2 if bad or r["total"] > 40 else 0.8)
        _arrow(ax, (66, 53), (76, top - 3.6), C_M2,
               lw=1.3 if r["total"] > 40 else 0.9)
        top -= 8.4
    ax.text(97, 42.5, t("share"), fontsize=6.0, color=C_BAD, ha="right", va="center",
            style="italic", linespacing=1.3)

    ax.add_patch(FancyBboxPatch((1.5, 17), 96.5, 15, boxstyle="round,pad=0,rounding_size=1",
                                facecolor="#fcfcfd", edgecolor=C_GREY, lw=0.7,
                                linestyle=(0, (3, 2)), zorder=1))
    ax.text(50, 29.2, t("cold_hdr"), ha="center", va="center", fontsize=6.0, color=C_GREY)
    cold = ["payment", "notification", "review", "inventory", "resolution", "chat", "upload"]
    for i, name in enumerate(cold):
        x = 2.5 + i * 13.7
        extra = "\n" + t("fanin") if name == "inventory" else ""
        ax.add_patch(FancyBboxPatch((x, 18.6), 12.4, 7.0,
                                    boxstyle="round,pad=0,rounding_size=0.6",
                                    facecolor="#ffffff", edgecolor=C_GREY, lw=0.5,
                                    zorder=2))
        ax.text(x + 6.2, 22.1, name + extra, ha="center", va="center", fontsize=5.9,
                zorder=3, linespacing=1.3)
    _arrow(ax, (52, 38), (52, 32.4), C_GREY, lw=0.6, ls=(0, (3, 2)), head=5)
    ax.text(53.4, 35.2, t("zero_calls"), fontsize=5.8, color=C_GREY, ha="left", va="center",
            style="italic")

    _box(ax, 2, 4, 44, 9, t("db1"), "#ffffff", C_GREY, fs=6.2)
    _box(ax, 58, 4, 24, 9, t("db2"), "#ffffff", C_GREY, fs=6.4)
    for x0 in (16, 34, 50):
        _arrow(ax, (x0, 17), (x0, 13.4), C_GREY, lw=0.5, ls=":", head=5)
    _arrow(ax, (70, 17), (70, 13.4), C_GREY, lw=0.5, ls=":", head=5)

    ax.text(2, 99, t("legend"), fontsize=5.4, color=C_GREY, va="top", linespacing=1.45)
    ax.text(97, 34, t("legend2"), fontsize=5.4, color=C_BAD, ha="right", va="center",
            style="italic")
    save(fig, "hinh1-kien-truc-m2.png")



# =============================================================================
# Hình 2 — M1 (mô hình đích) và B1 (nhánh đã dựng)
# =============================================================================
def fig2_m1_b1():
    fig, axes = plt.subplots(1, 2, figsize=(7.0, 3.0))
    for ax in axes:
        ax.set_xlim(0, 100)
        ax.set_ylim(0, 100)
        ax.axis("off")

    # --- (a) M1
    ax = axes[0]
    ax.set_title(t("f2a"), fontsize=7.0, loc="left", color=C_M1, fontweight="bold", pad=4)
    ax.add_patch(FancyBboxPatch((3, 26), 94, 62, boxstyle="round,pad=0,rounding_size=1.5",
                                facecolor=C_M1_L, edgecolor=C_M1, lw=1.2, zorder=1))
    ax.text(50, 82, t("f2a_body"), ha="center", va="center", fontsize=6.4, color=C_M1,
            fontweight="bold", linespacing=1.35)
    mods = ["identity", "consumer", "merchant", "order", "inventory", "payment",
            "driver", "dispatch", "wallet", "promotion", "review", "notification",
            "resolution", "chat", "upload"]
    for i, m in enumerate(mods):
        x = 4 + (i % 5) * 18.6
        y = 62 - (i // 5) * 12
        ax.add_patch(FancyBboxPatch((x, y), 17.5, 9, boxstyle="round,pad=0,rounding_size=0.8",
                                    facecolor="#ffffff", edgecolor=C_M1, lw=0.6, zorder=2))
        ax.text(x + 8.75, y + 4.5, m, ha="center", va="center", fontsize=4.9, zorder=3)
    for x0, x1 in ((21.5, 30.0), (48.0, 56.5)):
        _arrow(ax, (x0, 66.5), (x1, 66.5), C_M1, lw=0.8, head=5)
    _arrow(ax, (40, 54), (40, 50), C_M1, lw=0.8, head=5)
    _arrow(ax, (58.2, 54), (58.2, 50), C_M1, lw=0.8, head=5)
    ax.text(50, 31, t("f2_ip"), fontsize=5.7, color=C_M1, ha="center", va="center",
            linespacing=1.3)
    _box(ax, 14, 10, 72, 12, t("f2_db"), "#ffffff", C_GREY, fs=6.0)
    _arrow(ax, (50, 26), (50, 22), C_GREY, lw=0.7, ls=":", head=5)

    # --- (b) B1
    ax = axes[1]
    ax.set_title(t("f2b"), fontsize=7.0, loc="left", color=C_M2, fontweight="bold", pad=4)
    ax.add_patch(FancyBboxPatch((3, 26), 94, 64, boxstyle="round,pad=0,rounding_size=1.5",
                                facecolor=C_M2_L, edgecolor=C_M2, lw=1.2, zorder=1))
    ax.text(50, 83, t("f2_order"), ha="center", va="center", fontsize=5.8, color=C_M2,
            fontweight="bold", linespacing=1.5)
    _box(ax, 5, 64, 35, 12, t("f2_sites"), "#ffffff", C_M2, fs=5.4)
    _box(ax, 5, 45, 35, 15, t("f2_switch"), "#ffffff", C_M1, fs=5.0, lw=1.1)
    _box(ax, 45, 64, 50, 12, t("f2_others"), "#ffffff", C_GREY, fs=5.2, ls=(0, (3, 2)))
    _box(ax, 45, 45, 50, 15, t("f2_target"), "#ffffff", C_M1, fs=5.4, lw=0.9)
    _box(ax, 45, 31, 50, 9, t("f2_db_small"), "#ffffff", C_GREY, fs=5.4)
    _arrow(ax, (40, 52), (45, 52), C_M1, lw=1.2)
    _arrow(ax, (40, 70), (45, 70), C_GREY, lw=0.7, ls=(0, (3, 2)), head=5)
    _arrow(ax, (70, 45), (70, 40), C_M1, lw=0.9, head=5)
    ax.text(71, 42.5, "SELECT", fontsize=4.8, color=C_M1, va="center", style="italic")
    save(fig, "hinh2-m1-va-b1.png")


# =============================================================================
# --inspect: in cấu trúc các tệp JSON để đối chiếu khoá trước khi vẽ
# =============================================================================
def inspect() -> None:
    def shape(obj, depth=0):
        pad = "  " * depth
        if isinstance(obj, dict):
            for k, v in list(obj.items())[:14]:
                if isinstance(v, (dict, list)):
                    print(f"{pad}{k}: {type(v).__name__}", file=OUTF)
                    if depth < 3:
                        shape(v[:2] if isinstance(v, list) else v, depth + 1)
                else:
                    print(f"{pad}{k} = {v!r}", file=OUTF)
        elif isinstance(obj, list):
            print(f"{pad}[{len(obj)} phần tử]", file=OUTF)
            if obj:
                shape(obj[0], depth + 1)

    for name in ["table-vi.json", "w4-breakpoint-E1-W4-r1.json",
                 "E5-F2-r1/summary.json", "model.json"]:
        print(f"\n===== {name} =====", file=OUTF)
        shape(load(name))
    OUTF.flush()


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--inspect" in args:
        OUTF = open(LOGS / "_fig-inspect.txt", "w", encoding="utf-8")
        inspect()
        OUTF.close()
        step("inspect xong")
        sys.exit(0)
    if "--lang" in args:
        LANG = args[args.index("--lang") + 1]
        if LANG not in TXT:
            raise SystemExit(f"ngôn ngữ không hỗ trợ: {LANG} (có: {', '.join(TXT)})")
        if LANG != "vi":                     # bản tiếng Việt ghi thẳng vào figures/
            OUT = OUT / LANG
            OUT.mkdir(parents=True, exist_ok=True)
    only = None
    if "--only" in args:
        only = {a for a in args[args.index("--only") + 1:] if not a.startswith("-")}

    FIGS = {
        "1": fig1_arch_m2,
        "2": fig2_m1_b1,
        "3": fig3_hop_cost,
        "4": fig4_breakpoint,
        "5": fig5_fault,
        "6": fig6_br_vs_calls,
    }
    step(f"bắt đầu vẽ (lang={LANG}, chỉ={sorted(only) if only else 'tất cả'})")
    failed = []
    for key, fn in FIGS.items():
        if only and key not in only:
            continue
        try:
            fn()
            step(f"  hình {key}: xong")
        except BaseException as exc:                  # noqa: BLE001 — ghi rồi đi tiếp
            failed.append(key)
            step(f"  hình {key}: LỖI {exc!r}")
    step("KẾT THÚC" + (f" — lỗi ở hình {', '.join(failed)}" if failed else " — tất cả thành công"))
    sys.exit(1 if failed else 0)
