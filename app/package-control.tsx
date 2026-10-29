"use client";
import {PackageBatchPreview} from "./package-batch-preview";

import { MARKET_CODES, MARKET_CONFIG, isMarket, marketMoney, marketFromPlatform, marketDate, type MarketCode } from "./markets";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import "./package-list-view.css";
import { packageSamples } from "./package-samples";
import type { CalculatorSnapshot, PackagePrefill } from "./calculator-types";
import { calculatorSnapshots, packageHistoryChanges, packageHistoryTime, type PackageHistorySnapshot } from "./package-history";
import { defaultRecurringEvent, recurringEventIds, recurringEventLabels, validateRecurringCampaign, type RecurringCampaignEvent, type RecurringCampaignRule } from "./recurring-campaign";

type ComponentLine = { inventorySku:string; name:string; quantity:number; kind:"product"|"gift" };
type PlatformName = "Shopee"|"Lazada"|"TikTok Shop";
type PlatformLine = { platform:PlatformName; packageSku:string };
type MarketName = MarketCode;
type PriceType = "non_campaign"|"campaign";
type CampaignEvent = "dday"|"mid_month"|"payday";
type FormSection = "Package Details"|"Pricing & Promotion"|"Inventory Items"|"Saving";
type FormError = { section:FormSection; message:string };
type PriceSchedule = {
  market:MarketName; priceType:PriceType; originalPrice:number; sellingPrice:number;
  promotionType:"monthly"|"custom"; effectiveFrom:string; effectiveTo:string|null;
};
type PriceScheduleInput = Omit<PriceSchedule,"originalPrice"|"sellingPrice"> & { originalPrice:string; sellingPrice:string };
type CampaignPeriod = { effectiveFrom:string; effectiveTo:string; originalFrom?:string; originalTo?:string };
type RecurringEventDraft = Omit<RecurringCampaignEvent,"prices"> & {prices:Partial<Record<MarketName,{originalPrice:string;sellingPrice:string}>>};
type CalculatorHistorySettings = CalculatorSnapshot | { scenarios:CalculatorSnapshot[] };
type HistoryLine = PackageHistorySnapshot & {
  version:number; changeNote:string; promotionType:"monthly"|"custom"; effectiveFrom:string; effectiveTo?:string|null;
  addedComponents?:ComponentLine[]; removedComponents?:ComponentLine[]; platforms?:PlatformLine[];
  sheetSyncStatus?:"not_sent"|"pending"|"synced"|"failed"; createdAt:string; createdBy:string;
  calculatorSettings?:CalculatorHistorySettings|null;
};
export type PackageItem = {
  id:string; storeId:string; storeName?:string; packageSku:string; name:string; market:string; status:string; version:number;
  pendingVersion?:number|null; durationType?:"long_term"|"monthly";
  promotionType:"monthly"|"custom"; originalPrice:number; sellingPrice:number; effectiveFrom:string; effectiveTo?:string|null;
  components:ComponentLine[]; platforms:PlatformLine[]; sheetSyncStatus?:"not_sent"|"pending"|"synced"|"failed"; history?:HistoryLine[]; historyLoaded?:boolean; samePricing?:boolean;
  priceSchedules?:PriceSchedule[];
  recurringCampaign?:RecurringCampaignRule|null; currentPriceLabel?:string;
};
function sellingMarkets(item:PackageItem):MarketCode[] {
  const codes=new Set<string>((item.market??"").split(",").map(code=>code.trim()));
  for(const line of item.priceSchedules??[])if(isMarket(line.market))codes.add(line.market);
  for(const event of item.recurringCampaign?.events??[])for(const code of MARKET_CODES)if(event.prices[code])codes.add(code);
  return MARKET_CODES.filter(code=>codes.has(code));
}
// Duration follows the normal-day period. Recurring campaigns have their own dates.
function packageDuration(item:PackageItem):"long-term"|"monthly"|"unknown" {
  if(item.durationType) return item.durationType==="long_term"?"long-term":"monthly";
  const normal=(item.priceSchedules??[]).filter(line=>line.priceType==="non_campaign");
  if(normal.length) return normal.some(line=>line.effectiveTo===null)?"long-term":"monthly";
  if(item.priceSchedules?.length) return "unknown";
  const end=item.effectiveTo;
  return end===null?"long-term":end?"monthly":"unknown";
}
const durationLabel=(item:PackageItem)=>({"long-term":"Long Term","monthly":"Monthly","unknown":"Not recorded"}[packageDuration(item)]);

type KitExportPreview = { packageCount:number; rowCount:number; signature:string };
type KitExportResponse = KitExportPreview & { rows:Array<{kitSku:string;inventorySku:string;quantity:number;price:1}> };
type Props = { storeId:string; storeName:string; storePlatform?:string; canCreate?:boolean; allowSamplePreview?:boolean; staging?:boolean; prefills?:PackagePrefill[]; standaloneCreate?:boolean; draftStorageKey?:string; onPrefillsAccepted?:()=>void };
type StoredBatch = { prefills:PackagePrefill[]; storeId?:string; requestIds?:Record<string,string> };

const PLATFORM_NAMES:PlatformName[] = ["Shopee","Lazada","TikTok Shop"];
const HISTORY_SHEET_URL = "https://docs.google.com/spreadsheets/d/1mpB7KVCGzP_9IXYVbhJZsLsndM4ladU3cJre5cfALAA/edit#gid=2129880014";
const blankLine = ():ComponentLine => ({ inventorySku:"", name:"", quantity:1, kind:"product" });
const blankRecurringEvents = ():RecurringEventDraft[] => recurringEventIds.map(id=>({...defaultRecurringEvent(id),prices:Object.fromEntries(MARKET_CODES.map(market=>[market,{originalPrice:"",sellingPrice:""}]))}));
const blankPeriod = () => ({ promotionType:"monthly" as "monthly"|"custom", promotionMonth:"", effectiveFrom:"", effectiveTo:"" });
type MarketPrices = {nonCampaignOriginal:string;nonCampaignSelling:string;campaignOriginal:string;campaignSelling:string};
const blankMarketPrices = ():Record<MarketName,MarketPrices> => Object.fromEntries(MARKET_CODES.map(market=>[market,{nonCampaignOriginal:"",nonCampaignSelling:"",campaignOriginal:"",campaignSelling:""}])) as Record<MarketName,MarketPrices>;
const blankForm = (market:MarketName="MY") => ({
  name:"", markets:[market] as MarketName[],
  samePricing:false,
  longTerm:false,
  campaignLongTerm:false,
  nonCampaign:blankPeriod(), campaign:{...blankPeriod(),promotionType:"custom" as const,campaignEvents:["dday"] as CampaignEvent[]},
  prices:blankMarketPrices(),
  changeNote:"Initial version",
});
const money = marketMoney;
const lineText = (line:ComponentLine) => `${line.inventorySku} ×${line.quantity}`;

function monthDates(month:string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from:"", to:"" };
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { from:`${month}-01`, to:`${month}-${String(lastDay).padStart(2,"0")}` };
}

function campaignDates(month:string,event:CampaignEvent) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from:"", to:"" };
  const monthNumber=Number(month.slice(5));
  const [startDay,endDay]=event==="dday"?[Math.max(1,monthNumber-2),monthNumber]:event==="mid_month"?[14,15]:[24,25];
  const day=(value:number)=>String(value).padStart(2,"0");
  return {from:`${month}-${day(startDay)}`,to:`${month}-${day(endDay)}`};
}

function campaignEventForDates(from:string,to:string):CampaignEvent|null {
  const month=from.slice(0,7);
  return (["dday","mid_month","payday"] as CampaignEvent[]).find(event=>{
    const dates=campaignDates(month,event);
    return dates.from===from&&dates.to===to;
  })??null;
}

function packageMonthLabel(month:string) {
  const parsed=/^\d{4}-\d{2}$/.test(month)?new Date(month+"-01T00:00:00Z"):null;
  return parsed&&!Number.isNaN(parsed.getTime())?parsed.toLocaleString("en-US",{month:"long",year:"numeric",timeZone:"UTC"}):"Campaign";
}
function shortMonthLabel(month:string) {
  const parsed=/^\d{4}-\d{2}$/.test(month)?new Date(month+"-01T00:00:00Z"):null;
  return parsed&&!Number.isNaN(parsed.getTime())?parsed.toLocaleString("en-US",{month:"short",year:"numeric",timeZone:"UTC"}):month;
}
function displayDate(date:string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)?`${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`:date;
}
function normalPeriodLabel(lines:PriceSchedule[]) {
  const months=lines.filter(line=>line.promotionType==="monthly"&&line.effectiveFrom===monthDates(line.effectiveFrom.slice(0,7)).from&&line.effectiveTo===monthDates(line.effectiveFrom.slice(0,7)).to).map(line=>line.effectiveFrom.slice(0,7));
  if(months.length===lines.length) return [...new Set(months)].sort().map(shortMonthLabel).join(" | ");
  return lines.map(line=>`${displayDate(line.effectiveFrom)}–${line.effectiveTo?displayDate(line.effectiveTo):"Ongoing"}`).join(" | ");
}

function packageCampaignMonths(from:string,to:string|null) {
  const event=campaignEventForDates(from,to??"");
  const label=event?recurringEventLabels[event]:"Campaign Day";
  if(!to)return [{month:"Every month",label}];
  const first=from.slice(0,7),last=to.slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(first)||!/^\d{4}-\d{2}$/.test(last)||last<first)return [{month:first,label}];
  const months:{month:string;label:string}[]=[];
  let year=Number(first.slice(0,4)),month=Number(first.slice(5));
  for(let count=0;count<36;count++){
    const key=`${year}-${String(month).padStart(2,"0")}`;
    if(key>last)break;
    months.push({month:key,label});
    if(key===last)break;
    if(++month===13){year++;month=1;}
  }
  if(months.at(-1)?.month!==last)months.push({month:"Every month",label});
  return months;
}

function PackagePriceSummary({item,country="all"}:{item:PackageItem;country?:"all"|MarketCode}) {
  const schedules=item.priceSchedules??[];
  const markets=MARKET_CODES.filter(market=>(country==="all"||country===market)&&(schedules.some(line=>line.market===market)||item.recurringCampaign?.events.some(event=>event.prices[market])));
  return <div className="package-market-prices">{markets.map(market=>{
    const marketSchedules=schedules.filter(line=>line.market===market);
    const campaign=item.recurringCampaign
      ? item.recurringCampaign.events.flatMap(event=>event.prices[market]?[{...event.prices[market]!,months:[{month:"Every month",label:recurringEventLabels[event.id]}]}]:[])
      : marketSchedules.filter(line=>line.priceType==="campaign").map(line=>({...line,months:packageCampaignMonths(line.effectiveFrom,line.effectiveTo)}));
    const groups=new Map<string,{originalPrice:number;sellingPrice:number;normal:boolean;normalLines:PriceSchedule[];campaignMonths:Map<string,Set<string>>}>();
    const add=(originalPrice:number,sellingPrice:number,isNormal:boolean,months:{month:string;label:string}[]=[],normalLine?:PriceSchedule)=>{
      if(!Number.isFinite(originalPrice)||!Number.isFinite(sellingPrice))return;
      const key=`${Math.round(originalPrice*100)}:${Math.round(sellingPrice*100)}`;
      const group=groups.get(key)??{originalPrice,sellingPrice,normal:false,normalLines:[],campaignMonths:new Map<string,Set<string>>()};
      if(isNormal)group.normal=true;
      if(normalLine)group.normalLines.push(normalLine);
      for(const {month,label} of months){
        const labels=group.campaignMonths.get(month)??new Set<string>();
        labels.add(label);
        group.campaignMonths.set(month,labels);
      }
      groups.set(key,group);
    };
    marketSchedules.filter(line=>line.priceType==="non_campaign").forEach(line=>add(line.originalPrice,line.sellingPrice,true,[],line));
    campaign.forEach(line=>add(line.originalPrice,line.sellingPrice,false,line.months));
    const oneSharedPrice=groups.size===1&&campaign.length>0&&marketSchedules.some(line=>line.priceType==="non_campaign");
    return <div className="package-market-column" key={market}>
      <h4>{market} <small>{MARKET_CONFIG[market].symbol}</small></h4>
      {[...groups.entries()].map(([key,group])=><div className="package-market-price-row" key={key}>
        <div className="package-market-price-head">
          <span>{oneSharedPrice?"Campaign Day & Normal Day Same Price":group.normal?"Normal Day Price":"Campaign Day Price"}</span>
          <div className="package-market-price-values"><small>Original Price <del>{money(group.originalPrice,market)}</del></small><strong>{money(group.sellingPrice,market)}</strong></div>
        </div>
        {group.normalLines.length>0&&<div className="package-normal-period">Period: {normalPeriodLabel(group.normalLines)}</div>}
        {!oneSharedPrice&&group.campaignMonths.size>0&&<div className="package-campaign-months">{[...group.campaignMonths.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([month,labels])=><div className="package-campaign-month" key={month}><b>{month==="Every month"?month:shortMonthLabel(month)}</b><span>{[...labels].sort((a,b)=>["Double Day","Mid Month Madness","Payday","Campaign Day"].indexOf(a)-["Double Day","Mid Month Madness","Payday","Campaign Day"].indexOf(b)).join(" | ")}</span></div>)}</div>}
      </div>)}
    </div>;
  })}</div>;
}

