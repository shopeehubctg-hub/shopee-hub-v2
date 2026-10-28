"use client";

import { useEffect, useId, useRef, useState } from "react";
import { previousMonth } from "./account-ledger";
import { MARKET_CONFIG, type MarketCode } from "./markets";
import "./store-exchange-rate-field.css";

type RateResponse = {
  status:"available"|"pending"; market:"TH"|"PH"; currency:"THB"|"PHP";
  invoiceMonth:string; serviceMonth:string; policy:"bnm-service-average";
  rate:string|null; quotationUnit:1; reference:string;
};
type Result = {key:string;data:RateResponse}|{key:string;error:true};
type Props = {market:MarketCode;invoiceMonth:string;onInvoiceMonthChange:(month:string)=>void;showInvoiceMonth?:boolean};

export function StoreExchangeRateField({market,invoiceMonth,onInvoiceMonthChange,showInvoiceMonth=false}:Props) {
  const labelId=useId();
  const [result,setResult]=useState<Result|null>(null);
  const [retry,setRetry]=useState(0);
  const sequence=useRef(0);
  const supported=market==="TH"||market==="PH";
  const validMonth=/^20\d{2}-(0[1-9]|1[0-2])$/.test(invoiceMonth);
  const key=`${market}:${invoiceMonth}:${retry}`;
  useEffect(()=>{
    if(!supported||!validMonth)return;
    const controller=new AbortController();
    const request=++sequence.current;
    async function load() {
      try {
        const response=await fetch(`/api/admin/store-exchange-rate?market=${market}&invoiceMonth=${encodeURIComponent(invoiceMonth)}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok)throw new Error("Exchange rate unavailable");
        const data=await response.json() as RateResponse;
        if(data.market!==market||data.invoiceMonth!==invoiceMonth||data.currency!==MARKET_CONFIG[market].currency||data.policy!=="bnm-service-average"||data.quotationUnit!==1||data.serviceMonth!==previousMonth(invoiceMonth)||!["available","pending"].includes(data.status)||(data.status==="available"&&(typeof data.rate!=="string"||!/^\d+(?:\.\d+)?$/.test(data.rate)||!/[1-9]/.test(data.rate)))||(data.status==="pending"&&data.rate!==null))throw new Error("Invalid exchange rate");
        if(!controller.signal.aborted&&request===sequence.current)setResult({key,data});
      } catch {
        if(!controller.signal.aborted&&request===sequence.current)setResult({key,error:true});
      }
    }
    void load();
    return ()=>controller.abort();
  },[key,market,invoiceMonth,supported,validMonth]);

  if(!supported)return null;
  const current=result?.key===key?result:null;
  const data=current&&"data" in current?current.data:null;
  const failed=Boolean(current&&"error" in current);
  return <section className="store-exchange-rate" aria-labelledby={labelId}>
    <div className="store-exchange-rate-heading"><strong id={labelId}>Currency Exchange Rate</strong><span>Bank Negara monthly average</span></div>
    {showInvoiceMonth&&<label className="store-exchange-rate-month">Invoice Month<input type="month" value={invoiceMonth} onInput={event=>onInvoiceMonthChange(event.currentTarget.value)} onChange={event=>onInvoiceMonthChange(event.currentTarget.value)}/></label>}
    <div className="store-exchange-rate-result" aria-live="polite" aria-atomic="true">
      {!validMonth?<span>Choose an Invoice Month.</span>:failed?<><span role="alert">Exchange rate could not be loaded.</span><button type="button" onClick={()=>setRetry(value=>value+1)}>Retry exchange rate</button></>:!data?<span role="status">Loading exchange rate…</span>:<>
        {data.status==="available"?<output title={data.reference}>1 {data.currency} = MYR {data.rate}</output>:<span role="status">Pending · Monthly average not yet published</span>}
        <small>Service month · {data.serviceMonth}</small>
      </>}
    </div>
  </section>;
}
