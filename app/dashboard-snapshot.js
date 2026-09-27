export function withoutAdCampaigns(snapshot, canViewAdvertising = true) {
  if (!snapshot?.payload || typeof snapshot.payload !== "object") return snapshot;
  const { adCampaigns, advertising, ...payload } = snapshot.payload;
  return { ...snapshot, payload: canViewAdvertising && "advertising" in snapshot.payload ? { ...payload, advertising } : payload };
}
