"use client";

import { useState } from "react";
import "./portal-sign-out.css";

export function PortalSignOut() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const response = await fetch("/api/auth/session", { method: "DELETE" });
      if (!response.ok && response.status !== 401) throw new Error("Sign-out failed");
      window.location.replace("/login");
    } catch {
      setError(true);
      setPending(false);
    }
  }

  return (
    <div className="portal-sign-out">
      <button type="button" onClick={signOut} disabled={pending}>
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p role="alert">Could not sign out. Try again.</p>}
    </div>
  );
}
