"use client";

import { useMemo, useState } from "react";
import { calculateShopeePrice, COMMISSION_CATEGORIES, commissionRateFor, SERVICE_MODES } from "./price-calculator-model";

type PackageRow = { id:number; name:string; facebookPrice:number };
type ServiceMode = keyof typeof SERVICE_MODES;
type FeeSettings = {
  transaction:number; commission:number; service:number; serviceCap:number;
  preorder:number; isPreorder:boolean; platformSupport:number;
  shopeeVoucher:number; sellerVoucher:number; cofundVoucher:number;
  sellerShipping:number; facebookShipping:number; extraProfit:number;
};

const INITIAL_PACKAGES:PackageRow[] = [
  { id:1, name:"Package A", facebookPrice:289 },
  { id:2, name:"Package B", facebookPrice:358 },
  { id:3, name:"Package C", facebookPrice:716 },
];
const money = (value:number) => `RM ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
const pct = (value:number) => `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
const positive = (value:string) => Math.max(0, Number(value) || 0);

export function PriceCalculator() {
  const [packages,setPackages] = useState(INITIAL_PACKAGES);
  const [category,setCategory] = useState<string>("28");
  const [onCashback,setOnCashback] = useState(true);
  const [customCommission,setCustomCommission] = useState(12.96);
  const [serviceMode,setServiceMode] = useState<ServiceMode>("nonCampaign");
  const [showAdvanced,setShowAdvanced] = useState(false);
  const commission = commissionRateFor(category,onCashback,customCommission);
  const [fees,setFees] = useState<Omit<FeeSettings,"commission"|"service">>({
    transaction:3.78, serviceCap:108, preorder:2.14, isPreorder:false, platformSupport:0.54,
    shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:0,
  });
  const activeFees:FeeSettings = {...fees,commission,service:SERVICE_MODES[serviceMode].rate};
  const calculations = useMemo(()=>packages.map(row=>({row,result:calculateShopeePrice(row,activeFees)})),[packages,activeFees]);
  const headlineRate = fees.transaction + commission + SERVICE_MODES[serviceMode].rate + (fees.isPreorder?fees.preorder:0);

  function updateFee(key:keyof typeof fees, value:string|boolean) {
    setFees(current=>({...current,[key]:typeof value==="boolean"?value:positive(value)}));
  }
  function updatePackage(id:number, key:"name"|"facebookPrice", value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,[key]:key==="facebookPrice"?positive(value):value}:row));
  }
  function addPackage() {
    setPackages(current=>[...current,{id:Math.max(0,...current.map(row=>row.id))+1,name:`Package ${String.fromCharCode(65+current.length)}`,facebookPrice:0}]);
  }

  return <div className="price-calculator">
    <section className="calculator-hero">
      <div><p className="kicker">SHOPEE MY · MARKUP CALCULATOR</p><h2>配套卖价倒推计算机</h2><p>选择商品分类与收费情境，再输入 Facebook 售价；系统会倒推保护利润所需的 Shopee 卖价。</p></div>
      <div className="calculator-hero-result"><span>当前最高百分比收费</span><strong>{pct(headlineRate)}</strong><small>Service Fee 达 RM108 后会停止增加</small></div>
    </section>

    <section className="calculator-primary card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 1 · YOUR SHOPEE SETUP</p><h3>选择 Product Category 与收费情境</h3></div><span>Commission rate effective 21 May 2026 · 已包含 8% SST</span></div>
      <div className="primary-fields">
        <label>Product Category
          <select value={category} onChange={event=>setCategory(event.target.value)}>
            {[...new Set(COMMISSION_CATEGORIES.map(item=>item.cluster))].map(cluster=><optgroup label={cluster} key={cluster}>
              {COMMISSION_CATEGORIES.map((item,index)=>item.cluster===cluster&&<option value={index} key={`${cluster}-${item.name}`}>{item.name}</option>)}
            </optgroup>)}
            <option value="custom">Custom / 特殊 Sub-category</option>
          </select>
        </label>
        <label>Cashback Programme
          <select value={onCashback?"yes":"no"} onChange={event=>setOnCashback(event.target.value==="yes")}>
            <option value="yes">Seller ON Cashback Programme</option>
            <option value="no">Seller NOT on Cashback Programme</option>
          </select>
        </label>
        {category==="custom"&&<label>Custom Commission Fee (%)<input type="number" step=".01" value={customCommission} onChange={event=>setCustomCommission(positive(event.target.value))}/></label>}
        <label>Service Fee Scenario
          <select value={serviceMode} onChange={event=>setServiceMode(event.target.value as ServiceMode)}>
            <option value="nonCampaign">Non-Campaign Day · 5.94%</option>
            <option value="campaign">Campaign Day · 8.10%</option>
            <option value="none">No campaign service fee · 0%</option>
          </select>
        </label>
        <label className="preorder-toggle"><input type="checkbox" checked={fees.isPreorder} onChange={event=>updateFee("isPreorder",event.target.checked)}/><span><b>Pre-Order listing</b><small>额外 {pct(fees.preorder)}</small></span></label>
      </div>
    </section>

    <section className="fee-strip">
      <article><span>Transaction Fee</span><strong>3.78%</strong><small>Default</small></article>
      <article><span>Commission Fee</span><strong>{pct(commission)}</strong><small>Category + Cashback + SST</small></article>
      <article><span>Service Fee</span><strong>{pct(SERVICE_MODES[serviceMode].rate)}</strong><small>Capped at RM108</small></article>
      <article><span>Pre-Order Service Fee</span><strong>{fees.isPreorder?pct(fees.preorder):"OFF"}</strong><small>Default 2.14%</small></article>
      <article className="fee-total"><span>Platform Support Fee</span><strong>RM 0.54</strong><small>Per order</small></article>
    </section>

    <section className="calculator-settings card">
      <button className="advanced-toggle" onClick={()=>setShowAdvanced(value=>!value)}>{showAdvanced?"隐藏 Voucher 与运费设定":"显示 Voucher、运费与额外利润设定"}</button>
      {showAdvanced&&<div className="fee-fields advanced-fields">
        <label>Shopee Voucher Discount (%)<input type="number" step=".01" value={fees.shopeeVoucher} onChange={event=>updateFee("shopeeVoucher",event.target.value)}/></label>
        <label>Seller Voucher (RM)<input type="number" step=".01" value={fees.sellerVoucher} onChange={event=>updateFee("sellerVoucher",event.target.value)}/></label>
        <label>Co-fund Voucher (RM)<input type="number" step=".01" value={fees.cofundVoucher} onChange={event=>updateFee("cofundVoucher",event.target.value)}/></label>
        <label>Seller Bear Shipping (RM)<input type="number" step=".01" value={fees.sellerShipping} onChange={event=>updateFee("sellerShipping",event.target.value)}/></label>
        <label>Facebook Shipping (RM)<input type="number" step=".01" value={fees.facebookShipping} onChange={event=>updateFee("facebookShipping",event.target.value)}/></label>
        <label>Extra Profit Target (RM)<input type="number" step=".01" value={fees.extraProfit} onChange={event=>updateFee("extraProfit",event.target.value)}/></label>
      </div>}
      <p className="formula-note">Default：Transaction 3.78% · Platform Support RM0.54 · Pre-Order 2.14% · Non-Campaign 5.94% / Campaign 8.10%，两种 campaign service fee 均 capped at RM108。</p>
    </section>

    <section className="calculator-table card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 2 · PACKAGE RESULTS</p><h3>每个配套的建议卖价</h3></div><button onClick={addPackage}>+ Add package</button></div>
      <div className="calculator-table-scroll"><table>
        <thead><tr><th>配套</th><th>FB 卖价</th><th>建议 Shopee 卖价</th><th>需要 Markup</th><th>顾客 Voucher 后价钱</th><th>你的目标到手</th><th>实际到手</th><th>Transaction</th><th>Commission</th><th>Service Fee</th><th>Pre-Order</th><th></th></tr></thead>
        <tbody>{calculations.map(({row,result})=><tr key={row.id}>
          <td><input className="package-name-input" value={row.name} onChange={event=>updatePackage(row.id,"name",event.target.value)}/></td>
          <td><div className="money-input"><span>RM</span><input type="number" step=".01" value={row.facebookPrice} onChange={event=>updatePackage(row.id,"facebookPrice",event.target.value)}/></div></td>
          <td className="suggested-price"><strong>{money(result.requiredPrice)}</strong><small>Listing price</small></td>
          <td><strong className="markup">{pct(result.markupRate)}</strong><small>{money(result.markupAmount)}</small></td>
          <td><strong>{money(result.customerPrice)}</strong><small>顾客角度</small></td>
          <td>{money(result.targetPayout)}</td>
          <td className="payout"><strong>{money(result.payout)}</strong><small>✓ 已保护利润</small></td>
          <td>{money(result.transactionFee)}<small>3.78%</small></td>
          <td>{money(result.commissionFee)}<small>{pct(commission)}</small></td>
          <td>{money(result.serviceFee)}<small>{result.serviceCapped?"已到 RM108 cap":pct(SERVICE_MODES[serviceMode].rate)}</small></td>
          <td>{money(result.preorderFee)}<small>{fees.isPreorder?pct(fees.preorder):"Not pre-order"}</small></td>
          <td><button className="remove-row" disabled={packages.length===1} onClick={()=>setPackages(current=>current.filter(item=>item.id!==row.id))} aria-label={`Remove ${row.name}`}>×</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
