"use client";

import { useEffect, useRef, useState } from "react";

type Feature = { id:number; moduleId:string; label:string; grantedAt:string };

export function FeatureAnnouncementDialog() {
  const [features,setFeatures]=useState<Feature[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const closeRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    let active=true;
    fetch("/api/feature-announcements",{cache:"no-store"}).then(async response=>response.ok?response.json():null).then(result=>{if(active&&Array.isArray(result?.features))setFeatures(result.features);}).catch(()=>{});
    return()=>{active=false;};
  },[]);
  useEffect(()=>{if(features.length)closeRef.current?.focus();},[features.length]);
  if(!features.length)return null;
  async function acknowledge(){
    setSaving(true);setError("");
    try{
      const response=await fetch("/api/feature-announcements",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:features.map(feature=>feature.id)})});
      if(!response.ok)throw Error();
      setFeatures([]);
    }catch{setError("Unable to save. Please try again.");}
    finally{setSaving(false);}
  }
  return <div className="feature-announcement-backdrop" role="presentation"><section className="feature-announcement" role="dialog" aria-modal="true" aria-labelledby="feature-announcement-title">
    <div className="feature-announcement-mark" aria-hidden="true">✓</div><p className="kicker">NEW ACCESS</p><h2 id="feature-announcement-title">Congratulations!</h2><p>You now have {features.length} new {features.length===1?"feature":"features"}.</p>
    <ul>{features.map(feature=><li key={feature.id}><span aria-hidden="true">✓</span>{feature.label}</li>)}</ul>
    {error&&<p className="feature-announcement-error" role="alert">{error}</p>}<button ref={closeRef} disabled={saving} onClick={acknowledge}>{saving?"Saving…":"Start exploring"}</button>
  </section></div>;
}
