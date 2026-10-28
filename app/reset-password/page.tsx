"use client";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPassword() {
  const [accessToken, setAccessToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get("access_token") || "";
    if (!token || !["recovery", "invite"].includes(params.get("type") || "")) {
      queueMicrotask(() => setMessage("This password link is invalid or expired. Request a new link."));
    } else {
      queueMicrotask(() => setAccessToken(token));
    }
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!accessToken) { setMessage("Request a new password link."); return; }
    if (password !== confirm) { setMessage("Passwords do not match."); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, password }),
      });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error || "Unable to reset password."); return; }
      window.location.replace("/");
    } catch {
      setMessage("Unable to reset password. Please contact a Shopee Hub Specialist.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell"><section className="login-card"><p className="kicker">SECURE PORTAL</p><h1>Choose a new password</h1><p>Use the link sent to your registered email. It expires and can be used only for your account.</p>{accessToken && <form onSubmit={submit}><label>New password<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e => setPassword(e.target.value)}/></label><label>Confirm password<input type="password" autoComplete="new-password" minLength={12} required value={confirm} onChange={e => setConfirm(e.target.value)}/></label><button disabled={loading}>{loading ? "Saving…" : "Save new password"}</button></form>}{message && <p className="login-message error">{message}</p>}<a href="/forgot-password">Request a new link</a></section></main>;
}
