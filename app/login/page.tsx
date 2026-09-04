"use client";
import {FormEvent,useEffect,useState} from "react";

export default function LoginPage(){
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [message,setMessage]=useState("");const [loading,setLoading]=useState(false);
  useEffect(()=>{if(new URLSearchParams(window.location.search).get("password_reset")==="success")setMessage("Password updated. You can now sign in.")},[]);
  async function submit(event:FormEvent){event.preventDefault();setLoading(true);setMessage("");try{const response=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const data=await response.json();if(!response.ok){setMessage(data.error||"Unable to sign in");return}window.location.replace("/");}finally{setLoading(false)}}
  return <main className="login-shell"><section className="login-card"><img src="/shopee-hub-logo-transparent.png" alt="Shopee Hub"/><p className="kicker">SECURE PORTAL</p><h1>Sign in to Shopee Hub</h1><p>Use the email and password registered for your portal account.</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com"/></label><label>Password<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><a className="forgot-link" href="/forgot-password">Forgot password?</a><button disabled={loading}>{loading?"Signing in…":"Sign in"}</button></form>{message&&<p className={message.startsWith("Password updated")?"login-message":"login-message error"}>{message}</p>}</section></main>;
}
