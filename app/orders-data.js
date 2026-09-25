/**
 * Order information is available only when the selected store has an order
 * snapshot. Other dashboard data and bundled layout examples are not orders.
 */
export function getOrdersData(snapshot) {
  const payload = snapshot?.payload;
  const hasOrders = Array.isArray(payload?.orders);
  const hasSummary = payload?.orderSummary != null && typeof payload.orderSummary === "object";
  const hasData = hasOrders || hasSummary;

  return {
    hasData,
    orders: hasOrders ? payload.orders : [],
    summary: hasSummary ? payload.orderSummary : null,
    updatedAt: hasData ? (payload.sourceUpdated || snapshot.importedAt || null) : null,
  };
}
