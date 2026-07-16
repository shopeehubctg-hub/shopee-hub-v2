"use client";

import { useState } from "react";

const pilotPayload = {
  tenant: { id: "j-packaging", name: "J Packaging", customerEmail: "shopeehub.ctg@gmail.com" },
  store: { id: "j-packaging-shopee", name: "J Packaging", bigSellerName: "J Packaging" },
  period: { start: "2026-06-17", end: "2026-07-16" },
  dashboard: {
    summary: "最近 30 天完成 654 个有效订单，实际有效商品销售额 RM18,711.82。我们持续监控取消、退款和热销商品，优先保护成交与库存机会。",
    salesTotal: "RM 18,711.82",
    attributedValue: "RM 19,221.18",
    actionCount: 3,
    metrics: [
      { label: "有效商品销售额", value: "RM 18,711.82", change: "+21.40%", note: "较前一周期" },
      { label: "有效订单", value: "654", change: "+20.66%", note: "最近 30 天" },
      { label: "退款金额", value: "RM 44.26", change: "0.24%", note: "占有效销售额" },
      { label: "有效销售数量", value: "23,617", change: "+14.53%", note: "件商品" },
    ],
    products: [
      ["JP-ZBPB-20x12x7", "Pizza Box 20 × 12 × 7cm", "RM 658.60", "15", "1,066 件"],
      ["JP-Tray-60x35x10", "Corrugated Tray 60 × 35 × 10cm", "RM 581.65", "21", "326 件"],
      ["JP-PizzaA4Carton-32x23x8", "Pizza Box A4", "RM 455.15", "32", "364 件"],
      ["JP-PBCB-27x23x9.5", "Pizza Box 27 × 23 × 9.5cm", "RM 294.84", "8", "202 件"],
    ],
  },
  actions: [
    { date: "2026-07-16", category: "数据监控", title: "完成 30 天经营复盘", detail: "核对订单、有效销售、取消与退款口径，并整理客户可读报告。", impact: "经营数据透明可追踪" },
    { date: "2026-07-16", category: "商品", title: "识别高贡献商品", detail: "定位销售额和销量领先的包装 SKU，作为库存与推广优先级依据。", impact: "保护热销商品成交" },
    { date: "2026-07-16", category: "风险", title: "监控退款与取消", detail: "退款金额 RM44.26，并标记取消金额较高的商品供后续处理。", impact: "降低销售流失风险" },
  ],
};

export default function AdminImportPage() {
  const [payload, setPayload] = useState(JSON.stringify(pilotPayload, null, 2));
  const [status, setStatus] = useState("");

  async function importData() {
    setStatus("正在更新…");
    try {
      const response = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "更新失败");
      setStatus("更新完成。客户 Dashboard 已使用最新数据。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "更新失败");
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "40px auto", padding: 24, fontFamily: "Arial, sans-serif" }}>
      <p style={{ color: "#6b7280", letterSpacing: 1 }}>NORTHSTAR 管理员工具</p>
      <h1>Shopee Hub 数据更新</h1>
      <p>确认店铺、客户邮箱和日期后，点击一次即可写入该客户的私人 Dashboard。</p>
      <textarea aria-label="导入数据" value={payload} onChange={(event) => setPayload(event.target.value)} style={{ width: "100%", minHeight: 520, padding: 16, border: "1px solid #d1d5db", borderRadius: 12, fontFamily: "monospace" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
        <button onClick={importData} style={{ background: "#111827", color: "white", border: 0, borderRadius: 10, padding: "12px 22px", fontWeight: 700, cursor: "pointer" }}>更新客户 Dashboard</button>
        <span>{status}</span>
      </div>
    </main>
  );
}
