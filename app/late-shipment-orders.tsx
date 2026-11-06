"use client";

import { useEffect, useState } from "react";

type ShipmentOrder = { key: string; orderNo: string; storeName: string; expiresAt: string | null };
type Result = { orders: ShipmentOrder[] } | { error: true };
const deadline = new Intl.DateTimeFormat("en-MY", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kuala_Lumpur",
});

export function LateShipmentOrders({ storeId }: { storeId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [retry, setRetry] = useState(0);

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
    <header className="page-title"><div><p className="kicker">ORDERS & INVENTORY</p><h2>Late Shipment</h2></div></header>
    {result === null ? <div className="card" role="status">Loading orders…</div>
      : "error" in result ? <div className="card" role="alert">
        <p>Unable to load orders.</p>
        <button type="button" onClick={() => { setResult(null); setRetry(value => value + 1); }}>Try again</button>
      </div>
      : result.orders.length === 0 ? <div className="card" role="status">No orders need attention.</div>
      : <div className="card table-card" role="region" aria-label="Late Shipment orders" tabIndex={0}>
        <table>
          <thead><tr><th scope="col">Order</th><th scope="col">Store</th><th scope="col">Ship by (MYT)</th></tr></thead>
          <tbody>{result.orders.map(order => <tr key={order.key}>
            <th scope="row">{order.orderNo}</th>
            <td>{order.storeName}</td>
            <td>{order.expiresAt ? <time dateTime={order.expiresAt}>{deadline.format(new Date(order.expiresAt))}</time> : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
