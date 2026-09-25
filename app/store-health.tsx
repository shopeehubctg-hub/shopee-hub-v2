export function StoreHealth() {
  return (
    <div className="page">
      <div className="page-title">
        <div>
          <p className="kicker">STORE HEALTH</p>
          <h2>Reputation &amp; compliance</h2>
        </div>
      </div>
      <article className="card" role="status">
        <h3>暂无店铺健康数据</h3>
        <p>目前未接入可核验的店铺健康数据源。评分、服务表现和违规记录将在数据接入并同步后显示。</p>
      </article>
    </div>
  );
}
