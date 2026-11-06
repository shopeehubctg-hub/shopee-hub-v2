"use client";

import { useEffect, useState } from "react";
import { malaysiaDate } from "./ad-balance-validation.js";

type ShipmentOrder = { key: string; orderNo: string; storeName: string; expiresAt: string | null };
type Result = { orders: ShipmentOrder[] } | { error: true };
const deadline = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur",
});

function exampleOrders(): ShipmentOrder[] {
  const today = malaysiaDate();
  return [
    { key: "demo-1", orderNo: "DEMO-001", storeName: "Example Store A", expiresAt: `${today}T12:00:00+08:00` },
    { key: "demo-2", orderNo: "DEMO-002", storeName: "Example Store B", expiresAt: `${today}T16:30:00+08:00` },
  ];
}

export function LateShipmentOrders({ storeId, canPreview = false }: { storeId: string; canPreview?: boolean }) {
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);
  const [examples, setExamples] = useState<ShipmentOrder[] | null>(null);
  const showingExamples = canPreview && examples !== null;
  const displayed = showingExamples ? { orders: examples } : result;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/late-shipment-orders?storeId=${encodeURIComponent(storeId || "all")}`, {
      cache: "no-store",
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw Error("Unable to load orders");
      const data: { orders: ShipmentOrder[] } = await response.json();
      if (!controller.signal.aborted) setResult(data);
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ error: true });
    });
    return () => controller.abort();
  }, [storeId, retry]);

  return <section className="page">
    <header className="page-title"><div><p className="kicker">ORDERS & INVENTORY</p><h2>Late Shipment</h2></div>
      {canPreview && <button type="button" onClick={() => setExamples(showingExamples ? null : exampleOrders())}>
        {showingExamples ? "Back to today’s orders" : "Preview example orders"}
      </button>}
    </header>
    {showingExamples && <p className="card" role="status"><strong>Staging example.</strong> These are sample orders.</p>}
    {displayed === null ? <div className="card" role="status">Loading orders…</div>
      : "error" in displayed ? <div className="card" role="alert">
        <p>Unable to load orders.</p>
        <button type="button" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Try again</button>
      </div>
      : displayed.orders.length === 0 ? <div className="card" role="status">No orders need attention.</div>
      : <div className="card table-card" role="region" aria-label="Late Shipment orders" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Order</th><th scope="col">Store</th><th scope="col">Ship by (MYT)</th></tr></thead>
          <tbody>{displayed.orders.map(order => <tr key={order.key}>
            <th scope="row">{order.orderNo}</th>
            <td>{order.storeName}</td>
            <td>{order.expiresAt ? <time dateTime={order.expiresAt}>{deadline.format(new Date(order.expiresAt))}</time> : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
