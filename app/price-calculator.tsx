"use client";

import { useEffect, useMemo, useState } from "react";
import { calculateShopeePrice, COMMISSION_CATEGORIES, commissionRateFor, SERVICE_MODES } from "./price-calculator-model";
import type { CalculatorSnapshot, PackagePrefill } from "./calculator-types";
import { VOUCHER_PRESET_SOURCE, voucherPresetFor } from "./voucher-presets.js";

type ServiceMode = keyof typeof SERVICE_MODES;
type PackageRow = { id:number; name:string; facebookPrice:number; markupRates:Record<ServiceMode,string|null> };
type FeeSettings = {
  transaction:number; commission:number; service:number; serviceCap:number;
  preorder:number; isPreorder:boolean; platformSupport:number;
  shopeeVoucher:number; sellerVoucher:number; cofundVoucher:number;
  sellerShipping:number; facebookShipping:number; extraProfit:number;
};
type Props = { storeName?:string; onCreatePackage?:(prefill:PackagePrefill)=>void; onCreatePackages?:(prefills:PackagePrefill[])=>void };

const blankMarkups = ():Record<ServiceMode,string|null> => ({nonCampaign:null,campaign:null});
const INITIAL_PACKAGES:PackageRow[] = [
  { id:1, name:"Package A", facebookPrice:289, markupRates:blankMarkups() },
  { id:2, name:"Package B", facebookPrice:358, markupRates:blankMarkups() },
  { id:3, name:"Package C", facebookPrice:716, markupRates:blankMarkups() },
];
const SCENARIOS = Object.keys(SERVICE_MODES) as ServiceMode[];
const money = (value:number) => `RM ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
const pct = (value:number) => `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
const positive = (value:string) => Math.max(0, Number(value) || 0);

