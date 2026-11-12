"use client";

import { useEffect, useRef, useState } from "react";

type Feature = { id:number; moduleId:string; label:string; grantedAt:string };

export function FeatureAnnouncementDialog() {
  const [features,setFeatures]=useState<Feature[]>([]);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const closeRef=useRef<HTMLButtonElement>(null);
  const dismissed = useRef(new Set<number>());
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function check() {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const response = await fetch("/api/feature-announcements", {
          cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) return;
        const result = await response.json();
        if (!controller.signal.aborted && Array.isArray(result.features)) {
          setFeatures(result.features.filter((feature: Feature) => !dismissed.current.has(feature.id)));
        }
      } catch {
        // The next poll or tab focus retries a temporary network failure.
      } finally {
        pending = false;
      }
    }
    void check();
    const timer = window.setInterval(check, 15000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  useEffect(()=>{if(features.length)closeRef.current?.focus();},[features.length]);
  if(!features.length)return null;
  async function acknowledge(){
    setSaving(true);setError("");
    try{
      const response=await fetch("/api/feature-announcements",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({ids:features.map(feature=>feature.id)})});
      if(!response.ok)throw Error();
      for (const feature of features) dismissed.current.add(feature.id);
      setFeatures(current => current.filter(feature => !dismissed.current.has(feature.id)));
    }catch{setError("Unable to save. Please try again.");}
    finally{setSaving(false);}
  }
  return <div className="feature-announcement-backdrop" role="presentation"><section className="feature-announcement" role="dialog" aria-modal="true" aria-labelledby="feature-announcement-title" onKeyDown={event=>{if(event.key==="Tab"){event.preventDefault();closeRef.current?.focus();}else if(event.key==="Escape"&&!saving){event.preventDefault();void acknowledge();}}}>
    <div className="feature-announcement-mark" aria-hidden="true">✓</div><p className="kicker">NEW ACCESS</p><h2 id="feature-announcement-title">Congratulations!</h2><p>You now have {features.length} new {features.length===1?"feature":"features"}.</p>
    <ul>{features.map(feature=><li key={feature.id}><span aria-hidden="true">✓</span>{feature.label}</li>)}</ul>
    {error&&<p className="feature-announcement-error" role="alert">{error}</p>}<button ref={closeRef} disabled={saving} onClick={acknowledge}>{saving?"Saving…":"Start exploring"}</button>
  </section></div>;
}
