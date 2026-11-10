"use client";

import { useEffect, useState } from "react";
import { malaysiaDate } from "./ad-balance-validation.js";

type ShipmentOrder = { key: string; orderNo: string; storeId: string; storeName: string; expiresAt: string | null };
type Result = { orders: ShipmentOrder[]; importDate: string | null } | { error: true };
const deadline = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur",
});
const batchDate = new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeZone: "UTC" });

export function LateShipmentOrders({ storeId, canPreview = false }: { storeId: string; canPreview?: boolean }) {
  const [preview, setPreview] = useState(false);
  const showingExamples = canPreview && preview;
  const [mode, setMode] = useState<"today" | "latest">("today");
  const allStores = !storeId || storeId === "all";

  return <section className="page">
    <header className="page-title">
      <div><p className="kicker">ORDERS & INVENTORY</p><h2>Late Shipment</h2></div>
      <div role="group" aria-label="Late Shipment date">
        <button type="button" aria-pressed={mode === "today"} onClick={() => setMode("today")}>Today</button>
        <button type="button" aria-pressed={mode === "latest"} onClick={() => setMode("latest")}>Latest import</button>
        {canPreview && <button type="button" aria-pressed={showingExamples} onClick={() => setPreview(value => !value)}>
          {showingExamples ? "Back to imported orders" : "Preview example orders"}
        </button>}
      </div>
    </header>
    {showingExamples ? <>
      <p className="card" role="status"><strong>Staging example.</strong> These are sample orders.</p>
      <ShipmentTable mode="today" allStores={allStores} result={{ importDate: null, orders: [
        { key: "demo-1", storeId: "demo-a", orderNo: "DEMO-001", storeName: "Example Store A", expiresAt: `${malaysiaDate()}T12:00:00+08:00` },
        { key: "demo-2", storeId: "demo-b", orderNo: "DEMO-002", storeName: "Example Store B", expiresAt: `${malaysiaDate()}T16:30:00+08:00` },
      ] }} />
    </> : <ShipmentResults key={JSON.stringify([storeId, mode])} storeId={storeId || "all"} mode={mode} allStores={allStores} />}
  </section>;
}

function ShipmentResults({ storeId, mode, allStores }: {
  storeId: string; mode: "today" | "latest"; allStores: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ storeId, mode });
    fetch(`/api/late-shipment-orders?${query}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw Error("Unable to load orders");
        const data: Result = await response.json();
        if (!controller.signal.aborted) setResult(data);
      }).catch(() => {
        if (!controller.signal.aborted) setResult({ error: true });
      });
    return () => controller.abort();
  }, [storeId, mode, retry]);

  if (result === null) return <div className="card" role="status">Loading orders…</div>;
  if ("error" in result) return <div className="card" role="alert">
    <p>Unable to load orders.</p>
    <button type="button" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Try again</button>
  </div>;
  if (!result.orders.length) return <div className="card" role="status">
    {mode === "today" ? "No orders need attention today." : "No orders for your stores in the latest import."}
  </div>;

  return <ShipmentTable result={result} mode={mode} allStores={allStores} />;
}

function ShipmentTable({ result, mode, allStores }: {
  result: Exclude<Result, { error: true }>; mode: "today" | "latest"; allStores: boolean;
}) {
  const groups = new Map<string, ShipmentOrder[]>();
  for (const order of result.orders) {
    const group = groups.get(order.storeId);
    if (group) group.push(order);
    else groups.set(order.storeId, [order]);
  }

  return <div className="card table-card" role="region" aria-label="Late Shipment orders" tabIndex={0}>
    <p role="status">
      {result.orders.length} orders{allStores && ` across ${groups.size} stores`}
      {result.importDate && <> · Batch dated <time dateTime={result.importDate}>{batchDate.format(new Date(result.importDate))}</time></>}
    </p>
    {mode === "latest" && <p>Imported snapshot. Check the platform for current shipment status.</p>}
    <table>
      <thead><tr><th scope="col">Order</th><th scope="col">Ship by (MYT)</th></tr></thead>
      {Array.from(groups, ([id, orders]) => <tbody key={id}>
        {allStores && <tr><th scope="rowgroup" colSpan={2}>{orders[0].storeName} · {orders.length} orders</th></tr>}
        {orders.map(order => <tr key={order.key}>
          <th scope="row">{order.orderNo}</th>
          <td>{order.expiresAt ? <time dateTime={order.expiresAt}>{deadline.format(new Date(order.expiresAt))}</time> : "—"}</td>
        </tr>)}
      </tbody>)}
    </table>
  </div>;
}
