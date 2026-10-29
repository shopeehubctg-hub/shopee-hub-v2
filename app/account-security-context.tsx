"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type AccountSecurityStatus = {
  enabled: true;
  enrolled: boolean;
  credential_version: string;
  latest_request: null | { id: string; purpose: "enroll" | "reset"; status: string; requested_at: string; expires_at: string; credential_version: string; session_matches: boolean };
  is_owner: boolean;
  pending_approvals: Array<{ id: string; target_user_id: string; target_email: string; purpose: string; requested_at: string; expires_at: string }>;
  unlocked: boolean;
  expires_at: string | null;
};
type Phase = "disabled" | "checking" | "locked" | "unlocked" | "unavailable";
type AccountSecurityContextValue = {
  enabled: boolean;
  phase: Phase;
  status: AccountSecurityStatus | null;
  epoch: number;
  isCurrentAccess: (epoch: number) => boolean;
  refresh: () => Promise<Phase | "stale">;
  lockLocal: () => void;
  unlockConfirmed: () => Promise<Phase | "stale">;
  lockConfirmed: () => Promise<Phase | "stale">;
};
const Context = createContext<AccountSecurityContextValue | null>(null);
const CHANNEL = "shopee-hub-account-lock";
const LOCK_OVERRIDE = "shopee-hub-account-lock-pending";

export function AccountSecurityProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>(enabled ? "checking" : "disabled");
  const [status, setStatus] = useState<AccountSecurityStatus | null>(null);
  const [epoch, setEpoch] = useState(0);
  const epochRef = useRef(0);
  const phaseRef = useRef<Phase>(enabled ? "checking" : "disabled");
  const requestSequence = useRef(0);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lockOverride = useRef(false);
  const bumpEpoch = useCallback(() => {
    epochRef.current += 1;
    setEpoch(epochRef.current);
  }, []);
  const isCurrentAccess = useCallback((candidate: number) =>
    !enabled || phaseRef.current === "unlocked" && epochRef.current === candidate, [enabled]);
  const clear = useCallback((broadcast: boolean) => {
    lockOverride.current = true;
    try { window.sessionStorage.setItem(LOCK_OVERRIDE, "1"); } catch { /* Browser storage is optional. */ }
    requestSequence.current += 1;
    setStatus(current => current ? { ...current, unlocked: false, expires_at: null } : null);
    phaseRef.current = "locked";
    setPhase("locked");
    bumpEpoch();
    if (broadcast) channelRef.current?.postMessage("lock");
  }, [bumpEpoch]);
  const lockLocal = useCallback(() => clear(true), [clear]);
  const refresh = useCallback(async () => {
    if (!enabled) return "disabled" as const;
    const sequence = ++requestSequence.current;
    try {
      const response = await fetch("/api/account-security", { cache: "no-store" });
      if (!response.ok) throw new Error("Account security status is unavailable.");
      const next = await response.json() as AccountSecurityStatus;
      if (sequence !== requestSequence.current) return "stale" as const;
      if (next.enabled !== true || typeof next.unlocked !== "boolean" || !Array.isArray(next.pending_approvals))
        throw new Error("Invalid Account security status.");
      const validUnlock = !lockOverride.current && next.unlocked && next.expires_at && Date.parse(next.expires_at) > Date.now();
      setStatus(next);
      const nextPhase = validUnlock ? "unlocked" : "locked";
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
      if (!validUnlock) bumpEpoch();
      return nextPhase;
    } catch {
      if (sequence !== requestSequence.current) return "stale" as const;
      setStatus(null);
      phaseRef.current = "unavailable";
      setPhase("unavailable");
      bumpEpoch();
      return "unavailable" as const;
    }
  }, [enabled, bumpEpoch]);
  const unlockConfirmed = useCallback(async () => {
    lockOverride.current = false;
    try { window.sessionStorage.removeItem(LOCK_OVERRIDE); } catch { /* Browser storage is optional. */ }
    return refresh();
  }, [refresh]);
  const lockConfirmed = useCallback(async () => {
    lockOverride.current = false;
    try { window.sessionStorage.removeItem(LOCK_OVERRIDE); } catch { /* Browser storage is optional. */ }
    return refresh();
  }, [refresh]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    try { lockOverride.current = window.sessionStorage.getItem(LOCK_OVERRIDE) === "1"; } catch { /* Browser storage is optional. */ }
    queueMicrotask(() => { if (!cancelled) void refresh(); });
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;
    channelRef.current = channel;
    if (channel) channel.onmessage = event => { if (event.data === "lock") { clear(false); void refresh(); } };
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visibility);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30_000);
    return () => {
      cancelled = true;
      requestSequence.current += 1;
      document.removeEventListener("visibilitychange", visibility);
      window.clearInterval(interval);
      channel?.close();
      channelRef.current = null;
    };
  }, [enabled, refresh, clear]);
  useEffect(() => {
    if (!enabled || phase !== "unlocked" || !status?.expires_at) return;
    const delay = Math.max(0, Date.parse(status.expires_at) - Date.now());
    const timer = window.setTimeout(() => { clear(true); void refresh(); }, delay);
    return () => window.clearTimeout(timer);
  }, [enabled, phase, status?.expires_at, clear, refresh]);
  return <Context.Provider value={{ enabled, phase, status, epoch, isCurrentAccess, refresh, lockLocal, unlockConfirmed, lockConfirmed }}>{children}</Context.Provider>;
}

export function useAccountSecurity() {
  const value = useContext(Context);
  if (!value) throw new Error("AccountSecurityProvider is required");
  return value;
}
