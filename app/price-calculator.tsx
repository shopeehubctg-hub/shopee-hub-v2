"use client";

import { useEffect, useMemo, useState } from "react";
import { calculatePricePerUnit, calculateShopeePrice, calculateShopeePriceForCustomerTarget, COMMISSION_CATEGORIES, commissionRateFor, reviewPriceLadder, SERVICE_MODES } from "./price-calculator-model";
import type { CalculatorSnapshot, PackagePrefill } from "./calculator-types";
import { VOUCHER_PRESET_SOURCE, voucherPresetFor } from "./voucher-presets.js";

type ServiceMode = keyof typeof SERVICE_MODES;
type NumberValue = number|"";
type PackageRow = { id:number; name:string; facebookPrice:NumberValue; mainProductQuantity:NumberValue; markupRates:Record<ServiceMode,string|null>; customerTargets:Record<ServiceMode,string|null> };
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
type PricingGoal = "facebookPayout"|"sameCustomerPrice"|"cheaperCustomerPrice";
type DiscountUnit = "rm"|"percent";
type GoalSetting = { goal:PricingGoal; discountUnit:DiscountUnit; discountValue:NumberValue };

const blankMarkups = ():Record<ServiceMode,string|null> => ({nonCampaign:null,campaign:null});
const blankCustomerTargets = ():Record<ServiceMode,string|null> => ({nonCampaign:null,campaign:null});
const INITIAL_PACKAGES:PackageRow[] = [
  { id:1, name:"Package A", facebookPrice:289, mainProductQuantity:"", markupRates:blankMarkups(), customerTargets:blankCustomerTargets() },
  { id:2, name:"Package B", facebookPrice:358, mainProductQuantity:"", markupRates:blankMarkups(), customerTargets:blankCustomerTargets() },
  { id:3, name:"Package C", facebookPrice:716, mainProductQuantity:"", markupRates:blankMarkups(), customerTargets:blankCustomerTargets() },
];
const SCENARIOS = Object.keys(SERVICE_MODES) as ServiceMode[];
const money = (value:number) => `RM ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
const pct = (value:number) => `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
const positive = (value:string|number) => Math.max(0, Number(value) || 0);
const editableNumber = (value:string):NumberValue => value===""?"":positive(value);

