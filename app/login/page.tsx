"use client";
import {FormEvent,useState} from "react";

export default function LoginPage(){
  const [email,setEmail]=useState("");const [message,setMessage]=useState("");const [loading,setLoading]=useState(false);
  async function submit(event:FormEvent){event.preventDefault();setLoading(true);setMessage("");try{const response=await fetch("/api/auth/request-link",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});const data=await response.json();setMessage(data.message||data.error||"Please check your email.");}finally{setLoading(false)}}
  return <main className="login-shell"><section className="login-card"><img src="/shopee-hub-logo-transparent.png" alt="Shopee Hub"/><p className="kicker">SECURE PORTAL</p><h1>Sign in to Shopee Hub</h1><p>Enter your authorised portal email. We will send you a secure one-time sign-in link.</p><form onSubmit={submit}><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label><button disabled={loading}>{loading?"Sending…":"Send sign-in link"}</button></form>{message&&<p className="login-message">{message}</p>}</section></main>;
}