export function PriceCalculator({ storeName="", onCreatePackage, onCreatePackages }:Props) {
  const [packages,setPackages] = useState(INITIAL_PACKAGES);
  const [category,setCategory] = useState<string>(()=>String(Math.max(0,COMMISSION_CATEGORIES.findIndex(item=>item.cluster==="FMCG"&&item.name.startsWith("Beauty ›")))));
  const [customCommission,setCustomCommission] = useState("");
  const commission = commissionRateFor(category,true,customCommission);
  const usingCustomCommission = customCommission !== "";
  const storeVoucherPreset = voucherPresetFor(storeName);
  const [voucherRates,setVoucherRates] = useState<Record<ServiceMode,number>>({nonCampaign:storeVoucherPreset.normal,campaign:storeVoucherPreset.campaign});
  const [fees,setFees] = useState<Omit<FeeSettings,"commission"|"service">>({
    transaction:3.78, serviceCap:108, preorder:2.14, isPreorder:false, platformSupport:0.54,
    shopeeVoucher:0, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10, extraProfit:0,
  });
  const calculations = useMemo(()=>packages.map(row=>({
    row,
    scenarios:SCENARIOS.map(mode=>{
      const activeFees:FeeSettings = {...fees,commission,service:SERVICE_MODES[mode].rate,shopeeVoucher:voucherRates[mode]};
      const suggested = calculateShopeePrice(row,activeFees);
      const customMarkup = row.markupRates[mode];
      const result = customMarkup === null ? suggested : calculateShopeePrice(row,activeFees,positive(customMarkup));
      return {mode,activeFees,suggested,result};
    }),
  })),[packages,fees,commission,voucherRates]);
  const headlineRate = fees.transaction + commission + SERVICE_MODES.campaign.rate + (fees.isPreorder?fees.preorder:0);
  useEffect(()=>{
    const preset = voucherPresetFor(storeName);
    setVoucherRates({nonCampaign:preset.normal,campaign:preset.campaign});
  },[storeName]);

  function updateFee(key:keyof typeof fees, value:string|boolean) {
    setFees(current=>({...current,[key]:typeof value==="boolean"?value:positive(value)}));
  }
  function updatePackage(id:number, key:"name"|"facebookPrice", value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,[key]:key==="facebookPrice"?positive(value):value}:row));
  }
  function updateMarkup(id:number, mode:ServiceMode, value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,markupRates:{...row.markupRates,[mode]:value===""?null:value}}:row));
  }
  function updateVoucher(mode:ServiceMode, value:string) {
    setVoucherRates(current=>({...current,[mode]:Math.min(100,positive(value))}));
  }
  function addPackage() {
    setPackages(current=>[...current,{id:Math.max(0,...current.map(row=>row.id))+1,name:`Package ${String.fromCharCode(65+current.length)}`,facebookPrice:0,markupRates:blankMarkups()}]);
  }
  function markupBlocked(row:PackageRow, mode:ServiceMode, result:ReturnType<typeof calculateShopeePrice>) {
    const enteredMarkup = row.markupRates[mode];
    return enteredMarkup === null ? result.markupRate >= 30 : positive(enteredMarkup) >= 30;
  }
  function packagePrefill(row:PackageRow, mode:ServiceMode, result:ReturnType<typeof calculateShopeePrice>, suggested:ReturnType<typeof calculateShopeePrice>, requestId=Date.now()) {
    if (!row.name.trim() || !result.valid || markupBlocked(row,mode,result)) return null;
    const categoryItem = COMMISSION_CATEGORIES[Number(category)];
    const calculatorSettings:CalculatorSnapshot = {
      source:"Shopee Pricing Calculator",
      packageName:row.name,
      category:`${categoryItem?.cluster ?? ""} · ${categoryItem?.name ?? "Unknown"}`,
      cashbackProgramme:true,
      customCommission:usingCustomCommission ? Number(customCommission) : null,
      commissionRate:commission,
      transactionRate:fees.transaction,
      serviceScenario:SERVICE_MODES[mode].label as CalculatorSnapshot["serviceScenario"],
      serviceRate:SERVICE_MODES[mode].rate,
      serviceCap:fees.serviceCap,
      preorderListing:fees.isPreorder,
      preorderRate:fees.preorder,
      platformSupportFee:fees.platformSupport,
      shopeeVoucherRate:voucherRates[mode],
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
      markupCustomized:row.markupRates[mode] !== null,
      systemSuggestedMarkupRate:suggested.markupRate,
      systemSuggestedShopeePrice:suggested.requiredPrice,
      targetPayout:result.targetPayout,
      actualPayout:result.payout,
    };
    return {requestId,name:row.name,sellingPrice:result.requiredPrice,calculatorSettings};
  }
  function createPackage(row:PackageRow, mode:ServiceMode, result:ReturnType<typeof calculateShopeePrice>, suggested:ReturnType<typeof calculateShopeePrice>) {
    if (markupBlocked(row,mode,result)) return;
    const prefill = packagePrefill(row,mode,result,suggested);
    if (prefill) onCreatePackage?.(prefill);
  }

  const readyPackages = calculations.flatMap(({row,scenarios})=>scenarios.flatMap(({mode,suggested,result},index)=>{
    const prefill = packagePrefill(row,mode,result,suggested,Date.now()+row.id*10+index);
    return prefill ? [prefill] : [];
  }));

  return <div className="price-calculator">
    <section className="calculator-hero">
      <div><p className="kicker">SHOPEE MY · MARKUP CALCULATOR</p><h2>Markup Calculator</h2><p>{storeName||"Selected store"} · Voucher preset 根据 {VOUCHER_PRESET_SOURCE.month} 店铺记录，修改一次会套用全部配套。</p></div>
      <div className="calculator-hero-metrics">
        <div className="calculator-hero-result total-fee-result"><span>Total Commission Fee %</span><strong>{pct(headlineRate)}</strong><small>Campaign Day · Service Fee capped at RM108</small></div>
        <div className={`calculator-hero-result voucher-hero-result${storeVoucherPreset.available?"":" unavailable"}`}>
          <div className="voucher-hero-head"><span>Shopee Voucher %</span><small>{storeVoucherPreset.available?`${VOUCHER_PRESET_SOURCE.month} preset`:"No preset"}</small></div>
          <div className="voucher-hero-inputs">
            <label><span>Non-Campaign Day</span><div><input aria-label="Non-Campaign Shopee Voucher percentage" type="number" min="0" max="100" step=".01" value={voucherRates.nonCampaign} onChange={event=>updateVoucher("nonCampaign",event.target.value)}/><b>%</b></div></label>
            <label><span>Campaign Day</span><div><input aria-label="Campaign Shopee Voucher percentage" type="number" min="0" max="100" step=".01" value={voucherRates.campaign} onChange={event=>updateVoucher("campaign",event.target.value)}/><b>%</b></div></label>
          </div>
        </div>
      </div>
    </section>

    <section className="calculator-primary card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 1 · YOUR SHOPEE SETUP</p><h3>商品分类、Voucher 与收费设定</h3></div><span>Cashback Program ON · Commission 已包含 8% SST</span></div>
      <div className="primary-fields calculator-primary-fields">
        <label>Product Category
          <select value={category} onChange={event=>setCategory(event.target.value)}>
            {[...new Set(COMMISSION_CATEGORIES.map(item=>item.cluster))].map(cluster=><optgroup label={cluster} key={cluster}>
              {COMMISSION_CATEGORIES.map((item,index)=>item.cluster===cluster&&<option value={index} key={`${cluster}-${item.name}-${index}`}>{item.name}</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className="commission-field">Custom Commission Fee (%)
          <input type="number" min="0" step=".01" value={customCommission} placeholder={`Auto: ${pct(commissionRateFor(category,true))}`} onChange={event=>setCustomCommission(event.target.value)}/>
          {usingCustomCommission&&<small>Custom rate is active · 输入最终含 SST 的费率</small>}
        </label>
        <label>Co-Fund Voucher (RM)<input type="number" min="0" step=".01" value={fees.cofundVoucher} onChange={event=>updateFee("cofundVoucher",event.target.value)}/></label>
        <div className="setup-toggle-field"><label className="setup-toggle"><input type="checkbox" checked={fees.isPreorder} onChange={event=>updateFee("isPreorder",event.target.checked)}/><span><b>Pre-Order Listing</b></span></label><small>额外 {pct(fees.preorder)}</small></div>
      </div>
    </section>

    <section className="fee-strip">
      <article><span>Transaction Fee</span><strong>3.78%</strong><small>Default</small></article>
      <article><span>Commission Fee</span><strong>{pct(commission)}</strong><small>{usingCustomCommission?"Customized rate":"Cashback ON + Category + SST"}</small></article>
      <article><span>Service Fee</span><strong>5.94% / 8.10%</strong><small>Non-Campaign / Campaign · Capped at RM108</small></article>
      <article><span>Pre-Order Service Fee</span><strong>{fees.isPreorder?pct(fees.preorder):"OFF"}</strong><small>Default 2.14%</small></article>
      <article className="fee-total"><span>Platform Support Fee</span><strong>RM 0.54</strong><small>Per order</small></article>
    </section>

    <section className="calculator-settings card">
      <div className="calculator-section-head settings-visible-head"><div><p className="kicker">VOUCHER、运费与利润</p><h3>其他计算设定</h3></div><span>Default 已直接展开</span></div>
      <div className="fee-fields advanced-fields">
        <label>Seller Voucher (RM)<input type="number" min="0" step=".01" value={fees.sellerVoucher} onChange={event=>updateFee("sellerVoucher",event.target.value)}/></label>
        <label>Seller Bear Shipping (RM)<input type="number" min="0" step=".01" value={fees.sellerShipping} onChange={event=>updateFee("sellerShipping",event.target.value)}/></label>
        <label>Facebook Shipping (RM)<input type="number" min="0" step=".01" value={fees.facebookShipping} onChange={event=>updateFee("facebookShipping",event.target.value)}/></label>
        <label>Extra Profit Target (RM)<input type="number" min="0" step=".01" value={fees.extraProfit} onChange={event=>updateFee("extraProfit",event.target.value)}/></label>
      </div>
      <p className="formula-note">Voucher 指标：{storeVoucherPreset.available?`${storeVoucherPreset.store} · Normal ${pct(voucherRates.nonCampaign)} / Campaign ${pct(voucherRates.campaign)}`:"此店暂时没有 Voucher preset · 两种情境以 0% 开始"}。来源：{VOUCHER_PRESET_SOURCE.month} · {VOUCHER_PRESET_SOURCE.metric}。</p>
    </section>

    <section className="calculator-table calculator-results card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 2 · PACKAGE RESULTS</p><h3>Campaign 与 Non-Campaign 建议卖价</h3></div><div className="calculator-result-head-actions"><button className="create-all-packages" disabled={!readyPackages.length} onClick={()=>onCreatePackages?.(readyPackages)}>Create All Ready ({readyPackages.length})</button><button onClick={addPackage}>+ Add package</button></div></div>
      <div className="dual-result-head" aria-hidden="true"><span>收费情境</span><span>建议 Shopee 卖价</span><span>顾客 Voucher 后价钱</span><span>需要 Markup</span><span>实际到手</span><span>操作</span></div>
      <div className="package-result-list">{calculations.map(({row,scenarios})=><article className="package-result-card dual-package-card" key={row.id}>
        <div className="dual-package-inputs">
          <label className="result-input"><span>配套</span><input className="package-name-input" value={row.name} onChange={event=>updatePackage(row.id,"name",event.target.value)}/></label>
          <label className="result-input facebook-price-field"><span>Facebook 卖价</span><div className="money-input"><span>RM</span><input aria-label={`${row.name} Facebook price`} type="number" step=".01" value={row.facebookPrice} onChange={event=>updatePackage(row.id,"facebookPrice",event.target.value)}/></div></label>
          <button className="remove-row" disabled={packages.length===1} onClick={()=>setPackages(current=>current.filter(item=>item.id!==row.id))} aria-label={`Remove ${row.name}`}>×</button>
        </div>
        <div className="scenario-list">{scenarios.map(({mode,suggested,result})=>{
          const isMarkupBlocked = markupBlocked(row,mode,result);
          const payoutProtected = result.payout >= result.targetPayout - .005;
          return <div className={`scenario-result${isMarkupBlocked?" markup-blocked":""}`} key={mode}>
            <div className="scenario-result-main">
              <div className={`scenario-badge ${mode}`}><b>{SERVICE_MODES[mode].label}</b><small>Service Fee {pct(SERVICE_MODES[mode].rate)} · Voucher {pct(voucherRates[mode])}</small></div>
              <div className="result-metric suggested-price"><span>建议 Shopee 卖价</span><strong>{money(result.requiredPrice)}</strong><small>Listing price</small></div>
              <div className="result-metric"><span>顾客 Voucher 后价钱</span><strong>{money(result.customerPrice)}</strong><small>顾客实际看到</small></div>
              <label className="result-metric markup-editor"><span>需要 Markup</span><div><input type="number" min="0" step=".01" value={row.markupRates[mode] ?? suggested.markupRate.toFixed(2)} onChange={event=>updateMarkup(row.id,mode,event.target.value)}/><b>%</b></div><small>{row.markupRates[mode]===null?`系统建议 · ${money(suggested.markupAmount)}`:`自订 · ${money(result.markupAmount)}`}</small></label>
              <div className="result-metric payout"><span>实际到手</span><strong>{money(result.payout)}</strong><small>目标 {money(result.targetPayout)} · {payoutProtected?"✓ 利润已保护":"低于目标"}</small></div>
              <div className="package-result-actions"><button className="create-package-link" disabled={!row.name.trim()||!result.valid||isMarkupBlocked} onClick={()=>createPackage(row,mode,result,suggested)}>Create Package</button>{isMarkupBlocked&&<small className="markup-warning">Markup ≥ 30% · Cannot create</small>}</div>
            </div>
            <details className="fee-breakdown"><summary>查看 {SERVICE_MODES[mode].label} Fee Breakdown</summary><div className="fee-breakdown-grid">
              <div><span>Transaction Fee · 3.78%</span><strong>{money(result.transactionFee)}</strong></div>
              <div><span>Commission · {pct(commission)}</span><strong>{money(result.commissionFee)}</strong></div>
              <div><span>Service Fee · {result.serviceCapped?"RM108 cap":pct(SERVICE_MODES[mode].rate)}</span><strong>{money(result.serviceFee)}</strong></div>
              <div><span>Pre-Order · {fees.isPreorder?pct(fees.preorder):"OFF"}</span><strong>{money(result.preorderFee)}</strong></div>
              <div><span>Platform Support</span><strong>{money(fees.platformSupport)}</strong></div>
            </div></details>
          </div>;
        })}</div>
      </article>)}</div>
    </section>
  </div>;
}
