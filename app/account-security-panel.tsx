"use client";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useAccountSecurity } from "./account-security-context";
import "./account-security.css";

function time(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "short",
  }).format(new Date(value));
}

async function post(action: string, payload: Record<string, unknown> = {}) {
  const response = await fetch("/api/account-security", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }), cache: "no-store",
  });
  const result = await response.json().catch(() => ({})) as { error?: string; outcome?: string };
  if (response.status === 429) throw new Error("Too many Account unlock attempts. Wait and try again later.");
  if (!response.ok) throw new Error(result.error || "Account security action failed. Please retry.");
  return result;
}

function requestGuidance(request: { status: string; expires_at: string; session_matches: boolean }) {
  if (request.status === "pending" || request.status === "approved") {
    if (Date.parse(request.expires_at) <= Date.now())
      return "This request has expired. Refresh status, then submit a new request.";
    if (!request.session_matches)
      return "This request belongs to another Dashboard session. You can try a new request; if that session is still active, wait until this request expires.";
  }
  switch (request.status) {
    case "pending": return "Waiting for the bound owner's decision.";
    case "approved": return "Approved. Set your Account password before this request expires.";
    case "rejected": return "The owner rejected this request. You may submit a new request.";
    case "expired": return "This request expired. Submit a new request.";
    case "revoked": return "This request is no longer valid. Submit a new request.";
    case "consumed": return "Your Account password was set. Unlock Account to continue.";
    default: return "Refresh Account status before continuing.";
  }
}
function purposeLabel(purpose: string) { return purpose === "enroll" ? "first access" : "password reset"; }

