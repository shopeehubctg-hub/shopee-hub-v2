"use client";

import { useEffect, useMemo, useState } from "react";
import { calculatePricePerUnit, calculateShopeePrice, COMMISSION_CATEGORIES, commissionRateFor, reviewPriceLadder, SERVICE_MODES } from "./price-calculator-model";
import type { CalculatorSnapshot, PackagePrefill } from "./calculator-types";
import { VOUCHER_PRESET_SOURCE, voucherPresetFor } from "./voucher-presets.js";

type ServiceMode = keyof typeof SERVICE_MODES;
type NumberValue = number|"";
type PackageRow = { id:number; name:string; facebookPrice:NumberValue; mainProductQuantity:NumberValue; markupRates:Record<ServiceMode,string|null> };
type FeeSettings = {
  transaction:number; commission:number; service:number; serviceCap:number;
  preorder:number; isPreorder:boolean; platformSupport:number;
  shopeeVoucher:number; sellerVoucher:number; cofundVoucher:number;
  sellerShipping:number; facebookShipping:number; extraProfit:number;
};
type FeeDraft = {
  serviceCap:NumberValue; preorder:NumberValue; isPreorder:boolean; isSpayLater:boolean; platformSupport:NumberValue;
  shopeeVoucher:NumberValue; sellerVoucher:NumberValue; cofundVoucher:NumberValue;
  sellerShipping:NumberValue; facebookShipping:NumberValue;
};
type Props = { storeName?:string; onCreatePackage?:(prefill:PackagePrefill)=>void; onCreatePackages?:(prefills:PackagePrefill[])=>void };
type ConfirmationRow = { prefill:PackagePrefill; scenario:string; quantity:number; facebookPpu:number|null; customerPpu:number|null };
type PendingConfirmation = { kind:"single"|"batch"; rows:ConfirmationRow[] };
type LadderRow = { name:string; quantity:number; customerPrice:number; ppu:number; status:"base"|"better"|"higher"; label:string };

const blankMarkups = ():Record<ServiceMode,string|null> => ({nonCampaign:null,campaign:null});
const INITIAL_PACKAGES:PackageRow[] = [
  { id:1, name:"Package A", facebookPrice:289, mainProductQuantity:"", markupRates:blankMarkups() },
  { id:2, name:"Package B", facebookPrice:358, mainProductQuantity:"", markupRates:blankMarkups() },
  { id:3, name:"Package C", facebookPrice:716, mainProductQuantity:"", markupRates:blankMarkups() },
];
const SCENARIOS = Object.keys(SERVICE_MODES) as ServiceMode[];
const money = (value:number) => `RM ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
const pct = (value:number) => `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
const positive = (value:string|number) => Math.max(0, Number(value) || 0);
const editableNumber = (value:string):NumberValue => value===""?"":positive(value);

