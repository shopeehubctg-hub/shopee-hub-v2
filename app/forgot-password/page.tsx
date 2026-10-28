"use client";
import { FormEvent, useState } from "react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError(false);
    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error || "Unable to process this request. Please contact a Shopee Hub Specialist.");
        setError(true);
        return;
      }
      setMessage(data.message || "If this email has portal access, a password link will arrive shortly.");
    } catch {
      setMessage("Unable to process this request. Please contact a Shopee Hub Specialist.");
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return <main className="login-shell"><section className="login-card"><p className="kicker">PASSWORD RESET</p><h1>Reset your password</h1><p>Enter the email registered for your portal account. We will send a time-limited password link.</p><form onSubmit={submit}><label>Email address<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label><button disabled={loading}>{loading ? "Sending…" : "Send password link"}</button></form>{message && <p className={error ? "login-message error" : "login-message"}>{message}</p>}<a href="/login">Back to sign in</a></section></main>;
}