export function PriceCalculator({ storeName="", onCreatePackage, onCreatePackages }:Props) {
  const [packages,setPackages] = useState(INITIAL_PACKAGES);
  const [pendingConfirmation,setPendingConfirmation] = useState<PendingConfirmation|null>(null);
  const [pricingGoals,setPricingGoals] = useState<Record<ServiceMode,GoalSetting>>({
    nonCampaign:{goal:"facebookPayout",discountUnit:"rm",discountValue:""},
    campaign:{goal:"facebookPayout",discountUnit:"rm",discountValue:""},
  });
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
      const goalSetting = pricingGoals[mode];
      const discount = positive(goalSetting.discountValue);
      const defaultCustomerTarget = goalSetting.goal==="sameCustomerPrice" ? pricedRow.facebookPrice : goalSetting.discountUnit==="rm" ? Math.max(0,pricedRow.facebookPrice-discount) : pricedRow.facebookPrice*(1-Math.min(100,discount)/100);
      const packageCustomerTarget = row.customerTargets[mode];
      const customerTarget = goalSetting.goal==="cheaperCustomerPrice"&&packageCustomerTarget!==null&&packageCustomerTarget!=="" ? positive(packageCustomerTarget) : defaultCustomerTarget;
      const suggested = goalSetting.goal==="facebookPayout" ? calculateShopeePrice(pricedRow,activeFees) : calculateShopeePriceForCustomerTarget(pricedRow,activeFees,customerTarget);
      const customMarkup = row.markupRates[mode];
      const result = customMarkup === null ? suggested : calculateShopeePrice(pricedRow,activeFees,positive(customMarkup));
      return {mode,activeFees,suggested,result,goalSetting};
    }),
  })),[packages,fees,commission,voucherRates,transactionRate,pricingGoals]);
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
  function updateCustomerTarget(id:number, mode:ServiceMode, value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,customerTargets:{...row.customerTargets,[mode]:value},markupRates:{...row.markupRates,[mode]:null}}:row));
  }
  function updateVoucher(mode:ServiceMode, value:string) {
    setVoucherRates(current=>({...current,[mode]:value===""?"":Math.min(100,positive(value))}));
  }
  function updatePricingGoal(mode:ServiceMode, patch:Partial<GoalSetting>) {
    setPricingGoals(current=>({...current,[mode]:{...current[mode],...patch}}));
    setPackages(current=>current.map(row=>({...row,markupRates:{...row.markupRates,[mode]:null},customerTargets:{...row.customerTargets,[mode]:null}})));
  }
  function addPackage() {
    setPackages(current=>[...current,{id:Math.max(0,...current.map(row=>row.id))+1,name:`Package ${String.fromCharCode(65+current.length)}`,facebookPrice:0,mainProductQuantity:"",markupRates:blankMarkups(),customerTargets:blankCustomerTargets()}]);
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
      pricingGoal:pricingGoals[mode].goal,
      discountUnit:pricingGoals[mode].discountUnit,
      discountValue:positive(pricingGoals[mode].discountValue),
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
  function pricingGoalSummary(mode:ServiceMode) {
    const setting = pricingGoals[mode];
    if (setting.goal==="facebookPayout") return "Match Meta Take-Home";
    if (setting.goal==="sameCustomerPrice") return "Match Meta Customer Price";
    const discount = positive(setting.discountValue);
    return `Lower Than Meta by ${setting.discountUnit==="rm"?money(discount):pct(discount)}`;
  }

  return <div className="price-calculator" onWheelCapture={event=>{const target=event.target as HTMLInputElement;if(target.tagName==="INPUT"&&target.type==="number")target.blur();}}>
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
      <div className="calculator-section-head"><div><p className="kicker">STEP 1 · YOUR SHOPEE SETUP</p><h3>Category, Vouchers & Fees</h3></div><span>Cashback Program ON · Commission includes 8% SST</span></div>
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
          {usingCustomCommission&&<small>Custom rate active · Enter the final rate with SST</small>}
        </label>
        <div className="setup-toggle-field"><label className="setup-toggle"><input type="checkbox" checked={fees.isSpayLater} onChange={event=>updateFee("isSpayLater",event.target.checked)}/><span><b>SPayLater</b></span></label><small>Transaction Fee {fees.isSpayLater?"4.86%":"3.78%"}</small></div>
        <div className="setup-toggle-field"><label className="setup-toggle"><input type="checkbox" checked={fees.isPreorder} onChange={event=>updateFee("isPreorder",event.target.checked)}/><span><b>Pre-Order Listing</b></span></label><small>Add {pct(positive(fees.preorder))}</small></div>
      </div>
      <div className="step-one-extra">
        <div className="pricing-goal-settings">
          <div className="pricing-goal-heading"><b>Price Goals</b><span>Set Campaign and Non-Campaign separately</span></div>
          <div className="pricing-goal-grid">{SCENARIOS.map(mode=>{const setting=pricingGoals[mode];return <article className={mode} key={mode}>
            <div><b>{SERVICE_MODES[mode].label}</b><small>We calculate the Shopee price from this goal</small></div>
            <label>Price Goal<select value={setting.goal} onChange={event=>updatePricingGoal(mode,{goal:event.target.value as PricingGoal})}><option value="facebookPayout">Match Meta Take-Home</option><option value="sameCustomerPrice">Match Meta Customer Price</option><option value="cheaperCustomerPrice">Lower Than Meta</option></select></label>
            {setting.goal==="cheaperCustomerPrice"&&<label>Discount<div className="discount-target-input"><select aria-label={`${SERVICE_MODES[mode].label} discount unit`} value={setting.discountUnit} onChange={event=>updatePricingGoal(mode,{discountUnit:event.target.value as DiscountUnit})}><option value="rm">RM</option><option value="percent">%</option></select><input aria-label={`${SERVICE_MODES[mode].label} discount value`} type="number" min="0" step=".01" placeholder="Enter value" value={setting.discountValue} onChange={event=>updatePricingGoal(mode,{discountValue:editableNumber(event.target.value)})}/></div></label>}
          </article>})}</div>
        </div>
        <div className="fee-fields advanced-fields">
          <label>Seller Voucher (RM)<input type="number" min="0" step=".01" value={fees.sellerVoucher} onChange={event=>updateFee("sellerVoucher",event.target.value)}/></label>
          <label>Seller Bear Shipping (RM)<input type="number" min="0" step=".01" value={fees.sellerShipping} onChange={event=>updateFee("sellerShipping",event.target.value)}/></label>
          <label>Meta Shipping (RM)<input type="number" min="0" step=".01" value={fees.facebookShipping} onChange={event=>updateFee("facebookShipping",event.target.value)}/></label>
          <label>CoFund Voucher (RM)<input type="number" min="0" step=".01" value={fees.cofundVoucher} onChange={event=>updateFee("cofundVoucher",event.target.value)}/></label>
        </div>
        <p className="formula-note">Voucher guide: {storeVoucherPreset.available?`${storeVoucherPreset.store} · Normal ${pct(positive(voucherRates.nonCampaign))} / Campaign ${pct(positive(voucherRates.campaign))}`:"No voucher preset · Both start at 0%"}. Source: {VOUCHER_PRESET_SOURCE.month} · {VOUCHER_PRESET_SOURCE.metric}.</p>
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
      <div className="calculator-section-head"><div><p className="kicker">STEP 2 · PACKAGE RESULTS</p><h3>Recommended Prices</h3></div><div className="calculator-result-head-actions"><button className="create-all-packages" disabled={!readyPackages.length} onClick={()=>setPendingConfirmation({kind:"batch",rows:readyConfirmationRows})}>Create All Ready ({readyPackages.length})</button><button onClick={addPackage}>+ Add Package</button></div></div>
      <div className="package-result-list">{calculations.map(({row,scenarios})=><article className="package-result-card dual-package-card" key={row.id}>
        <div className="dual-package-inputs">
          <label className="result-input"><span>Package</span><input className="package-name-input" value={row.name} onChange={event=>updatePackage(row.id,"name",event.target.value)}/></label>
          <label className="result-input facebook-price-field"><span>Meta Price</span><div className="money-input"><span>RM</span><input aria-label={`${row.name} Meta price`} type="number" step=".01" value={row.facebookPrice} onChange={event=>updatePackage(row.id,"facebookPrice",event.target.value)}/></div></label>
          <label className="result-input main-product-quantity"><span>Main Product Qty</span><input aria-label={`${row.name} main product quantity`} type="number" min="1" step="1" placeholder="Enter qty" value={row.mainProductQuantity} onChange={event=>updatePackage(row.id,"mainProductQuantity",event.target.value)}/></label>
          <div className="facebook-ppu"><span>Meta Unit Price</span><strong>{calculatePricePerUnit(row.facebookPrice,row.mainProductQuantity)===null?"—":money(calculatePricePerUnit(row.facebookPrice,row.mainProductQuantity)!)}</strong><small>Price ÷ Main Product Qty</small></div>
          <button className="remove-row" disabled={packages.length===1} onClick={()=>setPackages(current=>current.filter(item=>item.id!==row.id))} aria-label={`Remove ${row.name}`}>×</button>
        </div>
        <div className="package-sheet-head" aria-hidden="true"><span>Day & Goal</span><span>Shopee Price</span><span>Customer Price</span><span>Markup</span><span>Take-Home</span><span>Unit Price</span><span>Action</span></div>
        <div className="scenario-list">{scenarios.map(({mode,suggested,result})=>{
          return <div className="scenario-result" key={mode}>
            <div className="scenario-result-main">
              <div className={`scenario-badge ${mode}`}><b>{SERVICE_MODES[mode].label}</b><small>Service Fee {pct(SERVICE_MODES[mode].rate)} · Voucher {pct(positive(voucherRates[mode]))}</small><small className="scenario-goal">Goal: {pricingGoalSummary(mode)}</small></div>
              <div className="result-metric suggested-price"><span>Shopee Price</span><strong>{money(result.requiredPrice)}</strong><small>Listing Price</small></div>
              {pricingGoals[mode].goal==="cheaperCustomerPrice"?<label className="result-metric customer-price-editor"><span>Customer Price</span><div className="money-input"><b>RM</b><input aria-label={`${row.name} ${SERVICE_MODES[mode].label} customer price`} type="number" min="0" step=".01" value={row.customerTargets[mode]??result.customerPrice.toFixed(2)} onChange={event=>updateCustomerTarget(row.id,mode,event.target.value)}/></div><small>Edit for this package</small></label>:<div className="result-metric"><span>Customer Price</span><strong>{money(result.customerPrice)}</strong><small>After Shopee Voucher</small></div>}
              <label className="result-metric markup-editor"><span>Markup</span><div><input type="number" min="0" step=".01" value={row.markupRates[mode] ?? suggested.markupRate.toFixed(2)} onChange={event=>updateMarkup(row.id,mode,event.target.value)}/><b>%</b></div><small>Markup (RM) · {money(result.markupAmount)}</small></label>
              <div className="result-metric payout"><span>Take-Home</span><strong>{money(result.payout)}</strong><small className="facebook-payout">Meta Take-Home {money(positive(row.facebookPrice)-positive(fees.facebookShipping))}</small></div>
              <div className="result-metric customer-ppu"><span>Unit Price</span><strong>{calculatePricePerUnit(result.customerPrice,row.mainProductQuantity)===null?"—":money(calculatePricePerUnit(result.customerPrice,row.mainProductQuantity)!)}</strong><small>Customer Price ÷ Qty</small></div>
              <div className="package-result-actions"><button className="create-package-link" disabled={!row.name.trim()||!result.valid} onClick={()=>{const item=confirmationRow(row,mode,result,suggested);if(item)setPendingConfirmation({kind:"single",rows:[item]});}}>Create Package</button></div>
            </div>
            <details className="fee-breakdown"><summary>View {SERVICE_MODES[mode].label} Fee Breakdown</summary><div className="fee-breakdown-grid">
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
    {ladderReviews.length>0&&<section className="package-ladder-review card"><div className="calculator-section-head"><div><p className="kicker">PACKAGE PRICE LADDER REVIEW</p><h3>Package Unit Price Review</h3><span>Shows packages with Main Product Qty</span></div><button className="create-all-packages" disabled={!readyPackages.length} onClick={()=>setPendingConfirmation({kind:"batch",rows:readyConfirmationRows})}>Create All Ready ({readyPackages.length})</button></div><div className="ladder-sheet"><div className="ladder-sheet-head"><span>Package</span><span>Qty</span><span>Non-Campaign Unit Price</span><span>Campaign Unit Price</span><span>Price Level</span></div>{packages.flatMap(row=>{const nonCampaign=ladderReviews.find(review=>review.mode==="nonCampaign")?.rows.find(item=>item.name===row.name);const campaign=ladderReviews.find(review=>review.mode==="campaign")?.rows.find(item=>item.name===row.name);if(!nonCampaign||!campaign)return[];return [<div className="ladder-sheet-row" key={row.id}><b>{row.name}</b><span>{positive(row.mainProductQuantity)}</span><strong>{money(nonCampaign.ppu)}</strong><strong>{money(campaign.ppu)}</strong><em className={nonCampaign.status}>{nonCampaign.label}</em></div>];})}</div></section>}
    {pendingConfirmation&&<div className="calculator-confirm-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setPendingConfirmation(null);}}><section className="calculator-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="calculator-confirm-title"><header><div><p className="kicker">FINAL CHECK</p><h3 id="calculator-confirm-title">Check Final Packages & Prices</h3><span>Continue to Packages & Pricing after you confirm.</span></div><button aria-label="Close confirmation" onClick={()=>setPendingConfirmation(null)}>×</button></header><div className="calculator-confirm-table"><table><thead><tr><th>Package</th><th>Day</th><th>Main Product Qty</th><th>Meta Price</th><th>Meta Unit Price</th><th>Shopee Price</th><th>Customer Price</th><th>Unit Price</th></tr></thead><tbody>{pendingConfirmation.rows.map((item,index)=><tr key={`${item.prefill.requestId}-${index}`}><td><b>{item.prefill.name}</b></td><td>{item.scenario}</td><td>{item.quantity||"—"}</td><td>{money(item.prefill.calculatorSettings.facebookPrice)}</td><td>{item.facebookPpu===null?"—":money(item.facebookPpu)}</td><td><strong>{money(item.prefill.sellingPrice)}</strong></td><td>{money(item.prefill.calculatorSettings.customerVoucherPrice)}</td><td>{item.customerPpu===null?"—":money(item.customerPpu)}</td></tr>)}</tbody></table></div><footer><button className="confirm-cancel" onClick={()=>setPendingConfirmation(null)}>Back to Edit</button><button className="confirm-create" onClick={confirmCreate}>Confirm & Continue</button></footer></section></div>}
  </div>;
}
