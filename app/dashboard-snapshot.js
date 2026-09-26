export function withoutAdCampaigns(snapshot) {
  if (!snapshot?.payload || typeof snapshot.payload !== "object") return snapshot;
  const { adCampaigns, ...payload } = snapshot.payload;
  return { ...snapshot, payload };
}