export function AccountSecurityPanel() {
  const security = useAccountSecurity();
  const { phase, status } = security;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [dashboardPassword, setDashboardPassword] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const errorId = useId();
  const accountPasswordRef = useRef<HTMLInputElement>(null);
  const dashboardPasswordRef = useRef<HTMLInputElement>(null);
  const newAccountPasswordRef = useRef<HTMLInputElement>(null);
  const confirmPasswordRef = useRef<HTMLInputElement>(null);
  const ownerPasswordRef = useRef<HTMLInputElement>(null);
  const previousPhase = useRef(phase);
  const previousRequest = useRef(status?.latest_request?.id + ":" + status?.latest_request?.status);
  useEffect(() => {
    const requestKey = status?.latest_request?.id + ":" + status?.latest_request?.status;
    if (previousPhase.current !== phase || previousRequest.current !== requestKey) {
      setAccountPassword(""); setDashboardPassword(""); setNewAccountPassword(""); setConfirmPassword(""); setOwnerPassword("");
    }
    previousPhase.current = phase;
    previousRequest.current = requestKey;
  }, [phase, status?.latest_request?.id, status?.latest_request?.status]);

  async function act(action: string, payload: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "lock") security.lockLocal();
      const result = await post(action, payload);
      setAccountPassword(""); setDashboardPassword(""); setNewAccountPassword(""); setConfirmPassword(""); setOwnerPassword("");
      if (action === "unlock") {
        const confirmed = await security.unlockConfirmed();
        if (confirmed !== "unlocked") throw new Error("Account unlock could not be confirmed. Please retry.");
      }
      else if (action === "lock") await security.lockConfirmed();
      else await security.refresh();
      setNotice(action === "request" ? "Request submitted for owner approval."
        : action === "decide" ? (result.outcome === "approved" ? "Request approved." : "Request rejected.")
        : action === "setup" ? "Account password set. Unlock Account to continue."
        : action === "unlock" ? "Account unlocked." : "Account locked.");
    } catch (cause) {
      setAccountPassword(""); setDashboardPassword(""); setNewAccountPassword(""); setConfirmPassword(""); setOwnerPassword("");
      setError(cause instanceof Error ? cause.message : "Account security action failed. Please retry.");
      window.requestAnimationFrame(() => {
        if (action === "unlock") accountPasswordRef.current?.focus();
        else if (action === "decide") ownerPasswordRef.current?.focus();
        else if (action === "setup") {
          if (cause instanceof Error && cause.message.includes("Dashboard password")) dashboardPasswordRef.current?.focus();
          else newAccountPasswordRef.current?.focus();
        }
      });
    } finally { setBusy(false); }
  }
  function submitSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newAccountPassword !== confirmPassword) {
      setError("The Account passwords do not match.");
      confirmPasswordRef.current?.focus();
      return;
    }
    if (!status?.latest_request) return;
    void act("setup", {
      challengeId: status.latest_request.id, dashboardPassword, newAccountPassword,
    });
  }
  const request = status?.latest_request;
  const activeRequest = request?.session_matches && (request.status === "pending" || request.status === "approved") &&
    Date.parse(request.expires_at) > Date.now();
  const awaitingSetup = activeRequest && request?.status === "approved";
  const awaitingOwner = activeRequest && request?.status === "pending";
  const canRequest = status && !activeRequest && phase !== "unlocked";

  if (!security.enabled) return null;
  return <section className="account-security-panel" aria-label="Account security">
    <div className="account-security-heading">
      <div><p className="kicker">ACCOUNT SECURITY</p><h2>{phase === "unlocked" ? "Account is unlocked" : "Verify to access Account"}</h2></div>
      {phase === "unlocked" && <button type="button" disabled={busy} onClick={() => void act("lock")}>Lock Account</button>}
    </div>
    {phase === "checking" && <p role="status">Checking Account access…</p>}
    {phase === "unavailable" && <div role="alert"><p>Account security is temporarily unavailable.</p><button type="button" onClick={() => void security.refresh()}>Retry</button></div>}
    {error && <p id={errorId} className="account-security-error" role="alert">{error}</p>}
    {notice && <p className="account-security-notice" role="status">{notice}</p>}
    {phase === "unlocked" && <p role="status">Access expires {time(status?.expires_at)} MYT. You can lock Account without signing out of Dashboard.</p>}
    {phase === "locked" && status && <>
      {request && <p role="status">Latest {purposeLabel(request.purpose)} request: {requestGuidance(request)} Request expiry {time(request.expires_at)} MYT.</p>}
      {awaitingOwner && <p>The bound owner must approve this request before you can set an Account password.</p>}
      {awaitingSetup && <form onSubmit={submitSetup} className="account-security-form">
        <h3>Set your Account password</h3>
        <p>Use your current Dashboard password to confirm your identity. Choose a different password for Account.</p>
        <label>Current Dashboard password<input ref={dashboardPasswordRef} type="password" autoComplete="current-password" aria-describedby={error ? errorId : undefined} value={dashboardPassword} onChange={event => setDashboardPassword(event.target.value)} required /></label>
        <label>New Account password<input ref={newAccountPasswordRef} type="password" autoComplete="new-password" minLength={12} maxLength={128} aria-describedby={error ? errorId : undefined} value={newAccountPassword} onChange={event => setNewAccountPassword(event.target.value)} required /></label>
        <label>Confirm Account password<input ref={confirmPasswordRef} type="password" autoComplete="new-password" aria-invalid={error.includes("do not match") || undefined} aria-describedby={error ? errorId : undefined} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required /></label>
        <button type="submit" disabled={busy}>{busy ? "Checking…" : "Set Account password"}</button>
      </form>}
      {status.enrolled && !activeRequest && <form onSubmit={event => { event.preventDefault(); void act("unlock", { accountPassword }); }} className="account-security-form">
        <label>Account password<input ref={accountPasswordRef} type="password" autoComplete="off" aria-describedby={error ? errorId : undefined} value={accountPassword} onChange={event => setAccountPassword(event.target.value)} required /></label>
        <button type="submit" disabled={busy}>{busy ? "Checking…" : "Unlock Account"}</button>
      </form>}
      {canRequest && <div className="account-security-actions">
        <button type="button" disabled={busy} onClick={() => void act("request", { purpose: status.enrolled ? "reset" : "enroll" })}>
          {status.enrolled ? "Request password reset" : "Request first Account access"}
        </button>
      </div>}
    </>}
    {status?.is_owner && <section className="account-approval-queue" aria-label="Pending Account approvals">
      <h3>Requests awaiting your approval</h3>
      {status.pending_approvals.length === 0 ? <p>No pending requests.</p> : <>
        <label>Your current Dashboard password<input ref={ownerPasswordRef} type="password" autoComplete="current-password" aria-describedby={error ? errorId : undefined} value={ownerPassword} onChange={event => setOwnerPassword(event.target.value)} /></label>
        <ul>{status.pending_approvals.map(item => <li key={item.id}>
          <div><strong>{item.target_email}</strong><span>{purposeLabel(item.purpose)} · requested {time(item.requested_at)} MYT · expires {time(item.expires_at)} MYT</span></div>
          <div className="account-security-actions">
            <button type="button" aria-label={`Approve ${purposeLabel(item.purpose)} request for ${item.target_email}, request ${item.id}`} disabled={busy || !ownerPassword} onClick={() => void act("decide", { challengeId: item.id, decision: "approve", dashboardPassword: ownerPassword })}>Approve</button>
            <button type="button" aria-label={`Reject ${purposeLabel(item.purpose)} request for ${item.target_email}, request ${item.id}`} disabled={busy || !ownerPassword} onClick={() => void act("decide", { challengeId: item.id, decision: "reject", dashboardPassword: ownerPassword })}>Reject</button>
          </div>
        </li>)}</ul>
      </>}
    </section>}
  </section>;
}
