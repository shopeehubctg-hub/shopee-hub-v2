"use client";

import { useMemo, useState } from "react";

type PackageRow = { id:number; name:string; facebookPrice:number };
type FeeSettings = {
  transaction:number; commission:number; service:number; platformSupport:number;
  shopeeVoucher:number; sellerVoucher:number; cofundVoucher:number;
  sellerShipping:number; facebookShipping:number; extraProfit:number;
};

const INITIAL_PACKAGES:PackageRow[] = [
  { id:1, name:"Package A", facebookPrice:289 },
  { id:2, name:"Package B", facebookPrice:358 },
  { id:3, name:"Package C", facebookPrice:716 },
];

const INITIAL_FEES:FeeSettings = {
  transaction:3.78, commission:12.96, service:5.94, platformSupport:0.54,
  shopeeVoucher:16, sellerVoucher:0, cofundVoucher:20,
  sellerShipping:0, facebookShipping:10, extraProfit:0,
};

const money = (value:number) => `RM ${Number.isFinite(value) ? value.toFixed(2) : "0.00"}`;
const pct = (value:number) => `${Number.isFinite(value) ? value.toFixed(2) : "0.00"}%`;
const positive = (value:string) => Math.max(0, Number(value) || 0);

function calculate(row:PackageRow, fees:FeeSettings) {
  const rate = (fees.transaction + fees.commission + fees.service) / 100;
  const targetPayout = row.facebookPrice - fees.facebookShipping + fees.extraProfit;
  const requiredPrice = rate >= 1 ? 0 : (
    targetPayout +
    fees.sellerVoucher * (1 - rate) -
    fees.cofundVoucher * (rate - 0.5) +
    fees.platformSupport +
    fees.sellerShipping
  ) / (1 - rate);
  const feeBase = Math.max(0, requiredPrice - fees.sellerVoucher - fees.cofundVoucher);
  const transactionFee = feeBase * fees.transaction / 100;
  const commissionFee = feeBase * fees.commission / 100;
  const serviceFee = feeBase * fees.service / 100;
  const payout = requiredPrice - fees.sellerVoucher - fees.cofundVoucher / 2 -
    transactionFee - commissionFee - serviceFee - fees.platformSupport - fees.sellerShipping;
  const customerPrice = feeBase * (1 - fees.shopeeVoucher / 100);
  const markupAmount = requiredPrice - row.facebookPrice;
  const markupRate = row.facebookPrice ? markupAmount / row.facebookPrice * 100 : 0;
  return { targetPayout, requiredPrice, customerPrice, payout, markupAmount, markupRate, transactionFee, commissionFee, serviceFee };
}

