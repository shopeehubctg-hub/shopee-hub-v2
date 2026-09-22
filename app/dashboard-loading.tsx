import "./dashboard-loading.css";

export function DashboardLoading() {
  return <main className="hub-loading" aria-busy="true" aria-label="Loading your dashboard">
    <div className="hub-loading-content">
      <div className="hub-loading-motion" aria-hidden="true">
        <div className="hub-loading-track" />
        <div className="hub-loading-orbit"><span /></div>
        <div className="hub-loading-orbit hub-loading-orbit-secondary"><span /></div>
        <div className="hub-loading-core"><i /><i /><i /><i /></div>
      </div>
      <img className="hub-loading-logo" src="/shopee-hub-logo-transparent.png" alt="ShopeeHub" />
      <p role="status">A little sync. A clearer picture.</p>
      <div className="hub-loading-line" aria-hidden="true"><span /></div>
    </div>
    <span className="hub-loading-caption">YOUR STORES. IN SYNC.</span>
  </main>;
}
