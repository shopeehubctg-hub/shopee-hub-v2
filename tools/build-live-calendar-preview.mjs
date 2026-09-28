// Local, synthetic UI preview. It never imports the production API or connects to a database.
// Usage: node tools/build-live-calendar-preview.mjs <output-directory> <Noto-Sans-woff2>
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";

const require=createRequire(import.meta.url);
const {build}=await import(pathToFileURL(require.resolve("esbuild",{paths:[dirname(require.resolve("vite"))]})));
const output=resolve(process.argv[2]??"../outputs/live-calendar-preview");
const font=process.argv[3];
if(!font)throw new Error("Provide a verified Noto Sans .woff2 file for the preview");
await mkdir(output,{recursive:true});
await copyFile(font,resolve(output,"noto-sans.woff2"));
await copyFile("public/shopee-hub-logo-transparent.png",resolve(output,"shopee-hub-logo-transparent.png"));
const entry=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {LiveCalendar} from './app/live-calendar';
const params=new URLSearchParams(location.search);
const mode=params.get('mode')||'admin';
const canManage=mode==='admin';
const today=new Date(Date.now()+8*3600000).toISOString().slice(0,10);
const nextDay=new Date(new Date(today+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);
const stores=[{id:'shopee-skindae-sg',name:'SkinDae SG',platform:'Shopee SG',timeZone:'Asia/Singapore'},{id:'shopee-skindae-my-by-ctg4u',name:'SkinDae MY by CTG4u',platform:'Shopee MY',timeZone:'Asia/Kuala_Lumpur'}];
const weekBoundary=new Date(today+'T00:00:00Z');weekBoundary.setUTCDate(weekBoundary.getUTCDate()-((weekBoundary.getUTCDay()+6)%7)-1);const sunday=weekBoundary.toISOString().slice(0,10);const monday=new Date(weekBoundary.getTime()+86400000).toISOString().slice(0,10);
let sessions=[{id:'cross-week-demo',store_id:stores[0].id,title:'Weekend product launch',start_at:new Date(sunday+'T23:30:00+08:00').toISOString(),end_at:new Date(monday+'T00:30:00+08:00').toISOString(),time_zone:'Asia/Singapore',status:'scheduled',internal_note:''},{id:'sg-demo',store_id:stores[0].id,title:'New collection launch',start_at:new Date(today+'T20:00:00+08:00').toISOString(),end_at:new Date(today+'T21:30:00+08:00').toISOString(),time_zone:'Asia/Singapore',status:'scheduled',internal_note:'Internal host coordination'},{id:'my-demo',store_id:stores[1].id,title:'Evening live session',start_at:new Date(today+'T23:30:00+08:00').toISOString(),end_at:new Date(nextDay+'T00:30:00+08:00').toISOString(),time_zone:'Asia/Kuala_Lumpur',status:'scheduled',internal_note:''},{id:'cancelled-demo',store_id:stores[0].id,title:'Previous session',start_at:new Date(today+'T10:00:00+08:00').toISOString(),end_at:new Date(today+'T11:00:00+08:00').toISOString(),time_zone:'Asia/Singapore',status:'cancelled',internal_note:''}];
let unregistered=['Example New SG Store'];
const realFetch=window.fetch;
window.__previewErrors=[];
window.addEventListener('error',event=>window.__previewErrors.push(event.message));
window.fetch=async(input,init={})=>{
 if(!String(input).startsWith('/api/live-calendar'))return realFetch(input,init);
 await new Promise(resolve=>setTimeout(resolve,250));
 if(mode==='disabled')return Response.json({error:'Live Calendar access disabled'},{status:403});
 if(init.method==='POST'||init.method==='PATCH'){
  if(!canManage)return Response.json({error:'Super Admin access required'},{status:403});
  const body=JSON.parse(init.body);
  if(body.action==='registerStore'){stores.push({id:'example-new-sg',name:body.directoryName,platform:'Shopee SG',timeZone:'Asia/Singapore'});unregistered=[];return Response.json({store:stores.at(-1)},{status:201});}
  if(body.action==='cancel'){sessions.find(row=>row.id===body.id).status='cancelled';return Response.json({});}
  const start=new Date(body.startLocal+':00+08:00').toISOString(),end=new Date(body.endLocal+':00+08:00').toISOString();
  if(end<=start)return Response.json({error:'End must be after start'},{status:400});
  const overlap=sessions.filter(row=>row.status==='scheduled'&&row.store_id===body.storeId&&row.id!==body.id&&row.start_at<end&&row.end_at>start);
  if(overlap.length&&!body.confirmOverlap)return Response.json({overlaps:overlap},{status:409});
  const row={id:body.id||crypto.randomUUID(),store_id:body.storeId,title:body.title||'Live session',start_at:start,end_at:end,time_zone:body.timeZone,status:'scheduled',internal_note:body.internalNote};
  sessions=sessions.filter(item=>item.id!==row.id).concat(row);return Response.json({session:row},{status:body.id?200:201});
 }
 const params=new URL(String(input),location.origin).searchParams;
 const visible=mode==='single'?[stores[0]]:stores;
 const allowed=new Set(visible.map(store=>store.id));
 let rows=sessions.filter(row=>allowed.has(row.store_id)&&(canManage||row.status==='scheduled')&&row.start_at<params.get('to')&&row.end_at>params.get('from')&&(params.get('storeId')==='all'||row.store_id===params.get('storeId')));
 if(!canManage)rows=rows.map(({internal_note,...row})=>row);
 return Response.json({stores:visible,sessions:rows,canManage,unregisteredStores:canManage?unregistered:[]});
};
createRoot(document.getElementById('preview')).render(<main className='app-shell'><aside className='side'><div className='logo'><img src='shopee-hub-logo-transparent.png' alt='ShopeeHub'/><small>STORE COMMAND CENTER</small></div><nav>{['Overview','Orders','Advertising','Packages','Live Calendar','Settings'].map(label=><button key={label} className={label==='Live Calendar'?'active':''}><span>{label.slice(0,1)}</span>{label}</button>)}</nav><div className='fleet contact-card'><p>Contact Shopee Hub Specialist</p><strong>{mode==='admin'?'Select a project':'SkinDae SG'}</strong></div><p className='access'>{canManage?'Super Admin access':'Private access'}<br/><b>{canManage?'admin@example.test':'customer@example.test'}</b></p></aside><section className='workspace'><header className='header'><div><h1>{mode==='admin'?'All Stores':'SkinDae SG'}</h1></div><div className='toolbar'><label>Store<select defaultValue={mode==='single'?stores[0].id:'all'}>{mode!=='single'&&<option value='all'>All Stores</option>}<option value={stores[0].id}>SkinDae SG · SG</option>{mode!=='single'&&<option value={stores[1].id}>SkinDae MY by CTG4u · MY</option>}</select></label><button>Update data</button></div></header><div className='page'><LiveCalendar initialStoreId='all' initialView={canManage?'month':'list'}/></div></section></main>);
`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:"tsx"},bundle:true,format:"iife",platform:"browser",jsx:"automatic",outfile:resolve(output,"preview.js"),define:{"process.env.NODE_ENV":'"production"'}});
if(bundle.errors.length)throw new Error("Preview build failed");
const styles=(await readFile("app/globals.css","utf8")).replace('@import "tailwindcss";','');
await writeFile(resolve(output,"index.html"),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Live Calendar — design preview</title><style>@font-face{font-family:'Noto Sans';font-weight:100 900;src:url(noto-sans.woff2) format('woff2');font-display:swap}${styles}:root{--font-noto-sans:'Noto Sans'}body{font-family:var(--font-noto-sans),sans-serif}.preview-banner{padding:14px 24px;background:#06283b;color:white;font-size:13px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}.preview-banner a{color:white;margin-left:12px}.preview-banner{position:relative;z-index:21}@media(max-width:600px){.preview-banner{padding:12px}}</style><body><header class="preview-banner"><span>Design preview · synthetic data · no database writes</span><nav><a href="?mode=admin">Super Admin</a><a href="?mode=single">One-store customer</a><a href="?mode=multi">Multi-store customer</a><a href="?mode=disabled">Disabled module</a></nav></header><div id="preview"></div><script src="preview.js"></script></body></html>`);
console.log(`Preview written to ${output}`);