export function PriceCalculator() {
  const [packages,setPackages] = useState(INITIAL_PACKAGES);
  const [fees,setFees] = useState(INITIAL_FEES);
  const [showSettings,setShowSettings] = useState(true);
  const calculations = useMemo(()=>packages.map(row=>({row,result:calculate(row,fees)})),[packages,fees]);
  const totalRate = fees.transaction + fees.commission + fees.service;

  function updateFee(key:keyof FeeSettings, value:string) {
    setFees(current=>({...current,[key]:positive(value)}));
  }
  function updatePackage(id:number, key:"name"|"facebookPrice", value:string) {
    setPackages(current=>current.map(row=>row.id===id?{...row,[key]:key==="facebookPrice"?positive(value):value}:row));
  }
  function addPackage() {
    setPackages(current=>[...current,{id:Math.max(0,...current.map(row=>row.id))+1,name:`Package ${String.fromCharCode(65+current.length)}`,facebookPrice:0}]);
  }

  return <div className="price-calculator">
    <section className="calculator-hero">
      <div><p className="kicker">SHOPEE MY · MARKUP CALCULATOR</p><h2>配套卖价倒推计算机</h2><p>先输入 Facebook / WhatsApp 卖价，系统倒推 Shopee 应卖多少钱，保护你原本的到手金额。</p></div>
      <div className="calculator-hero-result"><span>当前总百分比收费</span><strong>{pct(totalRate)}</strong><small>Transaction + Commission + Service</small></div>
    </section>

    <section className="fee-strip">
      <article><span>Transaction Fee</span><strong>{pct(fees.transaction)}</strong></article>
      <article><span>Commission Fee</span><strong>{pct(fees.commission)}</strong></article>
      <article><span>Service Fee</span><strong>{pct(fees.service)}</strong></article>
      <article className="fee-total"><span>Total Fee Rate</span><strong>{pct(totalRate)}</strong></article>
      <button onClick={()=>setShowSettings(value=>!value)}>{showSettings?"收起设定":"调整 Fee & Voucher"}</button>
    </section>

    {showSettings&&<section className="calculator-settings card">
      <div className="calculator-section-head"><div><p className="kicker">CALCULATION SETTINGS</p><h3>Fee、Voucher 与运费</h3></div><span>预填参考表 21 May 2026 数值 · 可按店铺实际情况修改</span></div>
      <div className="fee-fields">
        <label>Transaction Fee (%)<input type="number" step=".01" value={fees.transaction} onChange={event=>updateFee("transaction",event.target.value)}/></label>
        <label>Commission Fee (%)<input type="number" step=".01" value={fees.commission} onChange={event=>updateFee("commission",event.target.value)}/></label>
        <label>Service Fee (%)<input type="number" step=".01" value={fees.service} onChange={event=>updateFee("service",event.target.value)}/></label>
        <label>Platform Support Fee (RM)<input type="number" step=".01" value={fees.platformSupport} onChange={event=>updateFee("platformSupport",event.target.value)}/></label>
        <label>Shopee Voucher Discount (%)<input type="number" step=".01" value={fees.shopeeVoucher} onChange={event=>updateFee("shopeeVoucher",event.target.value)}/></label>
        <label>Seller Voucher (RM)<input type="number" step=".01" value={fees.sellerVoucher} onChange={event=>updateFee("sellerVoucher",event.target.value)}/></label>
        <label>Co-fund Voucher (RM)<input type="number" step=".01" value={fees.cofundVoucher} onChange={event=>updateFee("cofundVoucher",event.target.value)}/></label>
        <label>Seller Bear Shipping (RM)<input type="number" step=".01" value={fees.sellerShipping} onChange={event=>updateFee("sellerShipping",event.target.value)}/></label>
        <label>Facebook Shipping (RM)<input type="number" step=".01" value={fees.facebookShipping} onChange={event=>updateFee("facebookShipping",event.target.value)}/></label>
        <label>Extra Profit Target (RM)<input type="number" step=".01" value={fees.extraProfit} onChange={event=>updateFee("extraProfit",event.target.value)}/></label>
      </div>
      <p className="formula-note">到手目标 = Facebook 卖价 − Facebook 运费 + 额外利润。Shopee fee 以扣除 Seller Voucher 与 Co-fund Voucher 后的 fee base 计算；Co-fund 默认由卖家承担一半。</p>
    </section>}

    <section className="calculator-table card">
      <div className="calculator-section-head"><div><p className="kicker">PACKAGE RESULTS</p><h3>每个配套的建议卖价</h3></div><button onClick={addPackage}>+ Add package</button></div>
      <div className="calculator-table-scroll"><table>
        <thead><tr><th>配套</th><th>FB 卖价</th><th>建议 Shopee 卖价</th><th>需要 Markup</th><th>顾客 Voucher 后价钱</th><th>你的目标到手</th><th>实际到手</th><th>Transaction Fee</th><th>Commission Fee</th><th>Service Fee</th><th></th></tr></thead>
        <tbody>{calculations.map(({row,result})=><tr key={row.id}>
          <td><input className="package-name-input" value={row.name} onChange={event=>updatePackage(row.id,"name",event.target.value)}/></td>
          <td><div className="money-input"><span>RM</span><input type="number" step=".01" value={row.facebookPrice} onChange={event=>updatePackage(row.id,"facebookPrice",event.target.value)}/></div></td>
          <td className="suggested-price"><strong>{money(result.requiredPrice)}</strong><small>Listing price</small></td>
          <td><strong className="markup">{pct(result.markupRate)}</strong><small>{money(result.markupAmount)}</small></td>
          <td><strong>{money(result.customerPrice)}</strong><small>顾客角度</small></td>
          <td>{money(result.targetPayout)}</td>
          <td className="payout"><strong>{money(result.payout)}</strong><small>{Math.abs(result.payout-result.targetPayout)<.02?"✓ 已保护利润":"检查设定"}</small></td>
          <td>{money(result.transactionFee)}<small>{pct(fees.transaction)}</small></td>
          <td>{money(result.commissionFee)}<small>{pct(fees.commission)}</small></td>
          <td>{money(result.serviceFee)}<small>{pct(fees.service)}</small></td>
          <td><button className="remove-row" disabled={packages.length===1} onClick={()=>setPackages(current=>current.filter(item=>item.id!==row.id))} aria-label={`Remove ${row.name}`}>×</button></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="calculator-explanation">
      <article><b>顾客看到什么？</b><span>建议 Shopee 卖价是 listing price；“顾客 Voucher 后价钱”模拟平台 voucher 后的成交价。</span></article>
      <article><b>你拿到什么？</b><span>实际到手已经扣掉 Transaction、Commission、Service、Platform Support、卖家承担 voucher 和运费。</span></article>
      <article><b>为什么 fee 可修改？</b><span>Commission 与 Service 会因卖家类型、商品分类和参加的 campaign 改变，实际账单费率优先。</span></article>
    </section>
  </div>;
}