export function PackageControl({ storeId, storeName, storePlatform, canCreate=true, allowSamplePreview=false, staging=false, prefills=[], standaloneCreate=false, draftStorageKey, onPrefillsAccepted }:Props) {
  const [items,setItems] = useState<PackageItem[]>([]);
  const [sampleMode,setSampleMode] = useState(false);
  const [canShowSamples,setCanShowSamples] = useState(false);
  const [loadedStoreId,setLoadedStoreId] = useState("");
  const [listState,setListState] = useState<{storeId:string;status:"loading"|"ready"|"error";error?:string}>({storeId,status:"loading"});
  const [source,setSource] = useState("");
  const [canDelete,setCanDelete] = useState(false);
  const [canExportKits,setCanExportKits] = useState(false);
  const [selectedKitIds,setSelectedKitIds] = useState<string[]>([]);
  const [kitPreview,setKitPreview] = useState<KitExportPreview|null>(null);
  const [kitBusy,setKitBusy] = useState(false);
  const [kitError,setKitError] = useState("");
  const [filter,setFilter] = useState("all");
  const [search,setSearch] = useState("");
  const [durationFilter,setDurationFilter] = useState("all");
  const [countryFilter,setCountryFilter] = useState<"all"|MarketCode>("all");
  const [view,setView] = useState<"grid"|"list">("grid");
  const [openDetails,setOpenDetails] = useState<string|null>(null);
  const [displayCount,setDisplayCount] = useState(30);
  const [showCreate,setShowCreate] = useState(false);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState("");
  const [messageType,setMessageType] = useState<"success"|"warning"|"error">("success");
  const [formErrors,setFormErrors] = useState<FormError[]>([]);
  const [editingPackageId,setEditingPackageId] = useState<string|null>(null);
  const [editingDraft,setEditingDraft] = useState(false);
  const [editingVersion,setEditingVersion] = useState<number|null>(null);
  const [editingStore,setEditingStore] = useState<{id:string;name:string}|null>(null);
  const [openHistory,setOpenHistory] = useState<string|null>(null);
  const historyOpenId=useRef<string|null>(null);
  const [packageEnvironment,setPackageEnvironment]=useState(staging?"staging":"production");
  const [historyResults,setHistoryResults]=useState<Record<string,{status:"loading"|"ready"|"error";history?:HistoryLine[]}>>({});
  const historyGeneration=useRef(0);
  const historyRequests=useRef(new Map<string,AbortController>());
  const listController=useRef<AbortController|null>(null);
  const [form,setForm] = useState(()=>blankForm(marketFromPlatform(storePlatform)));
  const [campaignPeriods,setCampaignPeriods] = useState<CampaignPeriod[]>([]);
  const [campaignMonths,setCampaignMonths] = useState<string[]>([]);
  const [nonCampaignMonths,setNonCampaignMonths] = useState<string[]>([]);
  const [showRecurringEndDate,setShowRecurringEndDate] = useState(false);
  const [recurringEvents,setRecurringEvents] = useState<RecurringEventDraft[]>(blankRecurringEvents);
  const [components,setComponents] = useState<ComponentLine[]>([blankLine()]);
  const [platforms,setPlatforms] = useState<PlatformLine[]>([{platform:"Shopee",packageSku:""}]);
  const [calculatorSettings,setCalculatorSettings] = useState<CalculatorSnapshot|null>(null);
  const [prefillQueue,setPrefillQueue] = useState<PackagePrefill[][]>([]);
  const [prefillBatch,setPrefillBatch] = useState<PackagePrefill[]>([]);
  const createRequestId=useRef<string>("");
  const batchRequestIds=useRef<Record<string,string>>({});
  const loadSequence=useRef(0);
  const originalCampaignSchedules=useRef<PriceSchedule[]>([]);
  const originalRecurringCampaign=useRef(false);
  const hasPackageScope=Boolean(storeId);
  const hasSelectedStore=Boolean(storeId&&storeId!=="all");
  const allStoresSelected=storeId==="all";

  function setHistoryOpen(id:string|null){historyOpenId.current=id;setOpenHistory(id);}
  function historyKey(item:PackageItem,environment=packageEnvironment){return `${environment}:${item.storeId}:${item.id}:${item.version}:${item.pendingVersion??""}`;}
  function invalidateHistory(clearState=true){
    ++historyGeneration.current;
    for(const request of historyRequests.current.values())request.abort();
    historyRequests.current.clear();
    if(clearState)setHistoryResults({});
  }
  async function requestPackageHistory(item:PackageItem,historySource=source,environment=packageEnvironment){
    if(sampleMode||historySource!=="database"||(item.historyLoaded!==false&&Array.isArray(item.history)))return;
    const key=historyKey(item,environment);
    if(historyRequests.current.has(key))return;
    const generation=historyGeneration.current;
    const controller=new AbortController();historyRequests.current.set(key,controller);
    setHistoryResults(current=>({...current,[key]:{status:"loading"}}));
    try{
      const response=await fetch(`/api/packages?storeId=${encodeURIComponent(item.storeId)}&packageId=${encodeURIComponent(item.id)}&history=1`,{cache:"no-store",signal:controller.signal});
      const data=await response.json();
      if(controller.signal.aborted||generation!==historyGeneration.current)return;
      if(!response.ok||data.packageId!==item.id||data.storeId!==item.storeId||!Array.isArray(data.history)||(data.environment&&data.environment!==environment))throw Error("History unavailable");
      setHistoryResults(current=>({...current,[key]:{status:"ready",history:data.history}}));
    }catch{
      if(!controller.signal.aborted&&generation===historyGeneration.current)setHistoryResults(current=>({...current,[key]:{status:"error"}}));
    }finally{if(historyRequests.current.get(key)===controller)historyRequests.current.delete(key);}
  }
  function toggleHistory(item:PackageItem){
    if(historyOpenId.current===item.id){setHistoryOpen(null);return;}
    setHistoryOpen(item.id);
    if(historyResults[historyKey(item)]?.status!=="ready")void requestPackageHistory(item);
  }

  function resetListScope() {
    setDisplayCount(30);setSelectedKitIds([]);setKitPreview(null);setKitError("");setHistoryOpen(null);setOpenDetails(null);
  }

  async function load(afterSave=false,historyId?:string) {
    const loadStarted=performance.now();
    let loadSucceeded=false;
    listController.current?.abort();
    const controller=new AbortController();listController.current=controller;
    invalidateHistory();
    if(loadedStoreId!==storeId) resetListScope();
    const allowSamples=allowSamplePreview&&window.location.hostname==="shopee-hub-v2-260731-git-cod-e05b8d-shopeehubctg-5199s-projects.vercel.app";
    setCanShowSamples(allowSamples);
    if(!allowSamples||loadedStoreId!==storeId||!storeId)setSampleMode(allowSamples&&!standaloneCreate&&new URLSearchParams(window.location.search).get("packageSamples")==="1");
    const sequence=++loadSequence.current;
    setListState({storeId,status:"loading"});
    if (!hasPackageScope) {
      setItems([]);
      setSource("store-selection-required");
      setListState({storeId,status:"ready"});
      setCanDelete(false);
      setCanExportKits(false);
      setSelectedKitIds([]);
      setKitPreview(null);
      setKitError("");
      return;
    }
    try {
      const response = await fetch(`/api/packages?storeId=${encodeURIComponent(storeId)}&compact=1`,{cache:"no-store",signal:controller.signal});
      if (!response.ok) throw new Error("Package list unavailable");
      const data=await response.json();
      if (sequence!==loadSequence.current) return;
      if(staging&&data.environment!=="staging")throw Error("Package environment does not match Staging");
      setItems(data.packages ?? []);
      const environment=data.environment??(staging?"staging":"production");
      setPackageEnvironment(environment);
      const selectedHistory=historyId??historyOpenId.current;
      if(selectedHistory){const item=(data.packages??[]).find((item:PackageItem)=>item.id===selectedHistory);if(item){setHistoryOpen(selectedHistory);void requestPackageHistory(item,data.source??"",environment);}else setHistoryOpen(null);}
      setLoadedStoreId(storeId);
      setListState({storeId,status:"ready"});
      loadSucceeded=true;
      setSource(data.source ?? "");
      setCanDelete(data.canDelete === true);
      setCanExportKits(data.canExportKits === true);
      setSelectedKitIds([]);
      setKitPreview(null);
      setKitError("");
    } catch {
      if (sequence===loadSequence.current&&!controller.signal.aborted) {
        setListState({storeId,status:"error",error:afterSave?"Package saved, but the list could not be refreshed.":"Packages could not be loaded."});
      }
    } finally {
      if(new URLSearchParams(window.location.search).get("debugLoad")==="1")console.debug("[package-load]",JSON.stringify({durationMs:Math.round(performance.now()-loadStarted),success:loadSucceeded&&!controller.signal.aborted&&sequence===loadSequence.current,aborted:controller.signal.aborted||sequence!==loadSequence.current}));
    }
  }
  useEffect(()=>{
    void load();
    let loadedDay = marketDate(marketFromPlatform(storePlatform));
    const refreshAfterDateChange = () => {
      const today = marketDate(marketFromPlatform(storePlatform));
      if (today !== loadedDay) { loadedDay = today; void load(); }
    };
    const interval = window.setInterval(refreshAfterDateChange,60_000);
    window.addEventListener("focus",refreshAfterDateChange);
    return () => { window.clearInterval(interval); window.removeEventListener("focus",refreshAfterDateChange);listController.current?.abort();++loadSequence.current;invalidateHistory(false); };
  },[storeId,storePlatform,allowSamplePreview,standaloneCreate,staging]);

  async function checkedKitRows():Promise<KitExportResponse> {
    const response=await fetch("/api/packages/fulfillment-sheet",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({storeId,packageIds:selectedKitIds}),cache:"no-store",
    });
    const data=await response.json();
    if (!response.ok) throw new Error(data.error??"Could not validate these packages.");
    return data as KitExportResponse;
  }

  async function previewKitExport() {
    setKitBusy(true); setKitError("");
    try {
      const result=await checkedKitRows();
      setKitPreview({packageCount:result.packageCount,rowCount:result.rowCount,signature:result.signature});
    } catch(error) { setKitError(error instanceof Error?error.message:"Could not validate these packages."); }
    finally { setKitBusy(false); }
  }

  async function downloadKitExport() {
    if (!kitPreview) return;
    setKitBusy(true); setKitError("");
    try {
      const result=await checkedKitRows();
      if (result.signature!==kitPreview.signature||result.rowCount!==kitPreview.rowCount) {
        setKitPreview({packageCount:result.packageCount,rowCount:result.rowCount,signature:result.signature});
        throw new Error("Package data changed since the preview. Review the updated row count, then download again.");
      }
      const {makeKitWorkbook}=await import("./package-kit-workbook");
      const bytes=makeKitWorkbook(result.rows);
      const url=URL.createObjectURL(new Blob([bytes],{type:"application/vnd.ms-excel"}));
      const anchor=document.createElement("a");
      anchor.href=url;
      anchor.download=`${storeName.replace(/[^a-z0-9_-]+/gi,"-")}-Kit-Products.xls`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
      setKitPreview(null);
      setSelectedKitIds([]);
    } catch(error) { setKitError(error instanceof Error?error.message:"Could not generate the file."); }
    finally { setKitBusy(false); }
  }
  function groupPrefills(input:PackagePrefill[]) {
    const groups = new Map<string,PackagePrefill[]>();
    input.forEach(item=>{
      const key=item.name.trim().toLowerCase();
      groups.set(key,[...(groups.get(key)??[]),item]);
    });
    return [...groups.values()];
  }
  function batchName(name:string) { return name.trim().toLowerCase(); }
  function readStoredBatch():StoredBatch|null {
    if (!draftStorageKey) return null;
    try {
      const saved=window.localStorage.getItem(draftStorageKey);
      return saved?JSON.parse(saved) as StoredBatch:null;
    } catch { return null; }
  }
  function saveStoredBatch(batch:StoredBatch) {
    if (!draftStorageKey) return;
    window.localStorage.setItem(draftStorageKey,JSON.stringify(batch));
  }
  function openPrefill(group:PackagePrefill[]) {
    setSampleMode(false);
    resetForm();
    const first=group[0];
    const stored=readStoredBatch();
    let recoveryUnavailable=Boolean(draftStorageKey&&!stored);
    if (stored) {
      const name=batchName(first.name);
      const requestId=stored.requestIds?.[name]??batchRequestIds.current[name]??crypto.randomUUID();
      batchRequestIds.current[name]=requestId;
      createRequestId.current=requestId;
      try { saveStoredBatch({...stored,requestIds:{...stored.requestIds,[name]:requestId}}); }
      catch { recoveryUnavailable=true; }
    } else if (draftStorageKey) {
      createRequestId.current=batchRequestIds.current[batchName(first.name)]??createRequestId.current;
    }
    const nonCampaign=group.find(item=>item.calculatorSettings.serviceScenario==="Non-Campaign Day")??first;
    const campaign=group.find(item=>item.calculatorSettings.serviceScenario==="Campaign Day")??first;
    const nonCampaignPrice=nonCampaign.sellingPrice.toFixed(2);
    const campaignPrice=campaign.sellingPrice.toFixed(2);
    setForm(current=>({...current,name:first.name,markets:["MY"],prices:{...current.prices,MY:{
      nonCampaignOriginal:"",nonCampaignSelling:nonCampaignPrice,
      campaignOriginal:"",campaignSelling:campaignPrice,
    }},changeNote:"Created from Shopee Pricing Calculator"}));
    setCalculatorSettings(first.calculatorSettings);
    setMessageType(recoveryUnavailable?"warning":"success");
    setMessage(recoveryUnavailable?"This package batch is unavailable in browser storage. Restore storage before saving so the remaining packages can be recovered.":"");
    setShowCreate(true);
  }
  useEffect(()=>{
    if (!prefills.length) return;
    const grouped=groupPrefills(prefills);
    const stored=readStoredBatch();
    const requestIds={...batchRequestIds.current,...stored?.requestIds};
    grouped.forEach(group=>{ const name=batchName(group[0].name); requestIds[name]??=crypto.randomUUID(); });
    batchRequestIds.current=requestIds;
    if (stored) {
      try { saveStoredBatch({...stored,requestIds}); } catch { /* Save is blocked until storage is available. */ }
    }
    openPrefill(grouped[0]);
    setPrefillQueue(grouped.slice(1));
    setPrefillBatch(prefills);
    onPrefillsAccepted?.();
  },[prefills[0]?.requestId]);

  const listLoading=!sampleMode&&hasPackageScope&&(listState.storeId!==storeId||listState.status==="loading");
  const listFailed=!sampleMode&&hasPackageScope&&listState.storeId===storeId&&listState.status==="error";
  const listReady=!listLoading&&!listFailed;
  const scopedItems=useMemo(()=>sampleMode?packageSamples(storeId||"all",storeName):(loadedStoreId===storeId?items:[]),[items,loadedStoreId,storeId,storeName,sampleMode]);
  const visible = useMemo(()=>scopedItems.filter(item =>
    (filter==="all"||item.status===filter) &&
    (durationFilter==="all"||packageDuration(item)===durationFilter) &&
    (countryFilter==="all"||sellingMarkets(item).includes(countryFilter)) &&
    `${item.packageSku} ${item.name} ${item.platforms?.map(platform=>platform.packageSku).join(" ")}`.toLowerCase().includes(search.toLowerCase())
  ),[scopedItems,filter,search,durationFilter,countryFilter]);
  const displayed = visible.slice(0,displayCount);
  const listMarkets=MARKET_CODES.filter(market=>(countryFilter==="all"||countryFilter===market)&&visible.some(item=>sellingMarkets(item).includes(market)));
  const active = scopedItems.filter(item=>item.status==="active").length;
  const scheduled = scopedItems.filter(item=>item.status==="scheduled").length;
  const drafts = scopedItems.filter(item=>item.status==="draft"||item.status==="review").length;

  function resetForm() {
    originalCampaignSchedules.current=[];
    originalRecurringCampaign.current=false;
    setCampaignPeriods([]);
    setCampaignMonths([]);
    setNonCampaignMonths([]);
    setShowRecurringEndDate(false);
    setRecurringEvents(blankRecurringEvents());
    createRequestId.current=crypto.randomUUID();
    setEditingPackageId(null);
    setEditingDraft(false);
    setEditingVersion(null);
    setEditingStore(null);
    setForm(blankForm(marketFromPlatform(storePlatform)));
    setComponents([blankLine()]);
    setPlatforms([{platform:"Shopee",packageSku:""}]);
    setCalculatorSettings(null);
    setFormErrors([]);
  }

  function openNew() {
    setPrefillQueue([]);
    setPrefillBatch([]);
    resetForm();
    setMessage("");
    setShowCreate(true);
  }

  function closeCreate() {
    if (standaloneCreate) {
      window.close();
      return;
    }
    setShowCreate(false);
    setPrefillQueue([]);
    setPrefillBatch([]);
    resetForm();
  }

  function togglePlatform(platform:PlatformName) {
    setPlatforms(current => current.some(item=>item.platform===platform)
      ? current.filter(item=>item.platform!==platform)
      : [...current,{platform,packageSku:""}]);
  }

  function addPlatformListing(platform:PlatformName) {
    setPlatforms(current=>[...current,{platform,packageSku:""}]);
  }

  function updatePlatformSku(index:number,packageSku:string) {
    setPlatforms(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,packageSku}:item));
  }

  function removePlatformListing(index:number) {
    setPlatforms(current=>current.filter((_,itemIndex)=>itemIndex!==index));
  }

  function updatePromotionMonth(period:"nonCampaign"|"campaign",month:string) {
    const dates = period==="campaign"?campaignDates(month,form.campaign.campaignEvents[0]??"dday"):monthDates(month);
    setForm(current=>({...current,[period]:{...current[period],promotionMonth:month,effectiveFrom:dates.from,effectiveTo:dates.to}}));
    if(period==="nonCampaign")setNonCampaignMonths(month?[month]:[]);
  }

  function updateCampaignEvent(campaignEvent:CampaignEvent) {
    setForm(current=>{
      const selected=current.campaign.campaignEvents.includes(campaignEvent)
        ? current.campaign.campaignEvents.filter(item=>item!==campaignEvent)
        : [...current.campaign.campaignEvents,campaignEvent];
      const campaignEvents=selected.length?selected:[campaignEvent];
      const dates=campaignDates(current.campaign.promotionMonth,campaignEvents[0]);
      return {...current,campaign:{...current.campaign,campaignEvents,effectiveFrom:dates.from,effectiveTo:dates.to}};
    });
  }

  function toggleMarket(market:MarketName) {
    setForm(current=>({...current,markets:current.markets.includes(market)
      ? current.markets.filter(item=>item!==market)
      : [...current.markets,market]}));
  }

  function updatePrice(market:MarketName,key:keyof ReturnType<typeof blankForm>["prices"]["MY"],value:string) {
    setForm(current=>({...current,prices:{...current.prices,[market]:{...current.prices[market],[key]:value}}}));
  }

  function recurringRule():RecurringCampaignRule|null {
    if (!form.campaignLongTerm||form.samePricing) return null;
    return {
      schema:1,startDate:form.campaign.effectiveFrom,endDate:form.campaign.effectiveTo||null,
      events:recurringEvents.filter(event=>form.campaign.campaignEvents.includes(event.id)).map(event=>({
        ...event,prices:Object.fromEntries(form.markets.map(market=>[market,{
          originalPrice:Number(form.prices[market].campaignOriginal),sellingPrice:Number(form.prices[market].campaignSelling),
        }])) as RecurringCampaignEvent["prices"],
      })),
    };
  }

  function activateRecurringCampaign() {
    setForm(current=>({...current,campaignLongTerm:true,campaign:{...current.campaign,promotionType:"custom",campaignEvents:current.campaign.campaignEvents.length?current.campaign.campaignEvents:["dday","mid_month","payday"],effectiveFrom:campaignPeriods[0]?.effectiveFrom||current.campaign.effectiveFrom||monthDates(current.campaign.promotionMonth).from,effectiveTo:""}}));
  }

  function recurringCampaignEditor() {
    return <div className="recurring-campaign-editor">
      <div className="date-fields"><label>Start Date<input type="date" value={form.campaign.effectiveFrom} onChange={event=>setForm(current=>({...current,campaign:{...current.campaign,effectiveFrom:event.target.value}}))}/></label><span>Ongoing every month</span></div>
      <fieldset className="recurring-event-options"><legend>Campaign Events · Multi-Select</legend>{recurringEvents.map(event=>{
        const selected=form.campaign.campaignEvents.includes(event.id);
        return <label className={`recurring-event${selected?" selected":""}`} key={event.id}><input type="checkbox" checked={selected} onChange={()=>setForm(current=>({...current,campaign:{...current.campaign,campaignEvents:selected?current.campaign.campaignEvents.filter(id=>id!==event.id):[...current.campaign.campaignEvents,event.id]}}))}/><b>{recurringEventLabels[event.id]}</b></label>;
      })}</fieldset>
      {editingPackageId&&<div className="recurring-end-date-control">{showRecurringEndDate||form.campaign.effectiveTo?<><label>End Date<input type="date" value={form.campaign.effectiveTo} min={form.campaign.effectiveFrom} onChange={event=>setForm(current=>({...current,campaign:{...current.campaign,effectiveTo:event.target.value}}))}/></label><button type="button" onClick={()=>{setShowRecurringEndDate(false);setForm(current=>({...current,campaign:{...current.campaign,effectiveTo:""}}));}}>Keep Ongoing</button></>:<button type="button" onClick={()=>setShowRecurringEndDate(true)}>Set End Date</button>}</div>}
    </div>;
  }

  function finiteCampaignEditor() {
    const events:CampaignEvent[]=["dday","mid_month","payday"];
    const labels:Record<CampaignEvent,string>={dday:"Double Day",mid_month:"Mid Month Madness",payday:"Payday"};
    const addSelectedMonth=(month:string)=>{
      if(!month||campaignMonths.includes(month))return;
      setCampaignMonths(current=>[...current,month].sort());
      if(form.nonCampaign.promotionType==="monthly"&&!form.longTerm)setNonCampaignMonths(current=>current.includes(month)?current:[...current,month].sort());
      else if(!form.longTerm){
        const end=monthDates(month).to;
        setForm(current=>current.nonCampaign.effectiveTo&&current.nonCampaign.effectiveTo<end?{...current,nonCampaign:{...current.nonCampaign,effectiveTo:end}}:current);
      }
    };
    const addMonth=()=>{
      const last=campaignMonths.at(-1)||form.campaign.promotionMonth||new Date().toISOString().slice(0,7);
      const [year,month]=last.split("-").map(Number);
      let offset=campaignMonths.length?0:-1;
      let next="";
      do {next=new Date(Date.UTC(year,month+offset++,1)).toISOString().slice(0,7);} while(campaignMonths.includes(next));
      addSelectedMonth(next);
    };
    return <div className="campaign-date-controls campaign-month-editor">
      <label>Add a Campaign month<input type="month" value="" onChange={event=>addSelectedMonth(event.target.value)}/></label>
      {campaignMonths.map(month=>{
        const monthPeriods=campaignPeriods.filter(period=>period.effectiveFrom.slice(0,7)===month);
        const monthName=new Date(month+"-01T00:00:00Z").toLocaleString("en-US",{month:"long",year:"numeric",timeZone:"UTC"});
        return <div className="campaign-month-card" key={month}>
          <div className="campaign-month-head"><strong>{monthName}</strong><button type="button" onClick={()=>{setCampaignMonths(current=>current.filter(value=>value!==month));setCampaignPeriods(current=>current.filter(period=>period.effectiveFrom.slice(0,7)!==month));}} aria-label={"Remove "+month+" Campaign month"}>Remove month</button></div>
          <fieldset><legend>Campaign Events · Multi-Select</legend>{events.map(event=>{
            const dates=campaignDates(month,event);
            const selected=monthPeriods.some(period=>period.effectiveFrom===dates.from&&period.effectiveTo===dates.to);
            return <label key={event} className={selected?"selected":""}><input type="checkbox" checked={selected} onChange={()=>setCampaignPeriods(current=>selected?current.filter(period=>!(period.effectiveFrom===dates.from&&period.effectiveTo===dates.to)):[...current.filter(period=>campaignEventForDates(period.effectiveFrom,period.effectiveTo)||!(period.effectiveFrom.slice(0,7)===month||period.effectiveFrom<=dates.to&&dates.from<=period.effectiveTo)),{effectiveFrom:dates.from,effectiveTo:dates.to}])}/><span><b>{labels[event]}</b></span></label>;
          })}</fieldset>
        </div>;
      })}
      <button type="button" onClick={addMonth}>+ Add Campaign Month</button>
      <small>Adding a Campaign month also covers that month with the Normal Day price.</small>
    </div>;
  }

  function priceSchedules():PriceScheduleInput[] {
    const schedules:PriceScheduleInput[]=[];
    form.markets.forEach(market=>{
      const nonCampaign:PriceScheduleInput={market,priceType:"non_campaign",originalPrice:form.prices[market].nonCampaignOriginal,sellingPrice:form.prices[market].nonCampaignSelling,promotionType:form.nonCampaign.promotionType,effectiveFrom:form.nonCampaign.effectiveFrom,effectiveTo:form.longTerm?null:form.nonCampaign.effectiveTo};
      const normalLines=form.longTerm||form.nonCampaign.promotionType!=="monthly"?[nonCampaign]:nonCampaignMonths.map(month=>({...nonCampaign,promotionType:"monthly" as const,effectiveFrom:monthDates(month).from,effectiveTo:monthDates(month).to}));
      schedules.push(...normalLines);
      const campaignOriginal=form.samePricing?nonCampaign.originalPrice:form.prices[market].campaignOriginal;
      const campaignSelling=form.samePricing?nonCampaign.sellingPrice:form.prices[market].campaignSelling;
      if (!form.samePricing&&form.campaignLongTerm) {
        schedules.push({market,priceType:"campaign",originalPrice:campaignOriginal,sellingPrice:campaignSelling,promotionType:"custom",effectiveFrom:form.campaign.effectiveFrom,effectiveTo:form.campaign.effectiveTo||null});
        return;
      }
      if (editingPackageId) {
        const retained=originalCampaignSchedules.current.filter(line=>line.market===market);
        if (form.samePricing) {
          if (originalRecurringCampaign.current) schedules.push({...nonCampaign,priceType:"campaign"});
          else if (retained.length) retained.forEach(line=>schedules.push({...line,originalPrice:campaignOriginal,sellingPrice:campaignSelling}));
          else normalLines.forEach(line=>schedules.push({...line,priceType:"campaign"}));
          return;
        }
        const first=retained[0];
        const pricesEdited=Boolean(first)&&(
          Number(campaignOriginal)!==first.originalPrice||Number(campaignSelling)!==first.sellingPrice
        );
        campaignPeriods.forEach(period=>{
          const existing=period.originalFrom===undefined?undefined:retained.find(line=>line.effectiveFrom===period.originalFrom&&line.effectiveTo===period.originalTo);
          schedules.push({...(existing??first??nonCampaign),
            market,priceType:"campaign",promotionType:existing?.promotionType??"custom",
            originalPrice:!pricesEdited&&existing?String(existing.originalPrice):campaignOriginal,
            sellingPrice:!pricesEdited&&existing?String(existing.sellingPrice):campaignSelling,
            effectiveFrom:period.effectiveFrom,effectiveTo:period.effectiveTo,
          });
        });
        return;
      }
      if (form.samePricing) {
        normalLines.forEach(line=>schedules.push({...line,priceType:"campaign"}));
        return;
      }
      campaignPeriods.forEach(period=>{
        schedules.push({market,priceType:"campaign",originalPrice:campaignOriginal,sellingPrice:campaignSelling,promotionType:"custom",effectiveFrom:period.effectiveFrom,effectiveTo:period.effectiveTo});
      });
    });
    return schedules;
  }

  function validateForm() {
    const errors:FormError[]=[];
    const addError=(section:FormSection,message:string)=>errors.push({section,message});
    if (!form.name.trim()) addError("Package Details","Enter a package name.");
    if (!form.markets.length) addError("Package Details","Select at least one selling market.");
    if (!platforms.length) addError("Package Details","Select at least one sales platform.");
    platforms.forEach((line,index)=>{
      if (!line.packageSku.trim()) addError("Package Details",`Enter the SKU for ${line.platform} listing ${platforms.filter((item,itemIndex)=>item.platform===line.platform&&itemIndex<=index).length}.`);
    });
    const normalizedPlatformSkus=platforms.map(line=>line.packageSku.trim().toLowerCase()).filter(Boolean);
    if (new Set(normalizedPlatformSkus).size!==normalizedPlatformSkus.length) addError("Package Details","Each platform listing SKU must be unique.");

    const validatePeriod=(label:string,period:typeof form.nonCampaign)=>{
      if ((label==="Non-Campaign"&&form.longTerm)||(label==="Campaign"&&form.campaignLongTerm)) {
        if (!period.effectiveFrom) addError("Pricing & Promotion",`Choose a ${label} Long-term Package start date.`);
        return;
      }
      if (period.promotionType==="monthly"&&!period.promotionMonth) addError("Pricing & Promotion",`Select the ${label} promotion month.`);
      if (period.promotionType==="custom"&&(!period.effectiveFrom||!period.effectiveTo)) addError("Pricing & Promotion",`Enter both ${label} start and end dates.`);
      if (period.effectiveFrom&&period.effectiveTo&&period.effectiveTo<period.effectiveFrom) addError("Pricing & Promotion",`${label} end date cannot be before its start date.`);
    };
    if(!form.longTerm&&form.nonCampaign.promotionType==="monthly"){
      if(!nonCampaignMonths.length)addError("Pricing & Promotion","Select at least one Normal Day month.");
      if(nonCampaignMonths.some(month=>!/^\d{4}-\d{2}$/.test(month)))addError("Pricing & Promotion","Choose a valid Normal Day month.");
    } else validatePeriod("Non-Campaign",form.nonCampaign);
    {
      if (form.campaignLongTerm&&!form.samePricing) {
        try { validateRecurringCampaign(recurringRule(),form.markets); }
        catch(error) { addError("Pricing & Promotion",error instanceof Error?error.message:"Check the monthly Campaign events."); }
      } else if (!form.samePricing) {
        if (!campaignPeriods.length) addError("Pricing & Promotion","Add at least one Campaign date range.");
        if(!form.longTerm&&form.nonCampaign.promotionType==="monthly"&&campaignMonths.some(month=>!nonCampaignMonths.includes(month)))addError("Pricing & Promotion","Every Campaign month must also be selected under Normal Day.");
        campaignMonths.forEach(month=>{if(!campaignPeriods.some(period=>period.effectiveFrom.slice(0,7)===month)) addError("Pricing & Promotion","Select an event or keep custom dates for "+month+".");});
        campaignPeriods.forEach((period,index)=>{
          if (!period.effectiveFrom||!period.effectiveTo) addError("Pricing & Promotion",`Enter both dates for Campaign period ${index+1}.`);
          else if (period.effectiveTo<period.effectiveFrom) addError("Pricing & Promotion",`Campaign period ${index+1} end date cannot be before its start date.`);
        });
        const keys=campaignPeriods.map(period=>`${period.effectiveFrom}|${period.effectiveTo}`);
        if (new Set(keys).size!==keys.length) addError("Pricing & Promotion","Campaign date ranges must be unique.");
        if (campaignPeriods.some((period,index)=>period.originalFrom===undefined&&campaignPeriods.some((other,otherIndex)=>otherIndex!==index&&period.effectiveFrom<=other.effectiveTo&&other.effectiveFrom<=period.effectiveTo))) addError("Pricing & Promotion","New Campaign events cannot overlap saved dates. Remove saved custom dates before selecting events inside the same range.");
      }
    }

    form.markets.forEach(market=>{
      const validatePrice=(label:string,originalValue:string,sellingValue:string)=>{
        const original=Number(originalValue);
        const selling=Number(sellingValue);
        if (!originalValue||!Number.isFinite(original)||original<=0) addError("Pricing & Promotion",`Enter a valid ${market} ${label} original price.`);
        if (!sellingValue||!Number.isFinite(selling)||selling<=0) addError("Pricing & Promotion",`Enter a valid ${market} ${label} selling price.`);
        if (original>0&&selling>original) addError("Pricing & Promotion",`${market} ${label} selling price cannot be higher than the original price.`);
      };
      validatePrice("Non-Campaign",form.prices[market].nonCampaignOriginal,form.prices[market].nonCampaignSelling);
      if (!form.samePricing) validatePrice("Campaign",form.prices[market].campaignOriginal,form.prices[market].campaignSelling);
    });

    if (!components.length) addError("Inventory Items","Add at least one OXM inventory item.");
    components.forEach((line,index)=>{
      if (!line.inventorySku.trim()) addError("Inventory Items",`Enter the OXM inventory SKU for item ${index+1}.`);
      if (!line.name.trim()) addError("Inventory Items",`Enter the name for inventory item ${index+1}.`);
      if (!Number.isInteger(line.quantity)||line.quantity<1) addError("Inventory Items",`Enter a whole-number quantity of at least 1 for inventory item ${index+1}.`);
    });
    if (!form.changeNote.trim()) addError("Package Details","Enter a change note explaining this package version.");
    setFormErrors(errors.filter((error,index)=>errors.findIndex(item=>item.section===error.section&&item.message===error.message)===index));
    return errors.length===0;
  }

  async function save(mode:"draft"|"publish") {
    if (!validateForm()) return;
    if (draftStorageKey && prefillBatch.length) {
      let stored=readStoredBatch();
      if (!stored) {
        try {
          saveStoredBatch({prefills:prefillBatch,storeId,requestIds:batchRequestIds.current});
          stored=readStoredBatch();
        } catch { /* Keep the current package open for retry. */ }
      }
      if (stored?.requestIds?.[batchName(prefillBatch[0].name)]!==createRequestId.current) {
        setFormErrors([{section:"Saving",message:"This package batch could not be verified in browser storage. Restore storage and reload before saving."}]);
        return;
      }
    }
    setSaving(true);
    setMessage("");
    setFormErrors([]);
    try {
      const clientRequestId=editingPackageId?undefined:(createRequestId.current ||= crypto.randomUUID());
      const schedules=priceSchedules();
      const campaignLines=schedules.filter(line=>line.priceType==="campaign");
      const response = await fetch("/api/packages",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:form.name,mode,clientRequestId,markets:form.markets,changeNote:form.changeNote,
          priceSchedules:schedules,samePricing:form.samePricing,longTerm:form.longTerm,campaignLongTerm:form.campaignLongTerm||campaignLines.length>0&&campaignLines.every(line=>line.effectiveTo===null),recurringCampaign:recurringRule(),storeId:editingStore?.id??storeId,storeName:editingStore?.name??storeName,components,platforms,packageId:editingPackageId,expectedVersion:editingVersion??undefined,
          calculatorSettings:calculatorSettings?{scenarios:prefillBatch.filter(item=>batchName(item.name)===batchName(prefillBatch[0]?.name??"")).map(item=>item.calculatorSettings)}:null}),
      });
      const data = await response.json().catch(()=>null);
      if (!response.ok && !data?.savedAsDraft) {
        if (editingPackageId && data?.packageId && data?.version) {
          setMessageType("warning");
          setMessage(data.error ?? "Changes are saved in history and awaiting Google Sheet sync. Use Retry Sheet Sync on the package card.");
          await load(false,editingPackageId);
          setShowCreate(false);
          resetForm();
          return;
        }
        const apiErrors=Array.isArray(data?.errors)?data.errors.filter((error:unknown):error is FormError=>Boolean(error&&typeof error==="object"&&"section" in error&&"message" in error)):
          [{section:(data?.section??"Saving") as FormSection,message:data?.error??`We could not save the package (error ${response.status}). Please try again.`}];
        setFormErrors(apiErrors.length?apiErrors:[{section:"Saving",message:"We could not save the package. Please try again."}]);
        return;
      }
      const savedMessage=data?.savedAsDraft?data.error:mode==="draft"
        ? `Draft saved · Version ${data.version} · not sent to Google Sheet`
        : editingPackageId&&!editingDraft?`Changes saved · Version ${data.version} · View History to review the edit`
        : `Package created · Version ${data.version} · Google Sheet synced`;
      if (editingPackageId) setHistoryOpen(editingPackageId);
      const next = prefillQueue[0];
      const currentName=batchName(prefillBatch[0]?.name??"");
      const remaining=prefillBatch.filter(item=>batchName(item.name)!==currentName);
      const stored=readStoredBatch();
      let recoveryFailed=Boolean(draftStorageKey&&prefillBatch.length&&(
        !stored || stored.requestIds?.[currentName]!==clientRequestId || !stored.prefills?.some(item=>batchName(item.name)===currentName)
      ));
      if (stored&&!recoveryFailed) {
        try {
          if (remaining.length) saveStoredBatch({...stored,prefills:remaining});
          else window.localStorage.removeItem(draftStorageKey!);
        } catch { recoveryFailed=true; }
      }
      if (recoveryFailed) {
        setMessageType("warning");
        setMessage(`${savedMessage}. Browser storage could not record the batch progress. Retry this save after storage is available; the request ID prevents a duplicate package.`);
        void load(true,editingPackageId??undefined);
        return;
      }
      if (next) {
        setPrefillQueue(current=>current.slice(1));
        setPrefillBatch(remaining);
        openPrefill(next);
      } else {
        if (standaloneCreate) {
          window.location.assign(`${window.location.pathname}?section=packages`);
          return;
        }
        setShowCreate(false);
        setPrefillBatch([]);
        resetForm();
      }
      setMessageType(data?.savedAsDraft?"warning":"success");
      setMessage(savedMessage);
      void load(true,editingPackageId??undefined);
    } catch {
      setFormErrors([{section:"Saving",message:"We could not reach the server. Check your internet connection and try again."}]);
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft(item:PackageItem) {
    setSaving(true);setMessage("");
    try {
      const response=await fetch("/api/packages",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"publish",packageId:item.id})});
      const data=await response.json();
      setMessageType(response.ok?"success":"error");
      setMessage(response.ok?`${item.name} created · Google Sheet synced`:data.error??"Could not create the package.");
      await load();
    }catch{setMessageType("error");setMessage("Could not reach the server. Try again.");}
    finally{setSaving(false);}
  }

  async function retrySheetSync(item:PackageItem) {
    setSaving(true);setMessage("");
    try {
      const response=await fetch("/api/packages",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"retry",packageId:item.id})});
      const data=await response.json();
      setMessageType(response.ok?"success":"error");
      setMessage(response.ok?`${item.name} · Version ${item.pendingVersion} synced to Google Sheet`:data.error??"Could not sync the package to Google Sheet.");
      await load();
    }catch{setMessageType("error");setMessage("Could not reach the server. Try again.");}
    finally{setSaving(false);}
  }

  async function endPackage(item:PackageItem) {
    if(!window.confirm(`End ${item.name} now? It will move to Expired immediately, its end date will be today (store local time), and an email notification will be queued through Package History.`))return;
    setSaving(true);setMessage("");
    try {
      const response=await fetch("/api/packages",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({packageId:item.id,action:"end",expectedVersion:item.version})});
      const data=await response.json();
      if(!response.ok){setMessageType("error");setMessage(data.error??"Could not end the package. Refresh the list and try again.");return;}
      setMessageType(data.warning?"warning":"success");
      setMessage(data.warning??`${item.name} ended · Moved to Expired · End date: ${data.endedDate??"today (store local time)"} · Notification recorded in Package History`);
      setFilter("expired");
      await load(true);
    }catch{setMessageType("error");setMessage("Could not confirm the result. Refresh the list before trying again.");}
    finally{setSaving(false);}
  }

  async function deletePackage(item:PackageItem) {
    if(!window.confirm(`Remove ${item.name} from Packages & Pricing? Its versions and audit history will be retained.`))return;
    setSaving(true);setMessage("");
    try {
      const response=await fetch("/api/packages",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({packageId:item.id})});
      const data=await response.json();
      setMessageType(response.ok?"success":"error");
      setMessage(response.ok?`${item.name} removed. Its history is retained.`:data.error??"Could not remove the package.");
      if(response.ok)await load();
    }catch{setMessageType("error");setMessage("Could not reach the server. Try again.");}
    finally{setSaving(false);}
  }

  function startVersion(item:PackageItem) {
    setPrefillQueue([]);
    setPrefillBatch([]);
    const stored = source === "database";
    const storedSchedules=item.priceSchedules??[];
    const legacyMarket=isMarket(item.market)?item.market:"MY";
    const fallbackSchedule=(priceType:PriceType):PriceSchedule=>({market:legacyMarket,priceType,originalPrice:stored?item.originalPrice/100:item.originalPrice,sellingPrice:stored?item.sellingPrice/100:item.sellingPrice,promotionType:item.promotionType,effectiveFrom:item.effectiveFrom,effectiveTo:item.effectiveTo??null});
    const sourceSchedules=storedSchedules.length?storedSchedules:[fallbackSchedule("non_campaign"),fallbackSchedule("campaign")];
    const sourceMarkets=MARKET_CODES.filter(market=>sourceSchedules.some(line=>line.market===market)||item.recurringCampaign?.events.some(event=>event.prices[market]));
    const schedules=sourceMarkets.flatMap(market=>{
      const available=sourceSchedules.filter(line=>line.market===market);
      const base=available[0]??fallbackSchedule("campaign");
      return (["non_campaign","campaign"] as PriceType[]).map(priceType=>available.find(line=>line.priceType===priceType)??{...base,priceType,market});
    });
    const nc=schedules.find(line=>line.priceType==="non_campaign")??fallbackSchedule("non_campaign");
    const campaign=schedules.find(line=>line.priceType==="campaign")??fallbackSchedule("campaign");
    const markets=[...new Set(schedules.map(line=>line.market))] as MarketName[];
    const priceFor=(market:MarketName,type:PriceType)=>schedules.find(line=>line.market===market&&line.priceType===type);
    const samePricing=item.samePricing??markets.every(market=>{
      const nonCampaign=priceFor(market,"non_campaign");
      const campaignSchedules=sourceSchedules.filter(line=>line.market===market&&line.priceType==="campaign");
      return Boolean(nonCampaign&&campaignSchedules.length>0&&campaignSchedules.every(line=>line.originalPrice===nonCampaign.originalPrice&&line.sellingPrice===nonCampaign.sellingPrice));
    });
    originalCampaignSchedules.current=sourceSchedules.filter(line=>line.priceType==="campaign").map(line=>({...line}));
    originalRecurringCampaign.current=Boolean(item.recurringCampaign);
    setShowRecurringEndDate(Boolean(item.recurringCampaign?.endDate));
    setRecurringEvents(recurringEventIds.map(id=>{
      const saved=item.recurringCampaign?.events.find(event=>event.id===id);
      const base=saved??defaultRecurringEvent(id);
      return {...base,prices:Object.fromEntries(markets.map(market=>[market,{
        originalPrice:String(saved?.prices[market]?.originalPrice??priceFor(market,"campaign")?.originalPrice??""),
        sellingPrice:String(saved?.prices[market]?.sellingPrice??priceFor(market,"campaign")?.sellingPrice??""),
      }])) as RecurringEventDraft["prices"]};
    }));
    const finiteCampaignPeriods=sourceSchedules.filter(line=>line.market===markets[0]&&line.priceType==="campaign").map(line=>({effectiveFrom:line.effectiveFrom,effectiveTo:line.effectiveTo??"",originalFrom:line.effectiveFrom,originalTo:line.effectiveTo??""}));
    setNonCampaignMonths(sourceSchedules.filter(line=>line.market===markets[0]&&line.priceType==="non_campaign"&&line.promotionType==="monthly").map(line=>line.effectiveFrom.slice(0,7)).sort());
    setCampaignPeriods(finiteCampaignPeriods);
    setCampaignMonths([...new Set(finiteCampaignPeriods.map(period=>period.effectiveFrom.slice(0,7)).filter(Boolean))].sort());
    setEditingPackageId(stored ? item.id : null);
    setEditingVersion(stored ? item.version : null);
    setEditingStore({id:item.storeId,name:item.storeName??storeName});
    setForm({
      name:item.name,markets,samePricing,longTerm:sourceSchedules.some(line=>line.priceType==="non_campaign"&&line.effectiveTo==null),campaignLongTerm:Boolean(item.recurringCampaign)||sourceSchedules.some(line=>line.priceType==="campaign"&&line.effectiveTo==null),
      nonCampaign:{promotionType:nc.promotionType,promotionMonth:nc.promotionType==="monthly"?nc.effectiveFrom.slice(0,7):"",effectiveFrom:nc.effectiveFrom,effectiveTo:nc.effectiveTo??""},
      campaign:{promotionType:"custom",promotionMonth:campaign.effectiveFrom.slice(0,7),campaignEvents:item.recurringCampaign?.events.map(event=>event.id)??[...new Set(sourceSchedules.filter(line=>line.priceType==="campaign").map(line=>campaignEventForDates(line.effectiveFrom,line.effectiveTo??"")).filter((event):event is CampaignEvent=>event!==null))],effectiveFrom:item.recurringCampaign?.startDate??campaign.effectiveFrom,effectiveTo:item.recurringCampaign?.endDate??campaign.effectiveTo??""},
      prices:Object.fromEntries(MARKET_CODES.map(market=>{const normal=priceFor(market,"non_campaign");const campaign=item.recurringCampaign?.events.find(event=>event.prices[market])?.prices[market]??priceFor(market,"campaign");return [market,{nonCampaignOriginal:String(normal?.originalPrice??""),nonCampaignSelling:String(normal?.sellingPrice??""),campaignOriginal:String(campaign?.originalPrice??""),campaignSelling:String(campaign?.sellingPrice??"")}];})) as Record<MarketName,MarketPrices>,
      changeNote:stored ? `Changes from Version ${item.version}` : "Migrated from Fulfillment Sheet",
    });
    setComponents(item.components.map(line=>({...line})));
    setPlatforms((item.platforms?.length ? item.platforms : [{platform:"Shopee" as const,packageSku:item.packageSku}]).map(line=>({...line})));
    setCalculatorSettings(null);
    setFormErrors([]);
    setEditingDraft(stored&&item.status==="draft");
    setShowCreate(true);
  }

  function renderSelection(item:PackageItem) { if(sampleMode)return null; return <>{canExportKits&&hasSelectedStore&&source==="database"&&<label className="kit-package-selector"><input type="checkbox" checked={selectedKitIds.includes(item.id)} disabled={item.sheetSyncStatus!=="synced"||Boolean(item.pendingVersion)||["draft","review"].includes(item.status)} onChange={event=>{setKitError("");setKitPreview(null);setSelectedKitIds(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id));}} aria-label={`Select ${item.name} for fulfillment sheet`}/><span>Select for Fulfillment Sheet</span></label>}</>; }
  function renderHistory(item:PackageItem) {
    if(openHistory!==item.id)return null;
    const result=historyResults[historyKey(item)];
    const inline=item.historyLoaded!==false&&Array.isArray(item.history);
    const lines=inline?item.history:result?.history;
    if(!inline&&source==="database"&&!sampleMode&&result?.status!=="ready")return <div className="version-history">{result?.status==="error"?<div role="alert">History could not be loaded. <button type="button" onClick={()=>void requestPackageHistory(item)}>Retry history</button></div>:<p role="status">Loading history…</p>}</div>;
    return <div className="version-history">{!lines?.length?<p>No recorded history is available.</p>:lines.map(line=><div className="history-entry" key={line.version}>
        <div><b>v{line.version}</b><span>{line.changeNote}</span><small>{line.effectiveFrom} → {line.effectiveTo || "Open Ended"} · Sheet {line.sheetSyncStatus ?? "preview"}</small></div>
        <p className="history-author">Changed by <strong>{line.createdBy || "Not recorded"}</strong> · <time dateTime={line.createdAt || undefined}>{packageHistoryTime(line.createdAt)}</time></p>
        <div className="history-changes"><table><caption>{line.version===1?"Initial package details":`Changes in version ${line.version}`}</caption><thead><tr><th scope="col">Field</th><th scope="col">Previous</th><th scope="col">Updated</th></tr></thead><tbody>{packageHistoryChanges(lines?.find(previous=>previous.version===line.version-1),line).map(change=><tr key={change.field}><th scope="row">{change.field}</th><td>{change.before}</td><td>{change.after}</td></tr>)}</tbody></table></div>
        <div className="history-diff"><span className="added">+ {(line.addedComponents ?? []).map(lineText).join(", ") || "No Additions"}</span><span className="removed">− {(line.removedComponents ?? []).map(lineText).join(", ") || "No Removals"}</span></div>
        {calculatorSnapshots(line.calculatorSettings).length>0&&<div className="calculator-history"><b>Calculator Snapshot</b>{calculatorSnapshots(line.calculatorSettings).map(snapshot=><div key={snapshot.serviceScenario}><strong>{snapshot.serviceScenario}</strong><span>{snapshot.category}</span>{snapshot.pricingGoal?<span>Goal · {snapshot.pricingGoal==="facebookPayout"?"Match Meta Order Income":snapshot.pricingGoal==="sameCustomerPrice"?"Match Meta Buyer Payment":`Lower Than Meta by ${snapshot.discountUnit==="rm"?money(snapshot.discountValue??0,"MY"):`${(snapshot.discountValue??0).toFixed(2)}%`}`}</span>:null}<span>Meta {money(snapshot.facebookPrice,"MY")} → Shopee {money(snapshot.suggestedShopeePrice,"MY")}</span>{snapshot.mainProductQuantity?<span>Main Product Qty {snapshot.mainProductQuantity} · Meta Price Per Unit {snapshot.facebookPricePerUnit==null?"—":money(snapshot.facebookPricePerUnit,"MY")} · Buyer Price Per Unit {snapshot.customerPricePerUnit==null?"—":money(snapshot.customerPricePerUnit,"MY")}</span>:null}<span>Commission {snapshot.commissionRate.toFixed(2)}% · Service {snapshot.serviceRate.toFixed(2)}% · Payout {money(snapshot.actualPayout,"MY")}</span></div>)}</div>}
      </div>)}</div>;
  }
  function renderActions(item:PackageItem) { if(sampleMode)return <div className="package-card-foot"><button type="button" onClick={()=>toggleHistory(item)}>{openHistory===item.id?"Hide History":"View History"}</button></div>; return (<div className="package-card-foot"><span>{item.components.length} Inventory SKU Lines</span><button onClick={()=>toggleHistory(item)} aria-label={`${openHistory===item.id?"Hide":"View"} history for ${item.name}`}>{openHistory===item.id?"Hide History":"View History"}</button>{item.status==="draft"&&source==="database"&&<button onClick={()=>publishDraft(item)} disabled={saving} aria-label={`Create package ${item.name}`}>Create Package</button>}{item.pendingVersion&&source==="database"&&<button onClick={()=>retrySheetSync(item)} disabled={saving} aria-label={`Retry Google Sheet sync for ${item.name} version ${item.pendingVersion}`}>Retry Sheet Sync</button>}{!(item.pendingVersion&&source==="database")&&<button onClick={()=>startVersion(item)} disabled={saving} aria-label={`${item.status==="draft"?"Edit draft":source==="database"?"Edit package":"Migrate and edit"} ${item.name}`}>{item.status==="draft"&&source==="database"?"Edit Draft":source==="database"?"Edit / Modify":"Migrate & Edit"}</button>}{source==="database"&&item.status==="active"&&<button onClick={()=>endPackage(item)} disabled={saving||Boolean(item.pendingVersion)||item.sheetSyncStatus!=="synced"} className="package-end" aria-label={`End package ${item.name}`}>End Package</button>}{canDelete&&source==="database"&&<button onClick={()=>deletePackage(item)} disabled={saving} className="package-delete" aria-label={`Remove package ${item.name}`}>Remove Package</button>}</div>); }
  function renderListPrices(item:PackageItem,market:MarketName) {
    const schedules=item.priceSchedules?.filter(line=>line.market===market)??[];
    const hasRecurringPrice=Boolean(item.recurringCampaign?.events.some(event=>event.prices[market]));
    return <>{schedules.length?schedules.map((line,index)=><div className="package-sheet-price" key={`${line.priceType}-${index}`}><span>{line.priceType==="non_campaign"?"Normal":"Campaign"}</span><strong>{money(line.sellingPrice,market)}</strong><small>Original {money(line.originalPrice,market)}</small><small>{displayDate(line.effectiveFrom)} → {line.effectiveTo?displayDate(line.effectiveTo):"Ongoing"}</small></div>):!item.priceSchedules?.length&&!hasRecurringPrice&&item.market===market?<div className="package-sheet-price"><span>{item.currentPriceLabel??"Price"}</span><strong>{money(item.sellingPrice,market,source==="database")}</strong><small>Original {money(item.originalPrice,market,source==="database")}</small></div>:hasRecurringPrice?null:"—"}
    {item.recurringCampaign?.events.map(event=>{const price=event.prices[market];return price?<div className="package-sheet-price" key={event.id}><span>{recurringEventLabels[event.id]} · Every month</span><strong>{money(price.sellingPrice,market)}</strong><small>Original {money(price.originalPrice,market)}</small></div>:null;})}</>;
  }
  function renderListDates(item:PackageItem) {
    return <>{item.priceSchedules?.length?item.priceSchedules.filter(line=>countryFilter==="all"||line.market===countryFilter).map((line,index)=><div key={index}><b>{line.market} {line.priceType==="non_campaign"?"Normal":"Campaign"}</b><span>{displayDate(line.effectiveFrom)} → {line.effectiveTo?displayDate(line.effectiveTo):"Ongoing"}</span></div>):<div>{displayDate(item.effectiveFrom)} → {item.effectiveTo===null?"Ongoing":item.effectiveTo?displayDate(item.effectiveTo):"Not recorded"}</div>}
      {item.recurringCampaign&&<div><b>Monthly campaign</b><span>{displayDate(item.recurringCampaign.startDate)} → {item.recurringCampaign.endDate?displayDate(item.recurringCampaign.endDate):"Ongoing"}</span></div>}</>;
  }

  return <div className={`package-control${standaloneCreate?" standalone-create":""}`}>
    <div className="package-hero">
      <div><p className="kicker">OXM PACKAGE CONTROL</p><h2>Packages & Pricing</h2><p>Create packages, choose platforms and set promotion dates. Every change is saved in history.</p></div>
      <div className="package-hero-actions">
        {!staging&&<a href={HISTORY_SHEET_URL} target="_blank" rel="noopener noreferrer">Google Sheet History</a>}
        <span>{sampleMode?"Sample data":!hasPackageScope?"Select a Store":allStoresSelected?"Accessible Stores":source==="sheet-migration-preview"?"Sheet Migration Preview":"Live Database"}</span>
        {!sampleMode&&canExportKits&&hasSelectedStore&&loadedStoreId===storeId&&source==="database"&&<button type="button" className="kit-export-button" onClick={previewKitExport} disabled={!selectedKitIds.length||kitBusy}>Generate Fulfillment Sheet{selectedKitIds.length?` (${selectedKitIds.length})`:""}</button>}
        {!sampleMode&&canCreate&&hasSelectedStore&&<button onClick={openNew}>+ New Package</button>}
      </div>
    </div>

    {canShowSamples&&!standaloneCreate&&<div className="package-sample-toolbar"><span role="status">{sampleMode?"Sample data · Read only":""}</span><button type="button" disabled={saving||showCreate} aria-pressed={sampleMode} onClick={()=>{resetListScope();setFilter("all");setDurationFilter("all");setCountryFilter("all");setSearch("");setSampleMode(value=>!value);}}>{sampleMode?"Back to real data":"View sample data"}</button></div>}

    {staging&&!sampleMode&&canCreate&&hasSelectedStore&&<PackageBatchPreview key={storeId}/>}
    <p className="package-summary-scope">Summary · {sampleMode?"All sample packages":storeName} · All selling countries</p>
    <section className="metric-grid package-metrics">
      <article className="metric"><span>Total Packages</span><strong>{listReady?scopedItems.length:"—"}</strong><em>{sampleMode?"Sample packages":storeName}</em></article>
      <article className="metric"><span>Active Now</span><strong>{listReady?active:"—"}</strong><em>Currently Selling</em></article>
      <article className="metric"><span>Scheduled</span><strong>{listReady?scheduled:"—"}</strong><em>Future promotions</em></article>
      <article className="metric warn"><span>Needs Review</span><strong>{listReady?drafts:"—"}</strong><em>Draft + Review</em></article>
    </section>

    <div className="package-controls">
      <div className="package-filter-row">
        <div role="group" aria-label="Package status">{["All","Active","Scheduled","Draft","Review","Expired"].map(label=>{const value=label.toLowerCase();return <button key={value} className={filter===value?"active":""} aria-pressed={filter===value} onClick={()=>{resetListScope();setFilter(value);}}>{label}</button>})}</div>
        <span className="package-filter-divider" aria-hidden="true"/>
        <div role="group" aria-label="Package duration">{[["all","All types"],["long-term","Long Term"],["monthly","Monthly"]].map(([value,label])=><button key={value} className={durationFilter===value?"active":""} aria-pressed={durationFilter===value} onClick={()=>{resetListScope();setDurationFilter(value);}}>{label}</button>)}</div>
        <span className="package-filter-divider" aria-hidden="true"/>
        <div className="package-country-filter" role="group" aria-label="Package country"><button type="button" className={countryFilter==="all"?"active":""} aria-pressed={countryFilter==="all"} onClick={()=>{resetListScope();setCountryFilter("all");}}>All Countries</button>{MARKET_CODES.map(market=><button type="button" key={market} className={countryFilter===market?"active":""} aria-pressed={countryFilter===market} onClick={()=>{resetListScope();setCountryFilter(market);}}>{MARKET_CONFIG[market].name}</button>)}</div>
      </div>
      <div className="package-view-controls"><div role="group" aria-label="Package view">{(["grid","list"] as const).map(value=><button type="button" key={value} aria-pressed={view===value} className={view===value?"active":""} onClick={()=>setView(value)}>{value==="grid"?"Grid View":"List View"}</button>)}</div><input aria-label="Search package or platform SKU" value={search} onChange={event=>{resetListScope();setSearch(event.target.value);}} placeholder="Search package or platform SKU" /></div>
    </div>
    {listReady&&<p className="package-result-count" role="status">{visible.length} matching package{visible.length===1?"":"s"} · {countryFilter==="all"?"All countries":MARKET_CONFIG[countryFilter].name}{countryFilter!=="all"?" · Package actions apply to all selling markets":""}</p>}
    {!sampleMode&&message&&<div className={`package-message ${messageType}`} role={messageType==="error"?"alert":"status"} aria-live={messageType==="error"?"assertive":"polite"}>{message}{messageType==="warning"&&!staging&&<a href={HISTORY_SHEET_URL} target="_blank" rel="noopener noreferrer">Open History Sheet</a>}</div>}
    {kitError&&!kitPreview&&<div className="package-message error" role="alert">{kitError}</div>}

    {listLoading&&<div className="package-empty" role="status" aria-live="polite" aria-busy="true"><strong>Loading packages…</strong></div>}
    {listFailed&&<div className="package-message error" role="alert">{listState.error} <button type="button" onClick={()=>void load()}>Retry</button></div>}
    {listReady&&(view==="grid"?<div className="package-list">{displayed.map(item=><article className="package-card" key={item.id}>
      <div className="package-card-head">
        <div>{renderSelection(item)}<span className={`package-status ${item.status}`}>{item.status}</span><span className={`sync-status ${item.pendingVersion?"pending":item.sheetSyncStatus ?? "pending"}`}>Sheet {item.pendingVersion?`v${item.pendingVersion} needs sync`:item.sheetSyncStatus==="not_sent"?"not sent":item.sheetSyncStatus ?? "preview"}</span><h3>{item.name}</h3></div>
        {!item.priceSchedules?.length&&!item.recurringCampaign&&isMarket(item.market)&&<div className="package-price"><small>{item.market}{item.currentPriceLabel?` · ${item.currentPriceLabel}`:""}</small><del>{money(item.originalPrice,item.market,source==="database")}</del><strong>{money(item.sellingPrice,item.market,source==="database")}</strong></div>}
      </div>
      {!item.priceSchedules?.length&&!item.recurringCampaign&&!isMarket(item.market)&&<p className="package-result-count">{countryFilter==="all"?(sellingMarkets(item).join(", ")||"Country not recorded"):countryFilter} · Price details unavailable</p>}
      {packageDuration(item)==="long-term"&&<span className="package-long-term-badge">Long-term Package</span>}
      {(item.priceSchedules?.length||item.recurringCampaign)?<PackagePriceSummary item={item} country={countryFilter}/>:null}
      <div className="platform-skus">{(item.platforms?.length?item.platforms:[{platform:"Shopee" as const,packageSku:item.packageSku}]).map(platform=><div key={platform.platform}><span>{platform.platform}</span><b>{platform.packageSku}</b></div>)}</div>
      <div className="package-meta">{allStoresSelected&&<span>Store <b>{item.storeName??item.storeId}</b></span>}<span>Version <b>v{item.version}</b></span></div>
      <div className="component-list">{item.components.map((line,index)=><div key={`${line.inventorySku}-${index}`}><span className={`component-kind ${line.kind}`}>{line.kind}</span><b>{line.inventorySku}</b><span>{line.name}</span><strong>× {line.quantity}</strong></div>)}</div>
      {renderHistory(item)}
      {renderActions(item)}
    </article>)}</div>:<div className="package-sheet-scroll" tabIndex={0} role="region" aria-label="Package list spreadsheet"><table className="package-sheet"><caption>Packages & Pricing · {visible.length} package{visible.length===1?"":"s"} · Showing {displayed.length}</caption><thead><tr><th scope="col" className="package-sheet-name">Package</th>{allStoresSelected&&<th scope="col">Store</th>}<th scope="col">Type</th><th scope="col">Status / Sheet</th>{listMarkets.map(market=><th scope="col" key={market}>{market} · {MARKET_CONFIG[market].symbol} prices</th>)}<th scope="col">Effective dates</th><th scope="col">Platform SKU</th><th scope="col">Inventory SKU / Quantity</th><th scope="col">Version</th><th scope="col">Actions</th></tr></thead><tbody>{displayed.map(item=><Fragment key={item.id}><tr><th scope="row" className="package-sheet-name"><strong>{item.name}</strong>{renderSelection(item)}<button type="button" aria-expanded={openDetails===item.id} onClick={()=>setOpenDetails(openDetails===item.id?null:item.id)} aria-label={`View details for ${item.name}`}>{openDetails===item.id?"Hide details":"View details"}</button></th>{allStoresSelected&&<td>{item.storeName??item.storeId}</td>}<td>{durationLabel(item)}</td><td><span className={`package-status ${item.status}`}>{item.status}</span><span className={`sync-status ${item.pendingVersion?"pending":item.sheetSyncStatus??"pending"}`}>Sheet {item.pendingVersion?`v${item.pendingVersion} needs sync`:item.sheetSyncStatus==="not_sent"?"not sent":item.sheetSyncStatus??"preview"}</span></td>{listMarkets.map(market=><td key={market}>{renderListPrices(item,market)}</td>)}<td className="package-sheet-dates">{renderListDates(item)}</td><td>{(item.platforms?.length?item.platforms:[{platform:"Shopee",packageSku:item.packageSku}]).map(line=><div key={line.platform}><small>{line.platform}</small><div>{line.packageSku}</div></div>)}</td><td>{item.components.map((line,index)=><div key={index} title={`${line.kind} · ${line.name}`}>{line.inventorySku} × {line.quantity}</div>)}</td><td>v{item.version}</td><td>{renderActions(item)}</td></tr>{(openDetails===item.id||openHistory===item.id)&&<tr className="package-sheet-detail"><td colSpan={8+listMarkets.length+(allStoresSelected?1:0)}>{openDetails===item.id&&<div><h3>{item.name}</h3>{(item.priceSchedules?.length||item.recurringCampaign)?<PackagePriceSummary item={item} country={countryFilter}/>:null}<div className="component-list">{item.components.map((line,index)=><div key={index}><span className={`component-kind ${line.kind}`}>{line.kind}</span><b>{line.inventorySku}</b><span>{line.name}</span><strong>× {line.quantity}</strong></div>)}</div></div>}{renderHistory(item)}</td></tr>}</Fragment>)}</tbody></table></div>)}

    {listReady&&visible.length>displayCount&&<button type="button" className="package-load-more" onClick={()=>setDisplayCount(count=>count+30)}>Show more packages ({visible.length-displayCount} remaining)</button>}
    {listReady&&!visible.length&&<div className="package-empty"><strong>{!hasPackageScope?"Select a Store":allStoresSelected?"No Packages In Accessible Stores":"No Packages In This View"}</strong><span>{!hasPackageScope?"Package information will appear after you choose a store.":allStoresSelected?"Only packages from stores you have permission to access appear here.":"Choose another filter or create the first package."}</span></div>}

    {kitPreview&&<div className="package-modal" role="dialog" aria-modal="true" aria-labelledby="kit-export-title"><div className="package-form kit-export-dialog"><div className="package-form-head"><div><p className="kicker">ANCHANTO KIT PRODUCTS</p><h3 id="kit-export-title">Generate Fulfillment Sheet</h3><span>{storeName}</span></div><button type="button" onClick={()=>{setKitPreview(null);setKitError("");}} aria-label="Close">×</button></div><p>{kitPreview.packageCount} selected package{kitPreview.packageCount===1?"":"s"} will generate <strong>{kitPreview.rowCount} rows</strong> in the Kit Products sheet. Price is 1 for every row.</p><p>The download does not change packages or upload anything to Anchanto.</p>{kitError&&<div className="package-message error" role="alert">{kitError}</div>}<div className="form-actions"><button type="button" className="secondary" onClick={()=>{setKitPreview(null);setKitError("");}}>Cancel</button><button type="button" onClick={downloadKitExport} disabled={kitBusy}>{kitBusy?"Checking…":"Download .xls"}</button></div></div></div>}

    {showCreate&&<div className={`package-modal${standaloneCreate?" standalone":""}`} role={standaloneCreate?undefined:"dialog"} aria-modal={standaloneCreate?undefined:"true"} aria-labelledby={standaloneCreate?undefined:"package-form-title"}><div className="package-form">
      <div className="package-form-head"><div><p className="kicker">{editingDraft?"EDIT DRAFT":editingPackageId?"EDIT PACKAGE":"NEW PACKAGE"}</p><h3 id="package-form-title">{editingDraft?"Edit Draft":editingPackageId?"Edit / Modify Package":"Create A Package"}</h3><span>{editingStore?.name??storeName}{prefillQueue.length?` · ${prefillQueue.length} Ready Package${prefillQueue.length===1?"":"s"} Remaining`:""}</span></div><button onClick={closeCreate} aria-label="Close">×</button></div>
      {staging&&canCreate&&hasSelectedStore&&!editingPackageId&&!editingDraft&&<PackageBatchPreview key={`create-${storeId}`}/>}

      {editingPackageId&&!editingDraft&&<p className="package-edit-note">Saving creates a new version. Previous details, your account and the time of the edit are retained in View History for Super Admin review.</p>}

      {formErrors.length>0&&<div className="package-error-popout" role="alert" aria-live="assertive"><div><b>We could not save this package. Please check:</b><button type="button" onClick={()=>setFormErrors([])} aria-label="Dismiss errors">×</button></div>{([...new Set(formErrors.map(error=>error.section))] as FormSection[]).map(section=><div className="package-error-group" key={section}><strong>{section}</strong><ul>{formErrors.filter(error=>error.section===section).map(error=><li key={`${error.section}-${error.message}`}>{error.message}</li>)}</ul></div>)}</div>}

      {prefillBatch.length>0&&<section className="calculator-batch-transfer"><div><b>{prefillQueue.length+1} Calculator Packages Remaining</b><span>Non-Campaign and Campaign prices are grouped by package. Save each completed package as a draft to open the next one.</span></div><div className="calculator-batch-list">{groupPrefills(prefillBatch).slice(0,3).map((group,index)=>{const nonCampaign=group.find(item=>item.calculatorSettings.serviceScenario==="Non-Campaign Day")??group[0];const campaign=group.find(item=>item.calculatorSettings.serviceScenario==="Campaign Day")??group[0];return <div className={index===0?"current":""} key={group[0].name}><span>{index===0?"Current":"Queued"}</span><b>{group[0].name}</b><strong><small>Non-Campaign</small>{money(nonCampaign.sellingPrice,"MY")}</strong><strong><small>Campaign</small>{money(campaign.sellingPrice,"MY")}</strong></div>})}{prefillQueue.length>2&&<small>+ {prefillQueue.length-2} more in queue</small>}</div></section>}

      <section className="form-section"><div className="form-section-title"><span>1</span><div><h4>Package Details</h4><p>Name, markets and shared promotion dates</p></div></div>
        <div className="form-grid package-detail-grid">
          <label>Package Name<input value={form.name} onChange={event=>setForm({...form,name:event.target.value})} placeholder="Customer-Facing Package Name"/></label>
          <fieldset className="market-selector"><legend>Selling Markets</legend>{MARKET_CODES.map(market=><label key={market}><input type="checkbox" checked={form.markets.includes(market)} onChange={()=>toggleMarket(market)}/><b>{market}</b><small>{MARKET_CONFIG[market].symbol}</small></label>)}</fieldset>
        </div>
        <div className="inline-platforms">{PLATFORM_NAMES.map(platform=>{
          const selected=platforms.some(item=>item.platform===platform);
          return <div className={selected?"selected":""} key={platform}>
            <div className="inline-platform-head"><label><input type="checkbox" checked={selected} onChange={()=>togglePlatform(platform)}/><b>{platform}</b></label>{selected&&<button type="button" onClick={()=>addPlatformListing(platform)}>+ Add Listing</button>}</div>
            {selected&&<div className="listing-skus">{platforms.map((line,index)=>line.platform===platform?<div key={`${platform}-${index}`}><input aria-label={`${platform} Listing ${platforms.filter((item,itemIndex)=>item.platform===platform&&itemIndex<=index).length} SKU`} value={line.packageSku} onChange={event=>updatePlatformSku(index,event.target.value)} placeholder={`Listing ${platforms.filter((item,itemIndex)=>item.platform===platform&&itemIndex<=index).length} SKU`}/>{platforms.filter(item=>item.platform===platform).length>1&&<button type="button" aria-label={`Remove ${platform} listing`} onClick={()=>removePlatformListing(index)}>×</button>}</div>:null)}</div>}
          </div>;
        })}</div>
        {calculatorSettings&&<div className="calculator-prefill">
          <div><b>✓ Calculator Settings Attached</b><span>Saved in Package History with this package</span></div>
          <span>{calculatorSettings.category}</span>
          <span>Meta {money(calculatorSettings.facebookPrice,"MY")} → Suggested Shopee {money(calculatorSettings.suggestedShopeePrice,"MY")}</span>
          {calculatorSettings.mainProductQuantity?<span>Main Product Qty {calculatorSettings.mainProductQuantity} · Meta Price Per Unit {calculatorSettings.facebookPricePerUnit==null?"—":money(calculatorSettings.facebookPricePerUnit,"MY")} · Buyer Price Per Unit {calculatorSettings.customerPricePerUnit==null?"—":money(calculatorSettings.customerPricePerUnit,"MY")}</span>:null}
          <span>Commission {calculatorSettings.commissionRate.toFixed(2)}% · {calculatorSettings.serviceScenario} {calculatorSettings.serviceRate.toFixed(2)}% · Payout {money(calculatorSettings.actualPayout,"MY")}</span>
        </div>}
      </section>

      <section className="form-section pricing-section"><div className="form-section-title"><span>2</span><div><h4>Pricing & Promotion Periods</h4><p>{form.samePricing?"Set one price and period for both day types":"Set Non-Campaign and Campaign prices for each market"}</p></div></div>
        <label className={`same-pricing-toggle${form.samePricing?" selected":""}`}><input type="checkbox" checked={form.samePricing} onChange={event=>setForm({...form,samePricing:event.target.checked,campaignLongTerm:event.target.checked?false:form.campaignLongTerm})}/><span><b>Same for Both Non-Campaign &amp; Campaign Day Pricing</b><small>Use the Non-Campaign prices for Campaign Day.</small></span></label>
        {form.samePricing&&<div className="same-pricing-note">Campaign prices will match Non-Campaign prices. {originalRecurringCampaign.current&&form.samePricing?"The monthly Campaign rules will be removed when you save. ":null}{editingPackageId?"Previously saved Campaign dates are preserved. Uncheck this option to edit or extend them. Campaign date edits will not be saved if you check it again.":"Campaign dates will follow Non-Campaign dates."}</div>}
        {([['nonCampaign','Non-Campaign'],['campaign','Campaign']] as const).map(([periodKey,title])=>{
          if (periodKey==="campaign"&&form.samePricing) return null;
          const period=form[periodKey];
          return <div className={`scenario-editor ${periodKey}`} key={periodKey}>
            <div className="scenario-editor-head"><div><b>{title}</b><span>{title==="Campaign"?"Campaign Day Price & Dates":"Always-On Price & Dates"}</span></div>{periodKey==="nonCampaign"&&<div className="promotion-toggle" role="group" aria-label="Non-Campaign duration"><button type="button" className={!form.longTerm&&period.promotionType==="monthly"?"active":""} aria-pressed={!form.longTerm&&period.promotionType==="monthly"} onClick={()=>{const month=form.nonCampaign.promotionMonth||form.nonCampaign.effectiveFrom.slice(0,7);if(month)setNonCampaignMonths(current=>current.length?current:[month]);setForm(current=>{const dates=monthDates(month);return {...current,longTerm:false,nonCampaign:{...current.nonCampaign,promotionType:"monthly",promotionMonth:month,effectiveFrom:dates.from,effectiveTo:dates.to}}});}}>Full Month</button><button type="button" className={!form.longTerm&&period.promotionType==="custom"?"active":""} aria-pressed={!form.longTerm&&period.promotionType==="custom"} onClick={()=>setForm(current=>({...current,longTerm:false,nonCampaign:{...current.nonCampaign,promotionType:"custom"}}))}>Custom Dates</button><button type="button" className={form.longTerm?"active":""} aria-pressed={form.longTerm} onClick={()=>setForm(current=>({...current,longTerm:true,nonCampaign:{...current.nonCampaign,promotionType:"custom",effectiveFrom:current.nonCampaign.effectiveFrom||monthDates(current.nonCampaign.promotionMonth).from,effectiveTo:""}}))}>Long-term Package</button></div>}</div>
            {periodKey==="campaign"&&<div className="promotion-toggle campaign-duration" role="group" aria-label="Campaign duration"><button type="button" className={!form.campaignLongTerm?"active":""} aria-pressed={!form.campaignLongTerm} onClick={()=>{setForm(current=>({...current,campaignLongTerm:false}));if(editingPackageId){const month=form.campaign.effectiveFrom.slice(0,7);setCampaignMonths(current=>current.length?current:month?[month]:[]);setCampaignPeriods(current=>current.length&&current[0].effectiveTo?current:[]);}}}>Campaign Dates</button><button type="button" className={form.campaignLongTerm?"active":""} aria-pressed={form.campaignLongTerm} onClick={activateRecurringCampaign}>Long-term Package</button></div>}
            {periodKey==="campaign"&&editingPackageId&&!form.campaignLongTerm&&<div className="same-pricing-note">Choose Campaign events for each month, or add a month to extend this package. Existing Campaign dates stay unchanged until you select an event; selecting one replaces the saved custom date range. New events use the Campaign price shown for each market{form.samePricing?" (matching the Non-Campaign price)":""}.</div>}
            <div className="scenario-body"><div className="market-price-grid">{form.markets.map(market=>{
              const prefix=periodKey==="campaign"?"campaign":"nonCampaign";
              const originalKey=`${prefix}Original` as keyof typeof form.prices.MY;
              const sellingKey=`${prefix}Selling` as keyof typeof form.prices.MY;
              const same=Boolean(form.prices[market][originalKey])&&Number(form.prices[market][originalKey])===Number(form.prices[market][sellingKey]);
              return <div className={`market-price-card ${same?"same-price-warning":""}`} key={market}><strong>{market} <small>{MARKET_CONFIG[market].symbol}</small></strong><label>Original Price <em>*</em><input required type="number" min="0.01" step="0.01" value={form.prices[market][originalKey]} onChange={event=>updatePrice(market,originalKey,event.target.value)}/></label><label>Selling Price<input required type="number" min="0.01" step="0.01" value={form.prices[market][sellingKey]} onChange={event=>updatePrice(market,sellingKey,event.target.value)}/></label>{same&&<div className="same-price-alert">⚠️ Original Price equals Selling Price — please double-check.</div>}</div>;
            })}</div>
            {periodKey==="campaign"?(form.campaignLongTerm?recurringCampaignEditor():finiteCampaignEditor()):form.longTerm?<div className="date-fields"><label>Start Date<input type="date" value={period.effectiveFrom} onChange={event=>setForm({...form,nonCampaign:{...form.nonCampaign,effectiveFrom:event.target.value}})}/></label><span>End Date: Ongoing</span></div>:period.promotionType==="monthly"?<div className="normal-month-editor"><label>Add a Normal Day month<input type="month" value="" onChange={event=>{const month=event.target.value;if(!month||nonCampaignMonths.includes(month))return;setNonCampaignMonths(current=>[...current,month].sort());const dates=monthDates(month);setForm(current=>({...current,nonCampaign:{...current.nonCampaign,promotionMonth:month,effectiveFrom:dates.from,effectiveTo:dates.to}}));}}/></label><div className="selected-months">{nonCampaignMonths.map(month=><span key={month}>{shortMonthLabel(month)} <button type="button" onClick={()=>setNonCampaignMonths(current=>current.filter(value=>value!==month))} aria-label={`Remove ${shortMonthLabel(month)} Normal Day month`}>×</button></span>)}</div></div>:<div className="date-fields"><label>Start Date<input type="date" value={period.effectiveFrom} onChange={event=>setForm({...form,[periodKey]:{...period,effectiveFrom:event.target.value}})}/></label><label>End Date<input type="date" value={period.effectiveTo} min={period.effectiveFrom} onChange={event=>setForm({...form,[periodKey]:{...period,effectiveTo:event.target.value}})}/></label></div>}
            </div>
          </div>;
        })}
      </section>

      <section className="form-section"><div className="form-section-title"><span>3</span><div><h4>OXM Inventory SKU Items</h4><p>Added, removed and updated items are saved in History</p></div><button className="add-item-button" onClick={()=>setComponents([...components,blankLine()])}>+ Add Item</button></div>
        <div className="component-editor">{components.map((line,index)=><div className="component-row" key={index}>
          <input value={line.inventorySku} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,inventorySku:event.target.value}:item))} placeholder="OXM Inventory SKU"/>
          <input value={line.name} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,name:event.target.value}:item))} placeholder="Item Name"/>
          <input type="number" min="1" value={line.quantity} onChange={event=>setComponents(components.map((item,itemIndex)=>itemIndex===index?{...item,quantity:Number(event.target.value)}:item))}/>
          <button onClick={()=>setComponents(components.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Remove ${line.inventorySku||"component"}`}>×</button>
        </div>)}</div>
      </section>

      <label className="change-note">Change Note<input value={form.changeNote} onChange={event=>setForm({...form,changeNote:event.target.value})} placeholder="What changed and why?"/></label>
      <div className="form-actions"><button className="secondary" onClick={closeCreate}>Cancel</button>{(!editingPackageId||editingDraft)&&<button className="secondary" onClick={()=>save("draft")} disabled={saving}>{saving?"Saving…":prefillQueue.length?`Save Draft & Next (${prefillQueue.length} More)`:"Save Draft"}</button>}<button onClick={()=>save("publish")} disabled={saving}>{saving?"Saving…":prefillQueue.length?`Create & Continue (${prefillQueue.length} More)`:editingDraft?"Create Package":editingPackageId?"Save Changes":"Create Package"}</button></div>
    </div></div>}
  </div>;
}