export function PriceCalculator({ storeName="", onCreatePackage, onCreatePackages }:Props) {
  const [packages,setPackages] = useState(INITIAL_PACKAGES);
  const [pendingConfirmation,setPendingConfirmation] = useState<PendingConfirmation|null>(null);
  const [category,setCategory] = useState<string>(()=>String(Math.max(0,COMMISSION_CATEGORIES.findIndex(item=>item.cluster==="FMCG"&&item.name.startsWith("Beauty ›")))));
  const [customCommission,setCustomCommission] = useState("");
  const commission = commissionRateFor(category,true,customCommission);
  const usingCustomCommission = customCommission !== "";
  const storeVoucherPreset = voucherPresetFor(storeName);
  const [voucherRates,setVoucherRates] = useState<Record<ServiceMode,NumberValue>>({nonCampaign:storeVoucherPreset.normal,campaign:storeVoucherPreset.campaign});
  const [fees,setFees] = useState<FeeDraft>({
    serviceCap:108, preorder:2.14, isPreorder:false, isSpayLater:false, platformSupport:0.54,
    shopeeVoucher:0, sellerVoucher:0, cofundVoucher:20,
    sellerShipping:0, facebookShipping:10,
  });
  const transactionRate = fees.isSpayLater?4.86:3.78;
  const calculations = useMemo(()=>packages.map(row=>({
    row,
    scenarios:SCENARIOS.map(mode=>{
      const activeFees:FeeSettings = {
        transaction:transactionRate, commission, service:SERVICE_MODES[mode].rate,
        serviceCap:positive(fees.serviceCap), preorder:positive(fees.preorder), isPreorder:fees.isPreorder,
        platformSupport:positive(fees.platformSupport), shopeeVoucher:positive(voucherRates[mode]),
        sellerVoucher:positive(fees.sellerVoucher), cofundVoucher:positive(fees.cofundVoucher),
        sellerShipping:positive(fees.sellerShipping), facebookShipping:positive(fees.facebookShipping), extraProfit:0,
      };
      const pricedRow = {...row,facebookPrice:positive(row.facebookPrice)};
      const suggested = calculateShopeePrice(pricedRow,activeFees);
      const customMarkup = row.markupRates[mode];
      const result = customMarkup === null ? suggested : calculateShopeePrice(pricedRow,activeFees,positive(customMarkup));
      return {mode,activeFees,suggested,result};
    }),
  })),[packages,fees,commission,voucherRates,transactionRate]);
  const headlineRate = transactionRate + commission + SERVICE_MODES.campaign.rate + (fees.isPreorder?positive(fees.preorder):0);
  useEffect(()=>{
    const preset = voucherPresetFor(storeName);
    setVoucherRates({nonCampaign:preset.normal,campaign:preset.campaign});
  },[storeName]);

  function updateFee(key:keyof typeof fees, value:string|boolean) {
    setFees(current=>({...current,[key]:typeof value==="boolean"?value:editableNumber(value)}));
  }
  function updatePackage(id:number, key:"name"|"facebookPrice"|"mainProductQuantity", value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,[key]:key==="name"?value:editableNumber(value)}:row));
  }
  function updateMarkup(id:number, mode:ServiceMode, value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,markupRates:{...row.markupRates,[mode]:value}}:row));
  }
  function updateVoucher(mode:ServiceMode, value:string) {
    setVoucherRates(current=>({...current,[mode]:value===""?"":Math.min(100,positive(value))}));
  }
  function addPackage() {
    setPackages(current=>[...current,{id:Math.max(0,...current.map(row=>row.id))+1,name:`Package ${String.fromCharCode(65+current.length)}`,facebookPrice:0,mainProductQuantity:"",markupRates:blankMarkups()}]);
  }
  function packagePrefill(row:PackageRow, mode:ServiceMode, result:ReturnType<typeof calculateShopeePrice>, suggested:ReturnType<typeof calculateShopeePrice>, requestId=Date.now()) {
    if (!row.name.trim() || !result.valid) return null;
    const categoryItem = COMMISSION_CATEGORIES[Number(category)];
    const calculatorSettings:CalculatorSnapshot = {
      source:"Shopee Pricing Calculator",
      packageName:row.name,
      category:`${categoryItem?.cluster ?? ""} · ${categoryItem?.name ?? "Unknown"}`,
      cashbackProgramme:true,
      customCommission:usingCustomCommission ? Number(customCommission) : null,
      commissionRate:commission,
      transactionRate,
      serviceScenario:SERVICE_MODES[mode].label as CalculatorSnapshot["serviceScenario"],
      serviceRate:SERVICE_MODES[mode].rate,
      serviceCap:positive(fees.serviceCap),
      preorderListing:fees.isPreorder,
      preorderRate:positive(fees.preorder),
      platformSupportFee:positive(fees.platformSupport),
      shopeeVoucherRate:positive(voucherRates[mode]),
      sellerVoucher:positive(fees.sellerVoucher),
      cofundVoucher:positive(fees.cofundVoucher),
      sellerShipping:positive(fees.sellerShipping),
      facebookShipping:positive(fees.facebookShipping),
      extraProfit:0,
      facebookPrice:positive(row.facebookPrice),
      mainProductQuantity:positive(row.mainProductQuantity),
      facebookPricePerUnit:calculatePricePerUnit(row.facebookPrice,row.mainProductQuantity),
      customerPricePerUnit:calculatePricePerUnit(result.customerPrice,row.mainProductQuantity),
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
  function confirmationRow(row:PackageRow, mode:ServiceMode, result:ReturnType<typeof calculateShopeePrice>, suggested:ReturnType<typeof calculateShopeePrice>, requestId=Date.now()):ConfirmationRow|null {
    const prefill = packagePrefill(row,mode,result,suggested,requestId);
    return prefill ? {prefill,scenario:SERVICE_MODES[mode].label,quantity:positive(row.mainProductQuantity),facebookPpu:calculatePricePerUnit(row.facebookPrice,row.mainProductQuantity),customerPpu:calculatePricePerUnit(result.customerPrice,row.mainProductQuantity)} : null;
  }

  const readyConfirmationRows = calculations.flatMap(({row,scenarios})=>scenarios.flatMap(({mode,suggested,result},index)=>{
    const item = confirmationRow(row,mode,result,suggested,Date.now()+row.id*10+index);
    return item ? [item] : [];
  }));
  const readyPackages = readyConfirmationRows.map(item=>item.prefill);
  const ladderReviews = SCENARIOS.map(mode=>({mode,rows:reviewPriceLadder(calculations.flatMap(({row,scenarios})=>{
    const scenario = scenarios.find(item=>item.mode===mode);
    const quantity = positive(row.mainProductQuantity);
    if (!scenario || quantity<=0) return [];
    return [{name:row.name,quantity,customerPrice:scenario.result.customerPrice,ppu:calculatePricePerUnit(scenario.result.customerPrice,quantity)}];
  })) as LadderRow[]})).filter(review=>review.rows.length>=2);
  function confirmCreate() {
    if (!pendingConfirmation) return;
    if (pendingConfirmation.kind==="single") onCreatePackage?.(pendingConfirmation.rows[0].prefill);
    else onCreatePackages?.(pendingConfirmation.rows.map(item=>item.prefill));
    setPendingConfirmation(null);
  }

  return <div className="price-calculator">
    <section className="calculator-hero">
      <div><p className="kicker">SHOPEE MY · MARKUP CALCULATOR</p><h2>Markup Calculator</h2></div>
      <div className="calculator-hero-metrics">
        <div className="calculator-hero-result total-fee-result"><span>Total Shopee Fee %</span><strong>{pct(headlineRate)}</strong><small>Campaign Day · Service Fee capped at RM108</small></div>
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
        <label className="category-field">Product Category
          <select value={category} onChange={event=>setCategory(event.target.value)}>
            {[...new Set(COMMISSION_CATEGORIES.map(item=>item.cluster))].map(cluster=><optgroup label={cluster} key={cluster}>
              {COMMISSION_CATEGORIES.map((item,index)=>item.cluster===cluster&&<option value={index} key={`${cluster}-${item.name}-${index}`}>{item.name}</option>)}
            </optgroup>)}
          </select>
          <small>Select Category for Actual Commission Fee, or set Custom Commission Fee.</small>
        </label>
        <label className="commission-field">Custom Commission Fee (%)
          <input type="number" min="0" step=".01" value={customCommission} placeholder={`Auto: ${pct(commissionRateFor(category,true))}`} onChange={event=>setCustomCommission(event.target.value)}/>
          {usingCustomCommission&&<small>Custom rate is active · 输入最终含 SST 的费率</small>}
        </label>
        <div className="setup-toggle-field"><label className="setup-toggle"><input type="checkbox" checked={fees.isSpayLater} onChange={event=>updateFee("isSpayLater",event.target.checked)}/><span><b>SPayLater</b></span></label><small>Transaction Fee {fees.isSpayLater?"4.86%":"3.78%"}</small></div>
        <div className="setup-toggle-field"><label className="setup-toggle"><input type="checkbox" checked={fees.isPreorder} onChange={event=>updateFee("isPreorder",event.target.checked)}/><span><b>Pre-Order Listing</b></span></label><small>额外 {pct(positive(fees.preorder))}</small></div>
      </div>
      <div className="step-one-extra">
        <div className="fee-fields advanced-fields">
          <label>Seller Voucher (RM)<input type="number" min="0" step=".01" value={fees.sellerVoucher} onChange={event=>updateFee("sellerVoucher",event.target.value)}/></label>
          <label>Seller Bear Shipping (RM)<input type="number" min="0" step=".01" value={fees.sellerShipping} onChange={event=>updateFee("sellerShipping",event.target.value)}/></label>
          <label>Facebook Shipping (RM)<input type="number" min="0" step=".01" value={fees.facebookShipping} onChange={event=>updateFee("facebookShipping",event.target.value)}/></label>
          <label>CoFund Voucher (RM)<input type="number" min="0" step=".01" value={fees.cofundVoucher} onChange={event=>updateFee("cofundVoucher",event.target.value)}/></label>
        </div>
        <p className="formula-note">Voucher 指标：{storeVoucherPreset.available?`${storeVoucherPreset.store} · Normal ${pct(positive(voucherRates.nonCampaign))} / Campaign ${pct(positive(voucherRates.campaign))}`:"此店暂时没有 Voucher preset · 两种情境以 0% 开始"}。来源：{VOUCHER_PRESET_SOURCE.month} · {VOUCHER_PRESET_SOURCE.metric}。</p>
      </div>
    </section>

    <section className="fee-strip">
      <article><span>Transaction Fee</span><strong>{pct(transactionRate)}</strong><small>{fees.isSpayLater?"SPayLater ON":"Default"}</small></article>
      <article><span>Commission Fee</span><strong>{pct(commission)}</strong><small>{usingCustomCommission?"Customized rate":"Cashback ON + Category + SST"}</small></article>
      <article><span>Service Fee</span><strong>5.94% / 8.10%</strong><small>Non-Campaign / Campaign · Capped at RM108</small></article>
      <article><span>Pre-Order Service Fee</span><strong>{fees.isPreorder?pct(positive(fees.preorder)):"OFF"}</strong><small>Default 2.14%</small></article>
      <article><span>Platform Support Fee</span><strong>RM 0.54</strong><small>Per order</small></article>
    </section>

    <section className="calculator-table calculator-results card">
      <div className="calculator-section-head"><div><p className="kicker">STEP 2 · PACKAGE RESULTS</p><h3>Campaign 与 Non-Campaign 建议卖价</h3></div><div className="calculator-result-head-actions"><button className="create-all-packages" disabled={!readyPackages.length} onClick={()=>setPendingConfirmation({kind:"batch",rows:readyConfirmationRows})}>Create All Ready ({readyPackages.length})</button><button onClick={addPackage}>+ Add package</button></div></div>
      <div className="dual-result-head" aria-hidden="true"><span>收费情境</span><span>建议 Shopee 卖价</span><span>顾客 Voucher 后价钱</span><span>需要 Markup</span><span>实际到手</span><span>PPU</span><span>操作</span></div>
      <div className="package-result-list">{calculations.map(({row,scenarios})=><article className="package-result-card dual-package-card" key={row.id}>
        <div className="dual-package-inputs">
          <label className="result-input"><span>配套</span><input className="package-name-input" value={row.name} onChange={event=>updatePackage(row.id,"name",event.target.value)}/></label>
          <label className="result-input facebook-price-field"><span>Facebook 卖价</span><div className="money-input"><span>RM</span><input aria-label={`${row.name} Facebook price`} type="number" step=".01" value={row.facebookPrice} onChange={event=>updatePackage(row.id,"facebookPrice",event.target.value)}/></div></label>
          <label className="result-input main-product-quantity"><span>主产品数量</span><input aria-label={`${row.name} main product quantity`} type="number" min="1" step="1" placeholder="填写数量" value={row.mainProductQuantity} onChange={event=>updatePackage(row.id,"mainProductQuantity",event.target.value)}/></label>
          <div className="facebook-ppu"><span>Facebook PPU</span><strong>{calculatePricePerUnit(row.facebookPrice,row.mainProductQuantity)===null?"—":money(calculatePricePerUnit(row.facebookPrice,row.mainProductQuantity)!)}</strong><small>卖价 ÷ 主产品数量</small></div>
          <button className="remove-row" disabled={packages.length===1} onClick={()=>setPackages(current=>current.filter(item=>item.id!==row.id))} aria-label={`Remove ${row.name}`}>×</button>
        </div>
        <div className="scenario-list">{scenarios.map(({mode,suggested,result})=>{
          const payoutProtected = result.payout >= result.targetPayout - .005;
          return <div className="scenario-result" key={mode}>
            <div className="scenario-result-main">
              <div className={`scenario-badge ${mode}`}><b>{SERVICE_MODES[mode].label}</b><small>Service Fee {pct(SERVICE_MODES[mode].rate)} · Voucher {pct(positive(voucherRates[mode]))}</small></div>
              <div className="result-metric suggested-price"><span>建议 Shopee 卖价</span><strong>{money(result.requiredPrice)}</strong><small>Listing price</small></div>
              <div className="result-metric"><span>顾客 Voucher 后价钱</span><strong>{money(result.customerPrice)}</strong><small>顾客实际看到</small></div>
              <label className="result-metric markup-editor"><span>需要 Markup</span><div><input type="number" min="0" step=".01" value={row.markupRates[mode] ?? suggested.markupRate.toFixed(2)} onChange={event=>updateMarkup(row.id,mode,event.target.value)}/><b>%</b></div><small>{row.markupRates[mode]===null?`系统建议 · ${money(suggested.markupAmount)}`:`自订 · ${money(result.markupAmount)}`}</small></label>
              <div className="result-metric payout"><span>实际到手</span><strong>{money(result.payout)}</strong><small>目标 {money(result.targetPayout)} · {payoutProtected?"✓ 利润已保护":"低于目标"}</small><small className="facebook-payout">Facebook 到手 {money(positive(row.facebookPrice)-positive(fees.facebookShipping))}</small></div>
              <div className="result-metric customer-ppu"><span>PPU</span><strong>{calculatePricePerUnit(result.customerPrice,row.mainProductQuantity)===null?"—":money(calculatePricePerUnit(result.customerPrice,row.mainProductQuantity)!)}</strong><small>顾客价 ÷ 主产品数量</small></div>
              <div className="package-result-actions"><button className="create-package-link" disabled={!row.name.trim()||!result.valid} onClick={()=>{const item=confirmationRow(row,mode,result,suggested);if(item)setPendingConfirmation({kind:"single",rows:[item]});}}>Create Package</button></div>
            </div>
            <details className="fee-breakdown"><summary>查看 {SERVICE_MODES[mode].label} Fee Breakdown</summary><div className="fee-breakdown-grid">
              <div><span>Transaction Fee · {pct(transactionRate)}</span><strong>{money(result.transactionFee)}</strong></div>
              <div><span>Commission · {pct(commission)}</span><strong>{money(result.commissionFee)}</strong></div>
              <div><span>Service Fee · {result.serviceCapped?"RM108 cap":pct(SERVICE_MODES[mode].rate)}</span><strong>{money(result.serviceFee)}</strong></div>
              <div><span>Pre-Order · {fees.isPreorder?pct(positive(fees.preorder)):"OFF"}</span><strong>{money(result.preorderFee)}</strong></div>
              <div><span>Platform Support</span><strong>{money(positive(fees.platformSupport))}</strong></div>
            </div></details>
          </div>;
        })}</div>
      </article>)}</div>
    </section>
    {ladderReviews.length>0&&<section className="package-ladder-review card"><div className="calculator-section-head"><div><p className="kicker">PACKAGE PRICE LADDER REVIEW</p><h3>配套 PPU 对比</h3></div><span>只比较已填写主产品数量的配套</span></div><div className="ladder-review-grid">{ladderReviews.map(review=><article key={review.mode}><header><b>{SERVICE_MODES[review.mode].label}</b><span>Customer PPU</span></header>{review.rows.map(item=><div key={`${review.mode}-${item.name}-${item.quantity}`}><span>{item.name}<small>{item.quantity} 件</small></span><strong>{money(item.ppu)}</strong><em className={item.status}>{item.label}</em></div>)}</article>)}</div></section>}
    {pendingConfirmation&&<div className="calculator-confirm-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPendingConfirmation(null);}}><section className="calculator-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="calculator-confirm-title"><header><div><p className="kicker">FINAL CHECK</p><h3 id="calculator-confirm-title">确认最终配套 & 价钱</h3><span>确认后才会带到 Package & Pricing。</span></div><button aria-label="Close confirmation" onClick={()=>setPendingConfirmation(null)}>×</button></header><div className="calculator-confirm-table"><table><thead><tr><th>配套</th><th>收费情境</th><th>主产品数量</th><th>Facebook 卖价</th><th>Facebook PPU</th><th>Shopee 卖价</th><th>顾客价</th><th>PPU</th></tr></thead><tbody>{pendingConfirmation.rows.map((item,index)=><tr key={`${item.prefill.requestId}-${index}`}><td><b>{item.prefill.name}</b></td><td>{item.scenario}</td><td>{item.quantity||"—"}</td><td>{money(item.prefill.calculatorSettings.facebookPrice)}</td><td>{item.facebookPpu===null?"—":money(item.facebookPpu)}</td><td><strong>{money(item.prefill.sellingPrice)}</strong></td><td>{money(item.prefill.calculatorSettings.customerVoucherPrice)}</td><td>{item.customerPpu===null?"—":money(item.customerPpu)}</td></tr>)}</tbody></table></div><footer><button className="confirm-cancel" onClick={()=>setPendingConfirmation(null)}>Back to Edit</button><button className="confirm-create" onClick={confirmCreate}>Confirm & Continue</button></footer></section></div>}
  </div>;
}
