"use client";

import { useMemo, useState } from "react";
import { calculateShopeePrice, COMMISSION_CATEGORIES, commissionRateFor, SERVICE_MODES } from "./price-calculator-model";
import type { CalculatorSnapshot, PackagePrefill } from "./calculator-types";

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

type Props = { onCreatePackage?:(prefill:PackagePrefill)=>void };

export function PriceCalculator({ onCreatePackage }:Props) {
  const [packages,setPackages] = useState(INITIAL_PACKAGES);
  const [category,setCategory] = useState<string>("28");
  const [onCashback,setOnCashback] = useState(true);
  const [customCommission,setCustomCommission] = useState("");
  const [serviceMode,setServiceMode] = useState<ServiceMode>("nonCampaign");
  const [showAdvanced,setShowAdvanced] = useState(false);
  const commission = commissionRateFor(category,onCashback,customCommission);
  const usingCustomCommission = customCommission !== "";
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
  function createPackage(row:PackageRow, result:ReturnType<typeof calculateShopeePrice>) {
    const categoryItem = COMMISSION_CATEGORIES[Number(category)];
    const calculatorSettings:CalculatorSnapshot = {
      source:"Shopee Pricing Calculator",
      packageName:row.name,
      category:`${categoryItem?.cluster ?? ""} · ${categoryItem?.name ?? "Unknown"}`,
      cashbackProgramme:onCashback,
      customCommission:usingCustomCommission ? Number(customCommission) : null,
      commissionRate:commission,
      transactionRate:fees.transaction,
      serviceScenario:serviceMode === "campaign" ? "Campaign Day" : "Non-Campaign Day",
      serviceRate:SERVICE_MODES[serviceMode].rate,
      serviceCap:fees.serviceCap,
      preorderListing:fees.isPreorder,
      preorderRate:fees.preorder,
      platformSupportFee:fees.platformSupport,
      shopeeVoucherRate:fees.shopeeVoucher,
      sellerVoucher:fees.sellerVoucher,
      cofundVoucher:fees.cofundVoucher,
      sellerShipping:fees.sellerShipping,
      facebookShipping:fees.facebookShipping,
      extraProfit:fees.extraProfit,
      facebookPrice:row.facebookPrice,
      suggestedShopeePrice:result.requiredPrice,
      customerVoucherPrice:result.customerPrice,
      markupRate:result.markupRate,
      markupAmount:result.markupAmount,
      targetPayout:result.targetPayout,
      actualPayout:result.payout,
    };
    onCreatePackage?.({requestId:Date.now(),name:row.name,sellingPrice:result.requiredPrice,calculatorSettings});
  }

  return <div className="price-calculator">
    <section className="calculator-hero">
      <div><p className="kicker">SHOPEE MY · MARKUP CALCULATOR</p><h2>配套卖价倒推计算机</h2><p>选择商品分类与收费情境，再输入 Facebook 售价；系统会倒推保护利润所需的 Shopee 卖价。</p></div>
      <div className="calculator-hero-result"><span>当前最高百分比收费</span><strong>{pct(headlineRate)}</strong><small>Service Fee 达 RM108 后会停止增加</small></div>
    </section>

    <section className="calculator-primary card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 1 · YOUR SHOPEE SETUP</p><h3>选择 Product Category 与收费情境</h3></div><span>Food rates: 21 May 2026 · Essential Goods: 1 Aug 2026 · 已包含 8% SST</span></div>
      <div className="primary-fields">
        <label>Product Category
          <select value={category} onChange={event=>setCategory(event.target.value)}>
            {[...new Set(COMMISSION_CATEGORIES.map(item=>item.cluster))].map(cluster=><optgroup label={cluster} key={cluster}>
              {COMMISSION_CATEGORIES.map((item,index)=>item.cluster===cluster&&<option value={index} key={`${cluster}-${item.name}`}>{item.name}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className="commission-field">Custom Commission Fee (%)
          <input type="number" min="0" step=".01" value={customCommission} placeholder={`Auto: ${pct(commissionRateFor(category,onCashback))}`} onChange={event=>setCustomCommission(event.target.value)}/>
          <small>{usingCustomCommission?"Custom rate is active · 输入最终含 SST 的费率":"留空则自动使用 Product Category 费率"}</small>
        </label>
        <label className="setup-toggle"><input type="checkbox" checked={onCashback} onChange={event=>setOnCashback(event.target.checked)}/><span><b>Cashback Program</b><small>{onCashback?"Seller participating":"Seller not participating"}</small></span></label>
        <label>Service Fee Scenario
          <select value={serviceMode} onChange={event=>setServiceMode(event.target.value as ServiceMode)}>
            <option value="nonCampaign">Non-Campaign Day · 5.94%</option>
            <option value="campaign">Campaign Day · 8.10%</option>
          </select>
        </label>
        <label className="setup-toggle"><input type="checkbox" checked={fees.isPreorder} onChange={event=>updateFee("isPreorder",event.target.checked)}/><span><b>Pre-Order listing</b><small>额外 {pct(fees.preorder)}</small></span></label>
      </div>
    </section>

    <section className="fee-strip">
      <article><span>Transaction Fee</span><strong>3.78%</strong><small>Default</small></article>
      <article><span>Commission Fee</span><strong>{pct(commission)}</strong><small>{usingCustomCommission?"Customized rate":"Category + Cashback + SST"}</small></article>
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

    <section className="calculator-table calculator-results card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 2 · PACKAGE RESULTS</p><h3>每个配套的建议卖价</h3></div><button onClick={addPackage}>+ Add package</button></div>
      <div className="package-results-header" aria-hidden="true">
        <span>配套</span><span>Facebook 卖价</span><span>建议 Shopee 卖价</span><span>顾客 Voucher 后价钱</span><span>需要 Markup</span><span>实际到手</span><span>操作</span>
      </div>
      <div className="package-result-list">{calculations.map(({row,result})=><article className="package-result-card" key={row.id}>
        <div className="package-result-main">
          <label className="result-input"><span>配套</span><input className="package-name-input" value={row.name} onChange={event=>updatePackage(row.id,"name",event.target.value)}/></label>
          <label className="result-input"><span>Facebook 卖价</span><div className="money-input"><b>RM</b><input type="number" step=".01" value={row.facebookPrice} onChange={event=>updatePackage(row.id,"facebookPrice",event.target.value)}/></div></label>
          <div className="result-metric suggested-price"><span>建议 Shopee 卖价</span><strong>{money(result.requiredPrice)}</strong><small>Listing price</small></div>
          <div className="result-metric"><span>顾客 Voucher 后价钱</span><strong>{money(result.customerPrice)}</strong><small>顾客实际看到</small></div>
          <div className="result-metric"><span>需要 Markup</span><strong className="markup">{pct(result.markupRate)}</strong><small>{money(result.markupAmount)}</small></div>
          <div className="result-metric payout"><span>实际到手</span><strong>{money(result.payout)}</strong><small>目标 {money(result.targetPayout)} · ✓ 利润已保护</small></div>
          <div className="package-result-actions">
            <button className="create-package-link" disabled={!row.name.trim()||!result.valid} onClick={()=>createPackage(row,result)}>Create Package</button>
            <button className="remove-row" disabled={packages.length===1} onClick={()=>setPackages(current=>current.filter(item=>item.id!==row.id))} aria-label={`Remove ${row.name}`}>×</button>
          </div>
        </div>
        <details className="fee-breakdown">
          <summary>查看 Fee Breakdown</summary>
          <div className="fee-breakdown-grid">
            <div><span>Transaction Fee · 3.78%</span><strong>{money(result.transactionFee)}</strong></div>
            <div><span>Commission · {pct(commission)}</span><strong>{money(result.commissionFee)}</strong></div>
            <div><span>Service Fee · {result.serviceCapped?"RM108 cap":pct(SERVICE_MODES[serviceMode].rate)}</span><strong>{money(result.serviceFee)}</strong></div>
            <div><span>Pre-Order · {fees.isPreorder?pct(fees.preorder):"OFF"}</span><strong>{money(result.preorderFee)}</strong></div>
            <div><span>Platform Support</span><strong>{money(fees.platformSupport)}</strong></div>
          </div>
        </details>
      </article>)}</div>
    </section>
  </div>;
}
