"use client";
import {useEffect,useState} from "react";
import "./sidebar-navigation.css";

const groups=[{id:"analytics",label:"Analytics",items:["advertising","orders","health","protection"]},{id:"services",label:"Client Services",items:["design","live_calendar"]}];
const paths:Record<string,string>={overview:"M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",calculator:"M5 3h14v18H5z M8 7h8 M8 12h1 M14 12h1 M8 16h1 M14 16h1",packages:"m3 7 9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",advertising:"M4 17 10 11l4 3 6-9 M14 5h6v6",orders:"M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",health:"m3 12 4 0 3-7 4 14 3-7h4",protection:"m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z",design:"m4 17 12-12 3 3L7 20H4z M14 7l3 3",live_calendar:"M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16",actions:"M4 5h16 M4 12h16 M4 19h10",account:"M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h4",permissions:"M4 6h16 M4 12h16 M4 18h16 M8 4v4 M16 10v4 M10 16v4",pin:"m9 3 6 0-1 6 4 4H6l4-4z M12 13v8"};
function Icon({id}:{id:string}){return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]||paths.overview}/></svg>}
export function SidebarNavigation({items,section,onSelect,userKey,collapsed}:{items:readonly (readonly [string,string])[];section:string;onSelect:(id:string)=>void;userKey:string;collapsed:boolean}){
  const [mobileOpen,setMobileOpen]=useState(false);
  const [pins,setPins]=useState<string[]>([]);
  const [loadedKey,setLoadedKey]=useState("");
  const [expanded,setExpanded]=useState<Record<string,boolean>>({});
  const storageKey=`shopeehub:sidebar-pins:v1:${userKey}`;
  useEffect(()=>{let next:string[]=[];try{const stored=JSON.parse(localStorage.getItem(storageKey)||"[]");if(Array.isArray(stored))next=[...new Set(stored.filter((id):id is string=>typeof id==="string"))];}catch{}setPins(next);setLoadedKey(storageKey);},[storageKey]);
  const currentPins=loadedKey===storageKey?pins:[];
  function toggle(id:string){const next=currentPins.includes(id)?currentPins.filter(value=>value!==id):[...currentPins,id];setPins(next);try{localStorage.setItem(storageKey,JSON.stringify(next));}catch{}}
  const grouped=new Set(groups.flatMap(group=>group.items));
  function row([id,label]:readonly [string,string],nested=false){const pinned=currentPins.includes(id);return <div key={id} className={`nav-entry${nested?" nav-child":""}${grouped.has(id)?" nav-pinnable":""}`}><button type="button" className={`nav-link${section===id?" active":""}`} aria-current={section===id?"page":undefined} title={label} onClick={()=>{onSelect(id);setMobileOpen(false);}}><span className="nav-symbol" aria-hidden="true"><Icon id={id}/></span><span className="nav-label">{label}</span></button>{grouped.has(id)&&!collapsed&&<button type="button" className={`nav-pin${pinned?" is-pinned":""}`} aria-label={`${pinned?"Unpin":"Pin"} ${label}`} aria-pressed={pinned} onClick={()=>toggle(id)} title={pinned?"Unpin":"Pin to menu"}><Icon id="pin"/></button>}</div>}
  return <><button type="button" className="mobile-nav-toggle" aria-expanded={mobileOpen} aria-controls="dashboard-navigation" onClick={()=>setMobileOpen(open=>!open)}>{mobileOpen?"Close menu":"Menu"}</button><nav id="dashboard-navigation" className={`refined-navigation${mobileOpen?" mobile-open":""}`} aria-label="Main navigation" onKeyDown={event=>{if(event.key==="Escape")setMobileOpen(false);}}> 
    {items.filter(([id])=>!grouped.has(id)&&id!=="account"&&id!=="permissions").map(item=>row(item))}
    {items.filter(([id])=>grouped.has(id)&&currentPins.includes(id)).map(item=>row(item))}
    {groups.map(group=>{const children=items.filter(([id])=>group.items.includes(id)&&!currentPins.includes(id));if(!children.length)return null;const active=children.some(([id])=>id===section);const open=collapsed||(expanded[group.id]??active);return <div key={group.id} className="nav-group"><button type="button" className={`nav-group-toggle${active?" has-active":""}`} aria-expanded={open} onClick={()=>setExpanded(current=>({...current,[group.id]:!open}))}><span className="nav-symbol" aria-hidden="true"><Icon id={group.id==="analytics"?"advertising":"actions"}/></span><span className="nav-label">{group.label}</span><span className="nav-chevron" aria-hidden="true">{open?"⌄":"›"}</span></button>{open&&<div className="nav-children">{children.map(item=>row(item,true))}</div>}</div>})}
    <div className="nav-admin">{items.filter(([id])=>id==="account"||id==="permissions").map(item=>row(item))}</div>
  </nav></>;
}
